"""基板を組み立てる (2 段目): 自動配線の結果を取り込み、GND のベタと縫いのビアとシルクを足して仕上げる。

入力: build/pre_route.kicad_pcb (make_board.py)、build/route.ses (route.sh)
出力: pcie-tuner-board.kicad_pcb

使い方: "C:\\Program Files\\KiCad\\10.0\\bin\\python.exe" scripts/finish_board.py
"""
from __future__ import annotations

import math
import os
import sys

import pcbnew

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from board_lib import B, F, OX, OY, ROOT, fix_paper, mm, pt, unpt  # noqa: E402
from make_board import H, J1Y, J2Y, J4X, J4Y, LEDS, SLOT, STEP_X, STEP_Y, U1X, U1Y, U4X, U4Y, W  # noqa: E402

SILK = pcbnew.F_SilkS


def add_zone(b, net, layer, pts, name):
    z = pcbnew.ZONE(b)
    z.SetLayer(layer)
    z.SetNet(net)
    ol = z.Outline()
    ol.NewOutline()
    for x, y in pts:
        ol.Append(mm(x + OX), mm(y + OY))
    z.SetLocalClearance(mm(0.25))
    z.SetMinThickness(mm(0.25))
    # パッドは細い橋 (サーマル) でつなぐ: はんだ付けのとき熱が逃げすぎないように。ビアは全面でつながる
    z.SetPadConnection(pcbnew.ZONE_CONNECTION_THERMAL)
    z.SetThermalReliefGap(mm(0.25))
    z.SetThermalReliefSpokeWidth(mm(0.4))
    z.SetIslandRemovalMode(pcbnew.ISLAND_REMOVAL_MODE_ALWAYS)
    z.SetZoneName(name)
    b.Add(z)
    return z


def fill(b):
    pcbnew.ZONE_FILLER(b).Fill(b.Zones())


def in_fill(z, layer, x, y, r):
    """(x, y) を中心に半径 r の円が、ベタの塗りの中に収まっているか (中心と円周の 8 点で見る)。"""
    for i in range(9):
        if i == 0:
            px, py = x, y
        else:
            a = math.radians(45 * i)
            px, py = x + r * math.cos(a), y + r * math.sin(a)
        if not z.HitTestFilledArea(layer, pt(px, py), 0):
            return False
    return True


def stitch(b, gnd, zt, zb, step=2.5):
    """おもてとうらの GND のベタを、格子の上のビアで縫う。両面とも塗りの中で、部品の下でない所にだけ置く。"""
    boxes = []
    for fp in b.GetFootprints():
        bb = fp.GetCourtyard(F).BBox()
        if bb.GetWidth() > 0:
            boxes.append((pcbnew.ToMM(bb.GetLeft()) - OX - 0.5, pcbnew.ToMM(bb.GetTop()) - OY - 0.5,
                          pcbnew.ToMM(bb.GetRight()) - OX + 0.5, pcbnew.ToMM(bb.GetBottom()) - OY + 0.5))
    near = [unpt(v.GetPosition()) for v in b.GetTracks() if v.Type() == pcbnew.PCB_VIA_T]   # すでにあるビア
    n = 0
    y = 1.5
    while y <= H - 1.5:
        x = 1.5
        while x <= W - 1.5:
            if not any(x1 <= x <= x2 and y1 <= y <= y2 for x1, y1, x2, y2 in boxes) \
                    and not any(math.hypot(x - vx, y - vy) < 1.2 for vx, vy in near) \
                    and in_fill(zt, F, x, y, 0.7) and in_fill(zb, B, x, y, 0.7):
                v = pcbnew.PCB_VIA(b)
                v.SetPosition(pt(x, y))
                v.SetViaType(pcbnew.VIATYPE_THROUGH)
                v.SetWidth(F, mm(0.6))
                v.SetDrill(mm(0.3))
                v.SetLayerPair(F, B)
                v.SetNet(gnd)
                b.Add(v)
                n += 1
            x += step
        y += step
    return n


def island_vias(b, gnd, zt, zb):
    """GND のビアもスルーホールのパッドも入っていない、ベタの島を見つけて、中にビアを 1 つ置く。"""
    pts = [v.GetPosition() for v in b.GetTracks() if v.Type() == pcbnew.PCB_VIA_T and v.GetNetCode() == gnd.GetNetCode()]
    for fp in b.GetFootprints():
        for pd in fp.Pads():
            if pd.GetNetCode() == gnd.GetNetCode() and pd.GetAttribute() == pcbnew.PAD_ATTRIB_PTH:
                pts.append(pd.GetPosition())
    added, failed = 0, []
    for z, layer in ((zt, F), (zb, B)):
        polys = z.GetFilledPolysList(layer)
        for i in range(polys.OutlineCount()):
            ol = polys.Outline(i)
            bb = ol.BBox()
            sub = pcbnew.SHAPE_POLY_SET()
            sub.AddOutline(ol)
            for h in range(polys.HoleCount(i)):
                sub.AddHole(polys.Hole(i, h))
            if any(bb.Contains(p) and sub.Contains(p) for p in pts):
                continue
            x1, y1 = unpt(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop()))
            x2, y2 = unpt(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
            done = False
            y = y1 + 0.35
            while y < y2 and not done:
                x = x1 + 0.35
                while x < x2 and not done:
                    if sub.Contains(pt(x, y)) and in_fill(zt, F, x, y, 0.33) and in_fill(zb, B, x, y, 0.33):
                        v = pcbnew.PCB_VIA(b)
                        v.SetPosition(pt(x, y))
                        v.SetViaType(pcbnew.VIATYPE_THROUGH)
                        v.SetWidth(F, mm(0.6))
                        v.SetDrill(mm(0.3))
                        v.SetLayerPair(F, B)
                        v.SetNet(gnd)
                        b.Add(v)
                        pts.append(v.GetPosition())
                        added += 1
                        done = True
                    x += 0.15
                y += 0.15
            if not done:
                failed.append((b.GetLayerName(layer), round((x1 + x2) / 2, 2), round((y1 + y2) / 2, 2),
                               round(x2 - x1, 2), round(y2 - y1, 2)))
    return added, failed


def join_islands(b, gnd, zt, zb):
    """おもてとうらの GND のベタの島を、ビアとスルーホールのパッドでつながる組に分け、いちばん大きい組に
    つながっていない組があれば、その島と、大きい組の (反対の面の) 島が重なる所にビアを 1 つ足す。
    (うらの線でうらのベタが区切られ、おもてもまわりを線に囲まれていると、ビアがあっても全体から浮く。)"""
    isl = []                                    # (面, 島の SHAPE_POLY_SET, 外接の四角, 面積)
    for z, layer in ((zt, F), (zb, B)):
        polys = z.GetFilledPolysList(layer)
        for i in range(polys.OutlineCount()):
            sub = pcbnew.SHAPE_POLY_SET()
            sub.AddOutline(polys.Outline(i))
            for h in range(polys.HoleCount(i)):
                sub.AddHole(polys.Hole(i, h))
            isl.append((layer, sub, polys.Outline(i).BBox(), sub.Area()))
    parent = list(range(len(isl)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def at(pos, layer, slack=0):
        for i, (lay, sub, bb, _a) in enumerate(isl):
            if lay == layer and (sub.Contains(pos, -1, slack) if slack else bb.Contains(pos) and sub.Contains(pos)):
                return i
        return None

    links = [(v.GetPosition(), 0) for v in b.GetTracks() if v.Type() == pcbnew.PCB_VIA_T and v.GetNetCode() == gnd.GetNetCode()]
    for fp in b.GetFootprints():
        for pd in fp.Pads():
            if pd.GetNetCode() == gnd.GetNetCode() and pd.GetAttribute() == pcbnew.PAD_ATTRIB_PTH:
                links.append((pd.GetPosition(), max(pd.GetSizeX(), pd.GetSizeY()) // 2 + mm(0.45)))
    for pos, slack in links:
        i, j = at(pos, F, slack), at(pos, B, slack)
        if i is not None and j is not None:
            parent[find(i)] = find(j)
    big = find(max(range(len(isl)), key=lambda i: isl[i][3]))
    todo = {}
    for i in range(len(isl)):
        if find(i) != big:
            todo.setdefault(find(i), []).append(i)
    added, failed = 0, []
    for root, members in todo.items():
        if not any(isl[i][3] > mm(1.0) * mm(1.0) and any(at(pos, isl[i][0], s) == i for pos, s in links) for i in members):
            continue                            # ビアもパッドも無い切れ端 (KiCad が消すか、パッドにぶら下がっているだけ)
        done = False
        for i in sorted(members, key=lambda i: -isl[i][3]):
            layer, sub, bb, _a = isl[i]
            other = B if layer == F else F
            x1, y1 = unpt(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop()))
            x2, y2 = unpt(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
            y = y1 + 0.4
            while y < y2 and not done:
                x = x1 + 0.4
                while x < x2 and not done:
                    if sub.Contains(pt(x, y)) and in_fill(zt, F, x, y, 0.36) and in_fill(zb, B, x, y, 0.36):
                        j = at(pt(x, y), other)
                        if j is not None and find(j) == big:
                            v = pcbnew.PCB_VIA(b)
                            v.SetPosition(pt(x, y))
                            v.SetViaType(pcbnew.VIATYPE_THROUGH)
                            v.SetWidth(F, mm(0.6))
                            v.SetDrill(mm(0.3))
                            v.SetLayerPair(F, B)
                            v.SetNet(gnd)
                            b.Add(v)
                            added += 1
                            done = True
                    x += 0.2
                y += 0.2
            if done:
                break
        if not done:
            bb = isl[members[0]][2]
            failed.append(tuple(round(v, 1) for v in unpt(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop()))))
    return added, failed


def text(b, s, x, y, size=1.0, thick=0.15, rot=0):
    t = pcbnew.PCB_TEXT(b)
    t.SetText(s)
    t.SetPosition(pt(x, y))
    t.SetLayer(SILK)
    t.SetTextSize(pcbnew.VECTOR2I(mm(size), mm(size)))
    t.SetTextThickness(mm(thick))
    t.SetTextAngleDegrees(rot)
    b.Add(t)


def dot(b, x, y, r=0.2):
    s = pcbnew.PCB_SHAPE(b)
    s.SetShape(pcbnew.SHAPE_T_CIRCLE)
    s.SetCenter(pt(x, y))
    s.SetEnd(pt(x + r / 2, y))
    s.SetLayer(SILK)
    s.SetWidth(mm(r))
    b.Add(s)


# シルクの文字 (文字, x, y[, 大きさ, 線の太さ])。大きさは JLCPCB の最小 (高さ 1.0mm・線 0.15mm) 以上
TEXTS = [
    ("outboard", W - 5.1, 10.0, 1.3, 0.2),
    ("PCIe PWR", W - 5.1, 11.8),
    ("rev D", W - 5.1, 13.4),
    ("2026-11", W - 5.1, 15.0),
    ("BRACKET", 5.0, 8.4, 0.9),
    # J4 (横向き)。数字のある列 = 奇数の列 (1・3・5・7・9) = 下の段 (基板に近い側)。カードの 1 列 5 ピンのケーブルはこの段に挿す
    ("J4 USB 1=5V", 21.9, J4Y + 4.55),
    ("ODD = LOWER ROW", 21.9, J4Y + 6.35),
    ("1", J4X + 5.08, J4Y + 2.98, 0.9), ("3", J4X + 2.54, J4Y + 2.98, 0.9), ("5", J4X, J4Y + 2.98, 0.9),
    ("7", J4X - 2.54, J4Y + 2.98, 0.9), ("9", J4X - 5.08, J4Y + 2.98, 0.9),
    ("1 PC", 12.3, J1Y - 3.8, 1.2, 0.18),
    ("2 CHG", 24.0, J2Y + 4.7, 1.2, 0.18),
    ("3V3", LEDS[0][1], H - 2.9),
    ("STAT", LEDS[1][1], H - 2.9),
    ("12V ON", 73.8, 26.9),
    ("SWIO", U4X - 3.7, 35.4, 0.9), ("GND", U4X - 3.7, 37.9, 0.9),
    ("VIN", 44.2, 34.9),
    ("3V3", 78.0, 5.9),
    ("12V", 44.6, 22.6),
    ("GND", 86.5, 2.5),
    ("JP1 3V3", 83.5, 12.9),
    ("JP2 12V", 60.5, 23.3),
]

# 1 番ピンの印 (参照名, 印の位置)。make_board.py の配置と合わせてある
PIN1 = [("U1", U1X + 4.25, U1Y + 2.7), ("U2", 17.55, J2Y + 3.55), ("U4", U4X + 0.9, U4Y + 1.9), ("U5", 17.4, J1Y + 2.95),
        ("U6", 50.4, 22.55)]

# 自動で置き場所が見つからなかった部品番号の位置 (手で決める。x, y, 角度)
REF_FIXED = {"Q3": (W - 5.0, 27.6, 0), "TP4": (68.3, 36.2, 90), "R20": (60.5, 41.75, 0), "C25": (58.65, 29.3, 0)}
REF_SIZE = 0.8      # 部品番号の文字の高さ (mm)。線は 0.15mm


def _box(cx, cy, w, h):
    return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


def _hit(a, b, m=0.0):
    return a[0] < b[2] + m and b[0] < a[2] + m and a[1] < b[3] + m and b[1] < a[3] + m


def place_refs(b, texts):
    """部品番号を全部シルクに出す。パッド・ほかのシルク・ほかの文字に重ならない所を、部品のまわりから探す。
    見つからなかった部品の番号は、シルクに出さない (戻り値の一覧)。"""
    blocks = []                      # 文字を置いてはいけない四角
    for fp in b.GetFootprints():
        for pd in fp.Pads():
            bb = pd.GetBoundingBox()
            x1, y1 = unpt(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop()))
            x2, y2 = unpt(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
            blocks.append((x1 - 0.2, y1 - 0.2, x2 + 0.2, y2 + 0.2))
        for g in fp.GraphicalItems():
            if g.GetLayer() == SILK:
                bb = g.GetBoundingBox()
                x1, y1 = unpt(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop()))
                x2, y2 = unpt(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
                if (x2 - x1) * (y2 - y1) < 30:       # 大きな枠 (スロットの外形など) は線ごとの四角にならないので除く
                    blocks.append((x1 - 0.1, y1 - 0.1, x2 + 0.1, y2 + 0.1))
    for t in texts:
        size = t[3] if len(t) > 3 else 1.0
        blocks.append(_box(t[1], t[2], len(t[0]) * size * 0.95 + 0.3, size * 1.2 + 0.2))
    for _r, x, y in PIN1:
        blocks.append(_box(x, y, 0.8, 0.8))
    failed = []
    fps = sorted(b.GetFootprints(), key=lambda f: f.GetReference())
    for fp in fps:
        ref = fp.GetReference()
        cb = fp.GetCourtyard(F).BBox()
        x1, y1 = unpt(pcbnew.VECTOR2I(cb.GetLeft(), cb.GetTop()))
        x2, y2 = unpt(pcbnew.VECTOR2I(cb.GetRight(), cb.GetBottom()))
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
        tw, th = len(ref) * REF_SIZE * 0.95 + 0.2, REF_SIZE * 1.2
        found = None
        for d in (0.0, 0.4, 0.8, 1.3, 1.9, 2.6, 3.4, 4.3):
            cands = [(cx, y1 - th / 2 - d, 0), (cx, y2 + th / 2 + d, 0), (x2 + tw / 2 + d, cy, 0),
                     (x1 - tw / 2 - d, cy, 0), (x1 - th / 2 - d, cy, 90), (x2 + th / 2 + d, cy, 90),
                     (x1 + tw / 2, y1 - th / 2 - d, 0), (x2 - tw / 2, y1 - th / 2 - d, 0),
                     (x1 + tw / 2, y2 + th / 2 + d, 0), (x2 - tw / 2, y2 + th / 2 + d, 0),
                     (cx, y1 - tw / 2 - d, 90), (cx, y2 + tw / 2 + d, 90)]
            for px, py, rot in cands:
                bx = _box(px, py, th, tw) if rot else _box(px, py, tw, th)
                if bx[0] < 0.5 or bx[1] < 0.5 or bx[2] > W - 0.5 or bx[3] > H - 0.5:
                    continue
                if bx[0] < STEP_X + 0.5 and bx[1] < STEP_Y + 0.5:      # ブラケットをよけて引っ込めた所
                    continue
                if any(_hit(bx, k) for k in blocks):
                    continue
                found = (px, py, rot, bx)
                break
            if found:
                break
        r = fp.Reference()
        if not found and ref in REF_FIXED:
            px, py, rot = REF_FIXED[ref]
            found = (px, py, rot, _box(px, py, th, tw) if rot else _box(px, py, tw, th))
        if not found:
            failed.append(ref)
            r.SetVisible(False)
            continue
        r.SetLayer(SILK)
        r.SetVisible(True)
        r.SetPosition(pt(found[0], found[1]))
        r.SetTextSize(pcbnew.VECTOR2I(mm(REF_SIZE), mm(REF_SIZE)))
        r.SetTextThickness(mm(0.15))
        r.SetTextAngleDegrees(found[2])
        r.SetKeepUpright(True)
        blocks.append(found[3])
    return failed


def silk(b):
    # 基板の外にはみ出す、部品のシルクの線を消す (USB-C の口とスイッチのつまみ)
    for ref in ("J1", "J2"):
        fp = b.FindFootprintByReference(ref)
        for g in list(fp.GraphicalItems()):
            if g.GetLayer() != SILK:
                continue
            bb = g.GetBoundingBox()
            x1, y1 = unpt(pcbnew.VECTOR2I(bb.GetLeft(), bb.GetTop()))
            x2, y2 = unpt(pcbnew.VECTOR2I(bb.GetRight(), bb.GetBottom()))
            if x1 < 0.5 or y1 < 0.5 or x2 > W - 0.5 or y2 > H - 0.5:
                fp.Remove(g)
    for t in TEXTS:
        text(b, *t)
    for _ref, x, y in PIN1:
        dot(b, x, y)
    failed = place_refs(b, TEXTS)
    print("reference designators on silk:", len(b.GetFootprints()) - len(failed), "not placed:", " ".join(failed) or "-")


def _inside(poly, x, y):
    n, c = len(poly), False
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < x1 + (x2 - x1) * (y - y1) / (y2 - y1):
            c = not c
    return c


def _dseg(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    u = 0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
    return math.hypot(px - (ax + u * dx), py - (ay + u * dy))


def import_ses():
    """自動配線の結果を取り込んで build/routed.kicad_pcb に保存する。
    (1 つの Python の中で基板を 2 回読むと pcbnew の型がこわれるので、取り込みと仕上げは別のプロセスにする)

    取り込んだあと、どこにもつながっていない線の端と、片方の面にしかつながっていないビアを消す。
    手で引いた線は「ここから先は自動配線に任せる」所で止めてあり、自動配線が別の所につないだときに
    その先が余るため。GND の線とビアには触らない (GND のベタは、このあと finish で足す)。"""
    src = os.path.join(ROOT, "build", "pre_route.kicad_pcb")
    ses = os.path.join(ROOT, "routing", "route.ses")
    b = pcbnew.LoadBoard(src)
    gnd = b.FindNet("/GND").GetNetCode()
    pads, zones = [], []
    for fp in b.GetFootprints():
        for pd in fp.Pads():
            bb = pd.GetBoundingBox()
            th = pd.GetAttribute() == pcbnew.PAD_ATTRIB_PTH
            pads.append((pd.GetNetCode(), None if th else (F if pd.IsOnLayer(F) else B), bb.GetLeft(), bb.GetTop(), bb.GetRight(),
                         bb.GetBottom()))        # rev D: J3 の A 列はうらの面のパッド
    for z in b.Zones():
        if not z.GetIsRuleArea():
            ch = z.Outline().Outline(0)
            zones.append((z.GetNetCode(), z.GetLayer(), [(ch.CPoint(i).x, ch.CPoint(i).y) for i in range(ch.PointCount())]))
    n0 = len(b.GetTracks())
    ok = pcbnew.ImportSpecctraSES(b, ses)
    print("ImportSpecctraSES:", ok, "tracks+vias", n0, "->", len(b.GetTracks()))
    if not ok:
        return 1
    items = []
    for t in b.GetTracks():
        via = t.Type() == pcbnew.PCB_VIA_T
        if not via and t.GetWidth() < mm(0.15):
            t.SetWidth(mm(0.15))        # 自動配線がピンの間で 0.125mm にしぼった所。JLCPCB の標準の最小 0.15mm に戻す
        items.append(dict(via=via, net=t.GetNetCode(), layer=None if via else t.GetLayer(), x1=t.GetStartX(),
                          y1=t.GetStartY(), x2=t.GetEndX(), y2=t.GetEndY(),
                          w=t.GetWidth(F) if via else t.GetWidth(), obj=t))
    tol = mm(0.02)
    alive = [it for it in items if it["net"] != gnd]

    def touches(it, x, y, layer):
        """点 (x, y) が、layer の面で、it 以外の同じネットの銅 (パッド・面・線・ビア) に乗っているか。"""
        for net, lay, l, tp, r, bt in pads:
            if net == it["net"] and (lay is None or lay == layer) and l - tol <= x <= r + tol and tp - tol <= y <= bt + tol:
                return True
        for net, lay, poly in zones:
            if net == it["net"] and lay == layer and _inside(poly, x, y):
                return True
        for o in alive:
            if o is it or o["net"] != it["net"]:
                continue
            if o["via"]:
                if math.hypot(o["x1"] - x, o["y1"] - y) <= o["w"] / 2 + tol:
                    return True
            elif o["layer"] == layer and _dseg(x, y, o["x1"], o["y1"], o["x2"], o["y2"]) <= o["w"] / 2 + tol:
                return True
        return False

    def trim(it):
        """片方の端だけ浮いている線: 途中にほかの線やビアがつながっていれば、浮いた端をそこまで縮める。"""
        ok1 = touches(it, it["x1"], it["y1"], it["layer"])
        ok2 = touches(it, it["x2"], it["y2"], it["layer"])
        if ok1 == ok2:
            return False
        cx, cy = (it["x1"], it["y1"]) if ok1 else (it["x2"], it["y2"])     # つながっている端
        best = None
        for o in alive:
            if o is it or o["net"] != it["net"] or not (o["via"] or o["layer"] == it["layer"]):
                continue
            for x, y in ((o["x1"], o["y1"]), (o["x2"], o["y2"])):
                if _dseg(x, y, it["x1"], it["y1"], it["x2"], it["y2"]) <= tol:
                    d = math.hypot(x - cx, y - cy)
                    if d > mm(0.05) and (best is None or d > best[0]):
                        best = (d, x, y)
        if best is None:
            return False
        pos = pcbnew.VECTOR2I(int(best[1]), int(best[2]))
        if ok1:
            it["obj"].SetEnd(pos)
            it["x2"], it["y2"] = best[1], best[2]
        else:
            it["obj"].SetStart(pos)
            it["x1"], it["y1"] = best[1], best[2]
        return True

    dropped = 0
    while True:
        drop = []
        for it in alive:
            if it["via"]:
                if sum(1 for lay in (F, B) if touches(it, it["x1"], it["y1"], lay)) < 2:
                    drop.append(it)
            elif not (touches(it, it["x1"], it["y1"], it["layer"]) and touches(it, it["x2"], it["y2"], it["layer"])):
                if not trim(it):
                    drop.append(it)
            elif not it["obj"].IsLocked() and any(
                    o is not it and not o["via"] and o["net"] == it["net"] and o["layer"] == it["layer"]
                    and _dseg(it["x1"], it["y1"], o["x1"], o["y1"], o["x2"], o["y2"]) <= o["w"] / 2
                    and _dseg(it["x2"], it["y2"], o["x1"], o["y1"], o["x2"], o["y2"]) <= o["w"] / 2 for o in alive):
                drop.append(it)          # 自動配線が残した、ほかの線の上に乗っているだけの短い切れ端
        if not drop:
            break
        for it in drop:
            alive.remove(it)
            b.Remove(it["obj"])
        dropped += len(drop)
    print("removed dangling tracks and vias:", dropped)
    pcbnew.SaveBoard(os.path.join(ROOT, "build", "routed.kicad_pcb"), b, True)
    return 0


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "import":
        return import_ses()
    if len(sys.argv) == 1:
        import subprocess
        r = subprocess.call([sys.executable, os.path.abspath(__file__), "import"])
        if r:
            return r
    dst = os.path.join(ROOT, "pcie-tuner-board.kicad_pcb")
    b = pcbnew.LoadBoard(os.path.join(ROOT, "build", "routed.kicad_pcb"))
    gnd = b.FindNet("/GND")
    # GND のベタ (両面)。基板の外形より外まで描いておけば、外形との間隔はルール (0.3mm) で決まる
    outline = [(-1, -1), (W + 1, -1), (W + 1, H + 1), (-1, H + 1)]
    # スロットのパッドの間には、両面ともベタを入れない (細い切れ端の島ができるだけなので。GND のパッドは
    # make_board.py が線とビアでつないでいる)
    sx, sy = SLOT
    # J4 のピンの間も同じ (USB と CC の線が間を通るので、切れ端しか残らない。おもてだけ)
    for name, box, layers in (("slot-no-pour", (sx - 10.05, sy - 2.0, sx + 10.05, sy + 2.0), (F, B)),
                              ("j4-no-top-pour", (J4X - 6.2, J4Y - 2.6, J4X + 6.2, J4Y + 2.6), (F,))):
        ko = pcbnew.ZONE(b)
        ko.SetIsRuleArea(True)
        ls = pcbnew.LSET()
        for la in layers:
            ls.AddLayer(la)
        ko.SetLayerSet(ls)
        ko.SetDoNotAllowZoneFills(True)
        ko.SetDoNotAllowTracks(False)
        ko.SetDoNotAllowVias(False)
        ko.SetDoNotAllowPads(False)
        ko.SetDoNotAllowFootprints(False)
        ko.SetZoneName(name)
        kol = ko.Outline()
        kol.NewOutline()
        for x, y in ((box[0], box[1]), (box[2], box[1]), (box[2], box[3]), (box[0], box[3])):
            kol.Append(mm(x + OX), mm(y + OY))
        b.Add(ko)
    zt = add_zone(b, gnd, F, outline, "GND-top")
    zb = add_zone(b, gnd, B, outline, "GND-bottom")
    fill(b)
    n = stitch(b, gnd, zt, zb)
    print("stitching vias:", n)
    fill(b)
    for _ in range(3):
        added, failed = island_vias(b, gnd, zt, zb)
        print("island vias:", added, "islands without room for a via:", failed)
        if not added:
            break
        fill(b)
    for _ in range(6):
        added, failed = join_islands(b, gnd, zt, zb)
        print("vias joining floating GND islands:", added, "could not join:", failed)
        if not added:
            break
        fill(b)
    silk(b)
    tb = b.GetTitleBlock()
    tb.SetTitle("outboard - PCIe tuner external power board")
    tb.SetRevision("D")
    tb.SetDate("2026-11-12")
    pcbnew.SaveBoard(dst, b, True)
    fix_paper(dst)
    print("saved", dst)
    return 0


if __name__ == "__main__":
    sys.exit(main())
