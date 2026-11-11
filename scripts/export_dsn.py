"""build/pre_route.kicad_pcb を、自動配線 (freerouting) に渡す Specctra DSN に書き出す。

- build/route.dsn: 基板。GND は自動配線に引かせない (ビアとベタでつなぐ)。DSN の中で GND は「GND」という
  ネットクラスになっていて、route.sh が freerouting に無視させる。
  電源の銅の面 (VIN・VBUS の面と、うらの帯) の所は、自動配線の線とビアを通さない: KiCad の基板には無い
  「通行止め」を DSN にだけ足す (面を線が横切ると、面が切れてしまうため)。
- build/route.rules: 自動配線の設定。うらの面は GND のベタにしたいので、うらを通る線とビアのコストを高くして、
  できるだけおもてで引かせる。

使い方: "C:\\Program Files\\KiCad\\10.0\\bin\\python.exe" scripts/export_dsn.py
"""
import os
import sys

import pcbnew

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RULES = """(rules PCB route
  (snap_angle
    fortyfive_degree
  )
  (autoroute_settings
    (fanout off)
    (autoroute on)
    (postroute on)
    (vias on)
    (via_costs %(via)d)
    (plane_via_costs 5)
    (start_ripup_costs 100)
    (start_pass_no 1)
    (layer_rule F.Cu
      (active on)
      (preferred_direction horizontal)
      (preferred_direction_trace_costs 1.0)
      (against_preferred_direction_trace_costs 1.3)
    )
    (layer_rule B.Cu
      (active on)
      (preferred_direction vertical)
      (preferred_direction_trace_costs %(bot)s)
      (against_preferred_direction_trace_costs %(bot2)s)
    )
  )
)
"""


def main():
    src = os.path.join(ROOT, "build", "pre_route.kicad_pcb")
    dst = os.path.join(ROOT, "build", "route.dsn")
    b = pcbnew.LoadBoard(src)
    ok = pcbnew.ExportSpecctraDSN(b, dst)
    if not ok:
        print("ExportSpecctraDSN failed")
        return 1
    # 電源の面の「通行止め」を足す
    extra = []
    for z in b.Zones():
        if z.GetIsRuleArea() or z.GetNetname() == "/GND" or z.GetZoneName().startswith("U3-"):
            continue
        ch = z.Outline().Outline(0)
        pts = " ".join(f"{ch.CPoint(i).x // 1000} {-(ch.CPoint(i).y // 1000)}" for i in range(ch.PointCount()))
        first = f"{ch.CPoint(0).x // 1000} {-(ch.CPoint(0).y // 1000)}"
        layer = b.GetLayerName(z.GetLayer())
        for kind in ("wire_keepout", "via_keepout"):
            extra.append(f'    ({kind} "" (polygon {layer} 0  {pts}  {first}))\n')
    txt = open(dst, encoding="utf-8").read()
    i = txt.index("    (wire_keepout")
    txt = txt[:i] + "".join(extra) + txt[i:]
    with open(dst, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(txt)
    print("added keepouts over", len(extra) // 2, "power zones")
    with open(os.path.join(ROOT, "build", "route.rules"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(RULES % dict(via=int(os.environ.get("VIA_COST", "150")), bot=os.environ.get("BOT_COST", "4.0"),
                              bot2=os.environ.get("BOT_COST2", "5.0")))
    print("wrote", dst, os.path.getsize(dst))
    return 0


if __name__ == "__main__":
    sys.exit(main())
