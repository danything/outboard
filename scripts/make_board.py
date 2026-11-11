"""基板を組み立てる (1 段目): 外形・部品の配置・電源と USB と長い制御線の手配線・GND のビア・銅の面。rev C。

出力: build/pre_route.kicad_pcb (自動配線の前の基板)
このあと scripts/export_dsn.py・scripts/route.sh (freerouting)・scripts/finish_board.py (取り込み・ベタ・シルク) を実行する。

座標は基板の左上の角を (0, 0) とした mm。x は右、y は下。基板は 84 x 63mm。
左の辺 (x = 0) がカードのブラケットの側で、USB-C が 2 つ並ぶ。USB-C の口の面は x = -0.99 で、ここを
カードのブラケットの外の面に合わせてある (スロットの 1 番ピンは、そこから 47.54mm)。
上の長い辺 (y = 0) がカードのはんだ面 (A) の側、下 (y = 63) が部品面 (B) の側。
ブラケットが通る所 (y >= 44) は、左の辺を 1.5mm 引っ込めてある。

降圧・昇圧・USB の線は rev B で確かめた形のまま、回して置き直している (board_lib.py の「枠」)。

使い方: "C:\\Program Files\\KiCad\\10.0\\bin\\python.exe" scripts/make_board.py
"""
from __future__ import annotations

import os
import shutil
import sys

import pcbnew

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from board_lib import B, F, ROOT, Board, rect  # noqa: E402

W, H, R = 84.0, 63.0, 3.0
STEP_X, STEP_Y = 1.5, 44.0      # ブラケットをよける段: y >= STEP_Y では左の辺が x = STEP_X

# --- 機構の寸法 (README の「寸法の根拠」) --------------------------------------
JX = 4.08                       # USB-C の原点の x。基板の端は原点から 4.08mm、口の面は 5.07mm (EasyEDA のフットプリントの外形)
MOUTH = JX - 5.07               # USB-C の口の面 = ブラケットの外の面 (x = -0.99)
PIN1_TO_BRACKET = 47.54         # 1 番ピンの中心からブラケットの外の面まで (推定。CEM 1.2 を写したライブラリの値)
BRACKET_T = 0.86                # ブラケットの板の厚み (0.81〜0.86)
BRACKET_A, BRACKET_B = 1.78, 16.65   # ブラケットの幅: スロットの中心線から A 面の側へ・B 面の側へ (推定)
CARD_END = 45.65                # 1 番ピンからカードの基板の端 (ブラケットの側) まで
SLOT = (MOUTH + PIN1_TO_BRACKET + 9.5, 47.0)   # PCIe スロットの原点 (1 番ピンは原点から -9.5)

# --- 配置の基準になる座標 ---------------------------------------------------
J2Y, J1Y = 12.2, 30.5           # USB-C の中心の y (上が ② 充電器、下が ① PC)
BAND = (37.8, 2.4, 50.0, 27.0)  # VIN の面 (D1・D2 のカソードが乗る)
U3X, U3Y = 76.0, 16.5           # 降圧 IC (入力が上、出力が下)
U4X, U4Y = 21.0, 49.5           # 昇圧 IC (入力が左、出力が右)
U7X, U7Y = 61.0, 25.0           # マイコン
YT = SLOT[1] - 6.8              # +3V3 の幹 (スロットの上を横に走る) の y
YB = SLOT[1] + 8.7              # +3V3 の幹 (スロットの下) の y
LANE_EN, LANE_G, LANE_S = 44.05, 44.6, 45.05    # スロットの左の端を縦に通る 3 本 (EN_12V・Q2_G・12V_SENSE) の x
BUCK = dict(k=1, old=(47.0, 9.0), new=(U3X, U3Y))        # rev B の降圧のまわりを 90 度回す
BOOST = dict(k=2, old=(33.5, 40.65), new=(U4X, U4Y))     # rev B の昇圧のまわりを 180 度回す
USB1 = dict(k=2, old=(85.92, 13.5), new=(JX, J1Y))       # rev B の USB-C ① のまわりを 180 度回す
USB2 = dict(k=2, old=(85.92, 32.9), new=(JX, J2Y))
MCU = dict(k=0, old=(46.5, 29.0), new=(U7X, U7Y))


def outline(bd: Board):
    E = pcbnew.Edge_Cuts
    bd.line(E, R, 0, W - R, 0, 0.1)
    bd.arc(E, W - R, R, R, 270, 360, 0.1)
    bd.line(E, W, R, W, H - R, 0.1)
    bd.arc(E, W - R, H - R, R, 0, 90, 0.1)
    bd.line(E, W - R, H, STEP_X + R, H, 0.1)
    bd.arc(E, STEP_X + R, H - R, R, 90, 180, 0.1)
    bd.line(E, STEP_X, H - R, STEP_X, STEP_Y, 0.1)
    bd.line(E, STEP_X, STEP_Y, 0, STEP_Y, 0.1)
    bd.line(E, 0, STEP_Y, 0, R, 0.1)
    bd.arc(E, R, R, R, 180, 270, 0.1)


HOLES = (("H1", 3.5, 3.5), ("H2", W - 3.5, 3.5), ("H3", STEP_X + 3.5, H - 3.5), ("H4", W - 3.5, H - 3.5))


def build() -> Board:
    bd = Board()
    outline(bd)
    for ref, x, y in HOLES:
        bd.place(ref, x, y)

    # ---- 端子 ---------------------------------------------------------------
    bd.place("J3", SLOT[0], SLOT[1], 0)       # 1 番ピンが左 (ブラケットの側)、A 面が上、B 面が下
    bd.place("J2", JX, J2Y, 270)              # 口が左を向く
    bd.place("J1", JX, J1Y, 270)

    # ---- ① USB-C のまわり (USB の線は rev B の形のまま) ----------------------
    with bd.frame(**USB1):
        bd.place("U5", 74.5, 12.5, 180)       # 1 (IO1)・3 (IO2) が J4 の側
        bd.place("J4", 68.5, 11.23, 90)       # 奇数のピンの列が J1 の側
        bd.place("R3", 86.2, 20.6, pin1="W")
        bd.place("C2", 86.2, 22.5, pin1="W")
    bd.place("U1", 28.5, J1Y + 4.54, 90)      # 6・7 (CC) が左 (J4 の側)、1 (VHV) が右下
    bd.place("R21", 12.5, J1Y - 3.0, pin1="S")
    bd.place("R22", 13.0, J1Y + 4.9, pin1="N")
    bd.place("JP3", 26.2, J1Y - 2.81, pin1="E")
    bd.place("R1", 27.9, J1Y + 8.3, pin1="W")
    bd.place("C1", 32.6, J1Y + 8.3, pin1="E")
    bd.place("R28", 11.9, J1Y + 7.8, pin1="W")       # ブリーダ: 1kΩ 0805 を 2 直列 x 2 並列
    bd.place("R29", 16.2, J1Y + 7.8, pin1="W")
    bd.place("R39", 11.9, J1Y + 10.1, pin1="W")
    bd.place("R40", 16.2, J1Y + 10.1, pin1="W")
    bd.place("D1", 36.6, 21.8, pin1="W")      # アノードが左 (VBUS1 の面)、カソード (帯) が右 (VIN の面)
    bd.place("R25", 34.5, 27.0, pin1="N")     # VBUS1 を読む分圧の上の抵抗 (面のすぐ下)
    bd.place("R8", 36.4, 17.6, pin1="S")      # U3 の EN の分圧の上の抵抗 (面の右上の角のすぐ上)

    # ---- ② USB-C のまわり ---------------------------------------------------
    bd.place("U2", 13.5, J2Y + 0.75, 90)
    bd.place("R4", 12.9, J2Y + 4.35, pin1="W")
    bd.place("C3", 18.5, J2Y + 4.1, pin1="S")
    bd.place("R30", 23.0, J2Y - 1.5, pin1="W")
    bd.place("R31", 27.4, J2Y - 1.5, pin1="W")
    bd.place("R41", 23.0, J2Y + 0.8, pin1="W")
    bd.place("R42", 27.4, J2Y + 0.8, pin1="W")
    bd.place("D2", 36.6, 5.0, pin1="W")

    # ---- VIN の面のまわり ----------------------------------------------------
    bd.place("C4", 46.6, 27.3, pin1="N")
    bd.place("C5", 49.0, 27.3, pin1="N")
    bd.place("TP1", 46.5, 14.0)
    bd.place("R23", 51.3, 19.7, pin1="W")
    # 過電圧の遮断 (VIN が約 13V を超えたら Q2 のゲートを GND に引く)
    # VIN の面の下の辺に並べる (マイコンの左は、信号の通り道として空けておく)
    bd.place("D7", 39.2, 27.9, pin1="N")      # カソード (パッド 1、帯) が上 = VIN の面の中
    bd.place("R35", 40.2, 31.4, pin1="W")
    bd.place("R36", 40.2, 33.2, pin1="E")
    bd.place("Q4", 43.7, 32.3, 180)           # 左上が 1 B、左下が 2 E、右が 3 C

    # ---- 5V の LDO ----------------------------------------------------------
    bd.place("U6", 55.0, 11.0, 0)             # 左が 2 VIN、右上が 3 VOUT、右下が 1 GND
    bd.place("C6", 52.2, 17.6, pin1="W")
    bd.place("C7", 58.6, 11.0, pin1="N")
    bd.place("TP4", 61.0, 11.0)
    bd.place("J5", 65.3, 10.6, pin1="W")

    # ---- 3.3V の降圧 (rev B の形を 90 度回したもの) ---------------------------
    with bd.frame(**BUCK):
        bd.place("U3", 47.0, 9.0, 0)
        bd.place("C10", 49.15, 8.5, pin1="S")
        bd.place("C8", 51.1, 8.6, pin1="S")
        bd.place("C9", 53.5, 8.6, pin1="S")
        bd.place("C11", 44.6, 8.25, pin1="S")
        bd.place("L1", 39.3, 5.5, pin1="E")
        bd.place("C12", 44.8, 11.2, pin1="E")
        bd.place("R7", 45.6, 12.9, pin1="E")
        bd.place("R6", 49.2, 12.9, pin1="E")
        bd.place("C13", 33.3, 5.2, pin1="S")
        bd.place("C14", 30.9, 5.2, pin1="S")
        bd.place("JP1", 26.6, 6.2, pin1="E")
        bd.place("JP5", 26.6, 9.0, pin1="E")  # JP1 に並列のはんだジャンパー (最初から閉じている)
    bd.place("C15", 80.6, 10.6, pin1="W")     # EN のコンデンサ (U3 のすぐ右上)
    bd.place("R9", 67.0, 14.2, pin1="N")
    bd.place("D5", 63.4, 14.2, pin1="W")      # カソード (パッド 1、帯) が左 = +5V
    bd.place("R38", 63.4, 16.6, pin1="E")
    # 3.3V の出口 (スロットの上)
    bd.place("C27", SLOT[0] + 4.4, YT - 2.6, pin1="S")
    bd.place("C28", SLOT[0] + 2.2, YT - 2.5, pin1="S")
    bd.place("TP2", 70.2, YT)
    bd.place("R10", 56.3, YT - 2.3, pin1="S")
    bd.place("JP4", SLOT[0] + 1.0, SLOT[1] + 6.75, pin1="E")
    # PERST# の遅延 (幹のすぐ上)
    bd.place("R27", 63.0, YT - 2.2, pin1="S")
    bd.place("D6", 66.4, YT - 2.2, pin1="E")  # カソード (パッド 1、帯) が右 = +3V3
    bd.place("C31", 65.8, YT - 5.0, pin1="W")
    bd.place("R37", 58.9, 15.0, pin1="E")     # マイコンの PC4 の直列抵抗 (マイコンの側に置く)

    # ---- 12V の昇圧 (rev B の形を 180 度回したもの) と出力スイッチ -------------
    with bd.frame(**BOOST):
        bd.place("U4", 33.5, 40.65, 180)
        bd.place("L2", 30.1, 33.95, pin1="E")
        bd.place("D4", 27.9, 39.15, pin1="W")
        bd.place("C16", 37.55, 40.05, pin1="N")
        bd.place("C17", 39.7, 40.05, pin1="N")
        bd.place("C18", 28.5, 41.9, pin1="W")
        bd.place("C19", 24.2, 41.9, pin1="E")
        bd.place("R12", 33.4, 43.87, pin1="W")
        bd.place("R11", 30.2, 43.87, pin1="W")
    bd.place("R13", 16.4, 46.4, pin1="E")
    bd.place("Q1", 32.6, 51.4, 0)             # 左が 3 D、右上が 2 S、右下が 1 G
    bd.place("R14", 36.1, 50.45, pin1="E")
    bd.place("C20", 36.1, 48.6, pin1="E")
    bd.place("C32", 36.0, 54.2, pin1="E")
    bd.place("R15", 38.5, 52.95, pin1="N")
    bd.place("Q2", 41.1, 53.7, 0)             # 左が 3 D、右上が 2 S、右下が 1 G
    bd.place("Q3", 41.1, 49.8, 0)
    bd.place("F1", 41.3, 57.2, pin1="W")      # Q1・D4・L2 から離して、スロットの 1 番ピンの下
    bd.place("JP2", 40.0, 60.6, pin1="W")
    bd.place("JP6", 45.6, 58.6, pin1="W")     # JP2 に並列のはんだジャンパー (最初から閉じている)
    bd.place("R32", 46.2, 55.2, pin1="S")
    bd.place("C29", 49.7, 54.5, pin1="N")
    bd.place("C30", 51.9, 54.3, pin1="N")
    bd.place("R18", 50.9, 58.6, pin1="W")
    bd.place("TP3", 48.3, 60.7)

    # ---- マイコン -----------------------------------------------------------
    with bd.frame(**MCU):
        bd.place("U7", 46.5, 29.0, 0)         # 下の列が左から 1..10、上の列が左から 20..11
        bd.place("C21", 48.1, 34.5, pin1="E")
        bd.place("C22", 51.3, 34.5, pin1="W")
    bd.place("R19", 66.6, 23.0, pin1="S")
    bd.place("JP7", 66.6, 19.6, pin1="S")     # 12V の強制オン (はんだでつなぐ)
    bd.place("R20", 60.2, 17.0, pin1="W")
    bd.place("R34", 56.3, 19.3, pin1="E")
    bd.place("R16", 56.0, 17.2, pin1="W")
    # ADC の入力のコンデンサはマイコンの左下に縦に並べる (右が信号、左が GND)。分圧の下の抵抗は、上の抵抗のそばに置く
    for i, ref in enumerate(("C25", "C26", "C23", "C24", "C33")):
        bd.place(ref, 55.3, 26.0 + 2.0 * i, pin1="E")
    bd.place("R24", 52.05, 22.2, pin1="N")
    bd.place("R26", 36.9, 29.6, pin1="N")
    bd.place("R33", 51.9, 33.0, pin1="N")
    bd.place("TP5", 8.0, 50.0)
    # LED (上の長い辺。辺から 1mm 以内。左が GND)
    bd.place("LED3", 39.0, 1.0, pin1="E")
    bd.place("LED5", 46.0, 1.0, pin1="E")
    return bd


def route(bd: Board):
    """電源・USB・CC・長い制御線を手で引く。残りの細い信号は freerouting に任せる。"""
    P = bd.P
    T = bd.track

    # ======== USB のデータ線 (J1 -> U5 -> J4)。rev B の形のまま =================
    with bd.frame(**USB1):
        dp6, dn7, dp_a6, dn_b7 = P("J1", "B6"), P("J1", "A7"), P("J1", "A6"), P("J1", "B7")
        io1, io2 = P("U5", "1"), P("U5", "3")
        j4_5, j4_3 = P("J4", "5"), P("J4", "3")
        w0, w1 = 0.2, 0.5
        yp, yn = io1[1] - 0.85, io2[1] + 0.85            # U5 の使わないパッド (IO4・IO3) の外を回る
        T("USB_DP", w0, [dp6, (82.5, dp6[1]), (82.0, dp6[1] - 0.5), (77.9, dp6[1] - 0.5), (76.35, yp)])
        T("USB_DP", w1, [(76.35, yp), (74.2, yp), (io1[0] + 0.2, io1[1]), io1, (72.4, io1[1]), (71.0, j4_5[1]), j4_5])
        T("USB_DN", w0, [dn7, (81.9, dn7[1]), (81.4, dn7[1] - 0.5), (77.9, dn7[1] - 0.5), (76.35, yn)])
        T("USB_DN", w1, [(76.35, yn), (74.2, yn), (io2[0] + 0.2, io2[1]), io2, (72.4, io2[1]), (71.0, j4_3[1]), j4_3])
        # 裏返しに挿したとき用の D+ (A6): ビアで裏へ回り、D- の下をくぐって D+ に合流
        va, vb = (79.4, dp_a6[1]), (79.4, 11.5)
        T("USB_DP", w0, [dp_a6, va])
        bd.via("USB_DP", *va)
        T("USB_DP", w0, [va, vb], layer=B)
        bd.via("USB_DP", *vb)
        T("USB_DP", w0, [vb, (79.4, dp6[1] - 0.5)])
        T("USB_DN", w0, [dn_b7, (81.9, dn_b7[1]), (81.5, dn_b7[1] + 0.4), (77.3, dn_b7[1] + 0.4), (76.9, yn - 0.1),
                         (76.35, yn)])
        bd.gnd_via(74.45, 12.5, frm=P("U5", "2"), width=0.4)
        T("USBH_VBUS", 0.5, [P("J4", "1"), P("J4", "2")])
        T("GND", 0.5, [P("J4", "7"), P("J4", "8")])
        bd.gnd_via(P("J4", "7")[0] + 1.5, P("J4", "7")[1], frm=P("J4", "7"))
    # USB-C の GND のパッド: 1 つにつきビア 2 個 (殻の外)
    for j, fr in (("J1", USB1), ("J2", USB2)):
        with bd.frame(**fr):
            for num, s in (("B1A12", -1), ("A1B12", 1)):
                g = P(j, num)
                T("GND", 0.5, [(g[0] - 0.4, g[1]), (82.25, g[1] + 0.4 * s), (82.3, g[1] + 1.2 * s)])
                bd.via("GND", 82.25, g[1] + 0.4 * s)
                bd.via("GND", 82.3, g[1] + 1.2 * s)

    # ======== ① の CC (殻の下を通さない。パッドから奥へ出て、J4 のピンの間を抜けて U1 へ) ====
    cc1, cc2 = P("J1", "A5"), P("J1", "B5")          # 上が CC1、下が CC2
    u1 = {n: P("U1", n) for n in ("1", "2", "3", "6", "7", "8", "9", "11")}
    y1 = J1Y - 1.6                                    # J4 の 1/2 番の列と 3/4 番の列の間
    y2 = u1["7"][1]                                   # = J4 の 5/6 番の列と 7/8 番の列の間
    xv = 24.0
    T("J1_CC1", 0.2, [cc1, (7.6, cc1[1]), (7.95, y1), (xv, y1), (xv, u1["6"][1] - 0.35), (xv + 0.35, u1["6"][1]),
                      u1["6"]])
    T("J1_CC2", 0.2, [cc2, (9.2, cc2[1]), (9.7, cc2[1] + 0.5), (9.7, y2 - 0.84), (10.54, y2), u1["7"]])
    r21 = P("R21", "1")
    T("J1_CC1", 0.2, [(r21[0], y1), r21])
    r22 = P("R22", "1")
    T("J1_CC2", 0.2, [(r22[0], y2), r22])
    # CC2 を読む線: R22 から J4 の 7/8 番の列と 9/10 番の列の間を抜ける
    r22b = P("R22", "2")
    # ... U1 の左で下へ折れ、R1・C1 の下を右へ
    T("CC2_SENSE", 0.2, [r22b, (r22b[0] + 0.45, J1Y + 6.08), (23.95, J1Y + 6.08), (23.95, J1Y + 8.7),
                         (24.4, J1Y + 9.15), (36.5, J1Y + 9.15)])
    # U1 のまわり
    T("CFG1_U1", 0.2, [u1["9"], (u1["9"][0] + 1.1, u1["9"][1]), (u1["9"][0] + 1.35, u1["9"][1] + 0.25),
                       (u1["9"][0] + 1.35, P("R1", "1")[1] - 0.5), P("R1", "1")])
    gv = ((P("R1", "2")[0] + P("C1", "2")[0]) / 2, P("R1", "2")[1])
    T("GND", 0.4, [P("R1", "2"), gv, P("C1", "2")])
    bd.via("GND", *gv)
    for dy in (-0.6, 0.6):
        bd.via("GND", u1["11"][0], u1["11"][1] + dy)
    # USBH_VBUS: J4 の 2 番 -> JP3
    T("USBH_VBUS", 0.5, [P("J4", "2"), P("JP3", "2")])

    # ======== VBUS1: 上のパッド -> おもての面 -> D1。下のパッド -> うらの帯 -> D1 ========
    va_, vb_ = P("J1", "A4B9"), P("J1", "B4A9")      # 上、下
    T("VBUS1", 0.6, [va_, (8.9, va_[1]), (8.9, J1Y - 5.4)])
    bd.zone("VBUS1", F, rect(8.4, J1Y - 12.4, 35.3, J1Y - 5.0), clearance=0.2, thermal=False, name="D1-anode")
    T("VBUS1", 0.5, [vb_, (8.05, vb_[1]), (8.75, vb_[1] + 0.7), (8.75, J1Y + 10.1), P("R39", "1")])
    T("VBUS1", 0.5, [(8.75, J1Y + 7.8), P("R28", "1")])
    for y in (J1Y + 5.0, J1Y + 6.0):
        bd.via("VBUS1", 8.75, y, dia=0.8, drill=0.4)
    bd.zone("VBUS1", B, [(7.9, J1Y + 4.4), (9.7, J1Y + 4.4), (9.7, J1Y + 9.5), (32.0, J1Y + 9.5), (32.0, 19.0),
                         (35.6, 19.0), (35.6, J1Y + 12.1), (7.9, J1Y + 12.1)],
            clearance=0.3, thermal=False, name="VBUS1-bottom")
    for vx in (32.5, 33.6, 34.7):                    # うらの帯 -> アノードの面
        for vy in (19.9, 23.7):
            bd.via("VBUS1", vx, vy, dia=0.8, drill=0.4)
    # U1 の VBUS (8 番) と VHV (1 番) は、うらの帯からビアで
    v8 = (24.2, u1["8"][1] + 0.26)                 # CC2 と CC2_SENSE の線に囲まれた中。うらの細い線で帯につなぐ
    bd.via("VBUS1", *v8)
    T("VBUS1", 0.4, [v8, (24.2, J1Y + 9.8)], layer=B)
    T("VBUS1", 0.3, [v8, (u1["8"][0] - 0.75, u1["8"][1]), u1["8"]])
    v1 = (34.2, u1["1"][1])
    bd.via("VBUS1", *v1)
    T("VBUS1", 0.4, [u1["1"], v1])
    c1 = P("C1", "1")
    T("VBUS1", 0.4, [(c1[0], u1["1"][1]), c1])
    # ブリーダ: R28 - R29 と R39 - R40 (中点はつなぐ)
    T("BLD1", 0.4, [P("R28", "2"), P("R29", "1")])
    T("BLD1", 0.4, [P("R39", "2"), P("R40", "1")])
    xm = (P("R28", "2")[0] + P("R29", "1")[0]) / 2
    T("BLD1", 0.4, [(xm, P("R28", "2")[1]), (xm, P("R39", "2")[1])])
    for ref in ("R29", "R40"):
        g = P(ref, "2")
        bd.gnd_via(g[0] + 1.25, g[1], frm=g)
    # 分圧の上の抵抗 (面のすぐ下)
    p = P("R25", "1")
    T("VBUS1", 0.4, [p, (p[0], J1Y - 5.6)])
    p = P("R8", "1")
    T("VBUS1", 0.4, [p, (35.0, p[1] + 0.3)])
    # EN_3V3: R8 から、VIN の面をうらでくぐって (I2C2 と同じすき間) マイコンの側へ
    e1, e2 = (37.0, 16.3), (50.9, 16.3)
    T("EN_3V3", 0.2, [P("R8", "2"), e1])
    bd.via("EN_3V3", *e1)
    bd.via("EN_3V3", *e2)
    T("EN_3V3", 0.25, [e1, e2], layer=B)
    # 殻 (SHIELD1): 前と後ろの足をおもてで、上と下の足をうらでつなぐ。R3・C2 へ
    s1, s2, s3, s4 = (bd.G("J1", n) for n in "1234")
    T("SHIELD1", 0.4, [s1, s2])
    T("SHIELD1", 0.4, [s4, s3])
    T("SHIELD1", 0.4, [s4, (4.2, s4[1] + 1.25), (4.2, s1[1] - 1.25), s1], layer=B)
    r3, c2 = P("R3", "1"), P("C2", "1")
    T("SHIELD1", 0.4, [s4, (s4[0], c2[1] + 0.8), (c2[0] + 0.5, c2[1]), c2])
    T("SHIELD1", 0.4, [(s4[0], r3[1]), r3])
    for ref in ("R3", "C2"):
        g = P(ref, "2")
        bd.gnd_via(g[0] - 1.15, g[1], frm=g)

    # ======== ② : CC はまっすぐ U2 へ。VBUS は上のパッド -> おもての面、下のパッド -> うらの橋 ====
    c21_, c22_ = P("J2", "A5"), P("J2", "B5")
    u2 = {n: P("U2", n) for n in ("1", "2", "3", "6", "7", "8", "9", "11")}
    T("J2_CC1", 0.2, [c21_, u2["6"]])
    T("J2_CC2", 0.2, [c22_, (8.0, c22_[1]), (8.6, c22_[1] - 0.6), (8.6, u2["7"][1] + 0.6), (9.2, u2["7"][1]),
                      u2["7"]])
    wa, wb = P("J2", "A4B9"), P("J2", "B4A9")
    T("VBUS2", 0.6, [wa, (8.9, wa[1]), (8.9, 6.4)])
    bd.zone("VBUS2", F, rect(8.4, 1.3, 35.3, J2Y - 2.9), clearance=0.2, thermal=False, name="D2-anode")
    T("VBUS2", 0.5, [wb, (8.6, wb[1]), (9.3, wb[1] - 0.7), (9.3, u2["8"][1] + 0.45), (9.75, u2["8"][1]), u2["8"]])
    yv2 = J2Y + 5.3
    T("VBUS2", 0.6, [(8.6, wb[1]), (8.9, wb[1] + 0.3), (8.9, yv2)])
    c3 = P("C3", "1")
    T("VBUS2", 0.4, [(8.9, yv2), (c3[0], yv2), c3])
    T("VBUS2", 0.4, [u2["1"], (u2["1"][0], yv2)])
    for y in (6.9, 7.9, J2Y + 3.9, J2Y + 5.0):
        bd.via("VBUS2", 8.9, y, dia=0.8, drill=0.4)
    bd.zone("VBUS2", B, rect(8.3, 6.3, 9.6, J2Y + 5.7), clearance=0.3, thermal=False, name="VBUS2-bridge")
    r4 = P("R4", "1")
    T("CFG1_U2", 0.2, [u2["9"], (u2["9"][0] + 1.1, u2["9"][1]), (u2["9"][0] + 1.35, u2["9"][1] + 0.25),
                       (u2["9"][0] + 1.35, r4[1] - 0.5), r4])
    bd.gnd_via(P("R4", "2")[0] + 1.2, r4[1], frm=P("R4", "2"))
    bd.gnd_via(P("C3", "2")[0] + 1.2, P("C3", "2")[1], frm=P("C3", "2"))
    for dy in (-0.6, 0.6):
        bd.via("GND", u2["11"][0], u2["11"][1] + dy)
    # ブリーダ
    T("BLD2", 0.4, [P("R30", "2"), P("R31", "1")])
    T("BLD2", 0.4, [P("R41", "2"), P("R42", "1")])
    xm = (P("R30", "2")[0] + P("R31", "1")[0]) / 2
    T("BLD2", 0.4, [(xm, P("R30", "2")[1]), (xm, P("R41", "2")[1])])
    p30, p41 = P("R30", "1"), P("R41", "1")
    T("VBUS2", 0.5, [(p30[0], J2Y - 3.3), p30, p41])
    for ref in ("R31", "R42"):
        g = P(ref, "2")
        bd.gnd_via(g[0] + 1.25, g[1], frm=g)
    # I2C2: U2 から右へ出て、VIN の面をうらでくぐる (うらの VIN の面はここだけ空けてある)
    xl, xr_ = 36.9, 50.9
    ya_, yb2 = J2Y + 1.95, J2Y + 2.4
    T("I2C2_SDA", 0.2, [u2["3"], (17.9, u2["3"][1]), (17.9 + ya_ - u2["3"][1], ya_), (xl - 0.15, ya_), (xl, ya_ + 0.15)])
    T("I2C2_SCL", 0.2, [u2["2"], (17.5, u2["2"][1]), (17.5 + yb2 - u2["2"][1], yb2), (34.9, yb2), (35.6, yb2 + 0.7)])
    for net, x, y in (("I2C2_SDA", xl, ya_ + 0.15), ("I2C2_SCL", 35.6, yb2 + 0.7)):
        bd.via(net, x, y)
        bd.via(net, xr_, y)
        T(net, 0.25, [(x, y), (xr_, y)], layer=B)

    # ======== VIN の面と、D1・D2 のカソード ====================================
    bd.zone("VIN", F, rect(*BAND), clearance=0.2, thermal=False, name="VIN-top")
    bd.zone("VIN", B, rect(BAND[0], BAND[1], BAND[2], 12.6), clearance=0.3, thermal=False, name="VIN-bottom-D2")
    # うら: D1 のカソードの下から、昇圧の入口まで
    bd.zone("VIN", B, [(BAND[0], 17.9), (BAND[2], 17.9), (BAND[2], BAND[3]), (41.3, BAND[3]), (41.3, 45.6),
                       (U4X - 0.7, 45.6), (U4X - 0.7, U4Y + 6.1), (U4X - 3.5, U4Y + 6.1), (U4X - 3.5, 43.0),
                       (38.3, 43.0), (38.3, BAND[3]), (BAND[0], BAND[3])],
            clearance=0.3, thermal=False, name="VIN-bottom-D1")
    for dref in ("D2", "D1"):
        k = P(dref, "2")
        for vx in (k[0] + 1.9, k[0] + 3.1):
            for dy in (-1.5, -0.5, 0.5, 1.5):
                bd.via("VIN", vx, k[1] + dy, dia=0.8, drill=0.4)
    for ref in ("C4", "C5"):
        g = P(ref, "2")
        bd.gnd_via(g[0], g[1] + 1.6, frm=g, width=0.6)
    p = P("R23", "1")
    T("VIN", 0.4, [(BAND[2] - 1.0, p[1]), p])
    # 5V の LDO
    u6_1, u6_2, u6_3 = P("U6", "1"), P("U6", "2"), P("U6", "3")
    T("VIN", 0.6, [(BAND[2] - 1.0, u6_2[1]), u6_2])
    p = P("C6", "1")
    T("VIN", 0.6, [(BAND[2] - 1.0, p[1]), p])
    bd.gnd_via(P("C6", "2")[0] + 0.7, p[1] - 1.3, frm=P("C6", "2"))
    c7a, c7g = P("C7", "1"), P("C7", "2")
    T("+5V", 0.5, [u6_3, (c7a[0] - 0.7, u6_3[1]), c7a])
    T("+5V", 0.4, [c7a, (c7a[0] + 0.7, c7a[1] - 0.7), (60.4, c7a[1] - 0.7), P("TP4", "1")])
    T("GND", 0.4, [c7g, (u6_1[0] + 1.3, u6_1[1])])
    bd.gnd_via(u6_1[0] + 1.3, u6_1[1], frm=u6_1)
    # 過電圧の遮断
    d7a, r35a = P("D7", "2"), P("R35", "1")
    T("OVP_Z", 0.25, [d7a, (d7a[0], d7a[1] + 1.0), (r35a[0] - 0.2, r35a[1]), r35a])
    T("OVP_B", 0.25, [P("R35", "2"), P("R36", "1")])
    qb, qe, qc = P("Q4", "1"), P("Q4", "2"), P("Q4", "3")
    T("OVP_B", 0.25, [P("R35", "2"), qb])
    g = P("R36", "2")
    bd.gnd_via(37.4, g[1] + 0.7, frm=g)        # うらの VIN の帯と VBUS1 の帯の間
    bd.gnd_via(qe[0], qe[1] + 1.35, frm=qe)
    # Q4 のコレクタ -> Q2_G: C4・C5 のすぐ下を右へ (左から来る信号の通り道の上の端)。先は自動配線
    T("Q2_G", 0.2, [qc, (qc[0] + 0.9, qc[1]), (qc[0] + 2.2, 31.0), (50.6, 31.0)])

    # ======== 3.3V の降圧 (rev B の形のまま) ==================================
    with bd.frame(**BUCK):
        BUS = 57.5
        u3 = {n: P("U3", n) for n in "12345678"}
        c9, c8, c10 = P("C9", "1"), P("C8", "1"), P("C10", "1")
        yv = c9[1]
        T("VIN", 1.5, [(BUS, yv), c9, c8])
        T("VIN", 0.8, [c8, (c10[0] + 0.3, yv), c10])
        T("VIN", 0.3, [u3["3"], (c10[0] - 0.25, u3["3"][1]), (c10[0], u3["3"][1] + 0.25)])
        c11s, c11b = P("C11", "2"), P("C11", "1")
        l1sw, l1out = P("L1", "1"), P("L1", "2")
        T("SW_3V3", 0.28, [u3["5"], (u3["5"][0] - 0.6, u3["5"][1]), (u3["5"][0] - 1.1, u3["5"][1] - 0.5)])
        T("SW_3V3", 0.6, [(u3["5"][0] - 1.1, u3["5"][1] - 0.5), (c11s[0] + 0.3, c11s[1]), c11s])
        T("SW_3V3", 0.8, [c11s, (l1sw[0] + 0.6, l1sw[1] + 1.0), l1sw])
        x0, y0 = 47.0, 9.0
        bd.zone("SW_3V3", F, [(x0 - 0.5, y0 - 0.89), (x0 - 0.5, y0 - 0.61), (x0 - 1.1, y0 - 0.61),
                              (x0 - 1.65, y0 - 1.05), (x0 - 3.0, y0 - 1.05), (x0 - 3.4, y0 - 1.8),
                              (x0 - 6.0, y0 - 1.8), (x0 - 6.0, y0 - 5.2), (x0 - 3.4, y0 - 5.2),
                              (x0 - 1.4, y0 - 3.2), (x0 - 1.4, y0 - 0.89)],
                clearance=0.2, min_width=0.2, thermal=False, name="U3-SW")
        T("BST_3V3", 0.2, [u3["6"], (c11b[0] + 0.2, u3["6"][1]), c11b])
        c12 = P("C12", "1")
        T("SS_3V3", 0.2, [u3["7"], (c12[0] + 0.05, u3["7"][1]), (c12[0] + 0.05, c12[1] - 0.2), c12])
        bd.gnd_via(P("C12", "2")[0] - 1.1, c12[1], frm=P("C12", "2"))
        r7, r6 = P("R7", "1"), P("R6", "2")
        T("FB_3V3", 0.2, [u3["8"], (u3["8"][0], r7[1] - 0.6), r7])
        T("FB_3V3", 0.25, [r7, r6])
        bd.gnd_via(P("R7", "2")[0] - 1.1, r7[1], frm=P("R7", "2"))
        r6a, c13s = P("R6", "1"), P("C13", "1")
        T("+3V3_BUCK", 0.25, [r6a, (r6a[0], r6a[1] + 1.0), (38.6, r6a[1] + 1.0), (38.6, 9.6), (c13s[0] + 1.3, 9.6),
                              (c13s[0] + 0.3, 8.6), (c13s[0] + 0.3, c13s[1] + 0.6)])
        bd.zone("VIN", F, [(x0 + 0.5, y0 - 0.39), (x0 + 1.95, y0 - 0.39), (x0 + 1.95, y0 - 0.2),
                           (BUS - 0.5, y0 - 0.2), (BUS - 0.5, y0 + 1.4), (x0 + 1.75, y0 + 1.4),
                           (x0 + 1.75, y0 - 0.11), (x0 + 0.5, y0 - 0.11)],
                clearance=0.2, min_width=0.2, thermal=False, name="U3-VIN")
        c10g = P("C10", "2")
        T("GND", 0.28, [u3["4"], (c10g[0] - 0.55, u3["4"][1]), (c10g[0], u3["4"][1] - 0.35)])
        T("GND", 1.0, [c10g, P("C8", "2"), P("C9", "2")])
        yg = c10g[1] - 1.45
        for x in (x0 + 1.9, x0 + 2.8, x0 + 3.7, x0 + 4.6, x0 + 6.5):
            bd.gnd_via(x, yg, frm=(x, c10g[1] - 0.3), width=0.5)
        bd.zone("GND", F, [(x0 + 0.5, y0 - 0.89), (x0 + 1.4, y0 - 0.89), (x0 + 1.4, y0 - 3.5), (x0 + 7.7, y0 - 3.5),
                           (x0 + 7.7, y0 - 0.45), (x0 + 2.1, y0 - 0.45), (x0 + 1.4, y0 - 0.61), (x0 + 0.5, y0 - 0.61)],
                clearance=0.2, min_width=0.2, thermal=False, name="U3-GND")
        c13, c14 = P("C13", "1"), P("C14", "1")
        jp1a, jp1b = P("JP1", "1"), P("JP1", "2")
        T("+3V3_BUCK", 1.5, [(l1out[0], c13[1]), c13, c14])
        T("+3V3_BUCK", 1.5, [c14, jp1a])
        T("+3V3_BUCK", 1.0, [jp1a, (jp1a[0], P("JP5", "1")[1] - 0.6), P("JP5", "1")])
        for ref in ("C13", "C14"):
            g = P(ref, "2")
            bd.gnd_via(g[0], g[1] - 1.5, frm=g, width=0.6)
        bd.gnd_via(P("C14", "2")[0] - 1.3, P("C14", "2")[1] - 0.9, frm=P("C14", "2"), width=0.6)
        T("+3V3", 1.0, [P("JP5", "2"), (jp1b[0], P("JP5", "2")[1]), jp1b])
        # EN: 2 番ピンから、1 番ピン (RT、未接続) の外を回って出る
        e = u3["2"]
        T("EN_3V3", 0.2, [e, (e[0] + 0.7, e[1]), (e[0] + 0.7, e[1] + 1.7), (e[0] + 1.35, e[1] + 2.05)])
        en_end = bd.to_board(e[0] + 1.35, e[1] + 2.05)
        vin_in = bd.to_board(BUS, yv)
    # VIN の面 -> 降圧の入口 (上の辺に沿う幹)
    T("VIN", 2.0, [(BAND[2] - 1.5, vin_in[1]), vin_in])
    # EN: 幹の上を右へ走り、幹の右の端を回って U3 へ。途中に C15
    xe = 78.1
    c15 = P("C15", "1")
    T("EN_3V3", 0.2, [en_end, (xe, en_end[1] - 0.3), (xe, 3.6), (64.6, 3.6), (64.0, 4.2)])
    T("EN_3V3", 0.2, [(xe, c15[1]), c15])
    bd.gnd_via(P("C15", "2")[0] + 1.15, c15[1], frm=P("C15", "2"))
    # 幹をうらでくぐる 3 本 (EN_3V3・LED5_A・LED3_A)
    ya, yb_ = 4.2, 7.8
    for net, x in (("LED3_A", 62.0), ("LED5_A", 63.0), ("EN_3V3", 64.0)):
        bd.via(net, x, ya)
        bd.via(net, x, yb_)
        T(net, 0.25, [(x, ya), (x, yb_)], layer=B)
    led3, led5 = P("LED3", "1"), P("LED5", "1")
    T("LED3_A", 0.2, [(62.0, ya), (62.0, 2.6), (61.35, 1.95), (led3[0], 1.95), led3])
    T("LED5_A", 0.2, [(63.0, ya), (63.0, 2.0), (62.0, 1.0), led5])
    for ref in ("LED3", "LED5"):
        g = P(ref, "2")
        bd.gnd_via(g[0] - 1.25, g[1], frm=g)
    g = P("R9", "2")
    bd.gnd_via(g[0], g[1] + 1.25, frm=g)

    # ======== +3V3: JP1 -> 幹 -> A10・A9、スロットの右を回って B8 ===============
    a9, a10, a11, b8, b10 = (P("J3", n) for n in ("A9", "A10", "A11", "B8", "B10"))
    jp1b = P("JP1", "2")
    xt = jp1b[0]
    T("+3V3", 2.0, [jp1b, (xt, YB - 1.0), (xt - 1.0, YB), (b8[0] + 0.9, YB)])
    T("+3V3", 2.0, [(xt, YT), (a10[0], YT)])
    T("+3V3", 1.5, [(a10[0], YT), a10])
    T("+3V3", 1.0, [a10, a9])
    T("+3V3", 1.5, [(b8[0] + 0.9, YB), (b8[0], YB - 0.9), b8])
    for ref in ("C27", "C28"):
        p = P(ref, "1")
        T("+3V3", 0.8, [p, (p[0], YT)])
        g = P(ref, "2")
        bd.gnd_via(g[0], g[1] - 1.4, frm=g, width=0.6)
    p = P("R10", "1")
    T("+3V3", 0.4, [p, (p[0], YT)])
    p = P("JP4", "1")
    T("+3V3", 0.6, [p, (p[0], YB)])
    q = P("JP4", "2")
    T("+3V3AUX", 0.4, [q, (b10[0], q[1] - 0.9), b10])
    # PERST# の遅延
    r27a, r27b = P("R27", "1"), P("R27", "2")
    d6k, d6a = P("D6", "1"), P("D6", "2")
    c31 = P("C31", "1")
    T("+3V3", 0.4, [r27a, (r27a[0], YT)])
    T("+3V3", 0.4, [d6k, (d6k[0], YT)])
    T("PERST#", 0.3, [r27b, (r27b[0] + 1.0, r27b[1]), d6a])
    T("PERST#", 0.3, [(r27b[0] + 1.0, r27b[1]), (c31[0], r27b[1] - 0.8), c31])
    bd.gnd_via(P("C31", "2")[0] + 1.4, c31[1], frm=P("C31", "2"), width=0.5)
    # A11 へはうらで (幹の下をくぐる)
    pv = (r27b[0] - 1.0, r27b[1])
    T("PERST#", 0.25, [r27b, pv])
    bd.via("PERST#", *pv)
    T("PERST#", 0.25, [pv, (pv[0], YT + 1.7), (a11[0] + 1.45, YT + 1.7), (a11[0] + 0.35, YT + 2.8),
                       (a11[0] + 0.35, a11[1] - 0.85), a11], layer=B)

    # ======== 12V の昇圧 (rev B の形のまま) ====================================
    with bd.frame(**BOOST):
        x4 = 33.5
        u4 = {n: P("U4", n) for n in "123456"}
        d4k, d4a = P("D4", "1"), P("D4", "2")
        l2v, l2sw = P("L2", "1"), P("L2", "2")
        xb = x4 + 2.8
        c16 = P("C16", "1")
        T("VIN", 1.5, [(xb, l2v[1]), l2v])
        T("VIN", 1.5, [(xb, l2v[1]), (xb, c16[1])])
        T("VIN", 1.0, [(xb, c16[1]), c16, P("C17", "1")])
        T("VIN", 0.5, [(xb, c16[1]), (xb, u4["5"][1] - 0.45), (xb - 0.45, u4["5"][1]), u4["5"]])
        T("VIN", 1.0, [(xb - 1.2, 35.4), (xb - 1.2, 37.8)])
        for vx in (xb - 1.2, xb):                    # うらの VIN の帯から上がるビア
            for vy in (35.4, 36.6, 37.8):
                bd.via("VIN", vx, vy, dia=0.8, drill=0.4)
        T("SW_12V", 0.6, [u4["1"], (d4a[0] + 0.5, u4["1"][1]), d4a])
        T("SW_12V", 1.5, [d4a, (d4a[0] - 0.4, d4a[1] - 1.2), (l2sw[0] + 0.2, l2sw[1] + 1.3), l2sw])
        c18, c19 = P("C18", "1"), P("C19", "1")
        c18g, c19g = P("C18", "2"), P("C19", "2")
        # 熱い輪: SW -> D4 -> C18 -> GND -> U4 の 2 番
        T("+12V_BOOST", 1.2, [d4k, (d4k[0], c19[1] - 0.6), c19])
        T("+12V_BOOST", 1.0, [c19, c18])
        T("+12V_BOOST", 1.0, [d4k, (d4k[0] + 1.2, c18[1] - 0.8), c18])
        ga, gb = (x4 - 2.45, 40.65 + 0.8), (x4 - 3.15, 40.65 + 0.1)
        T("GND", 0.5, [u4["2"], gb])
        T("GND", 0.5, [gb, ga])
        T("GND", 0.8, [gb, c18g])
        bd.via("GND", *ga)
        bd.via("GND", *gb)
        bd.gnd_via(c19g[0], c19g[1] + 1.25, frm=c19g, width=0.6)
        for ref in ("C16", "C17"):
            g = P(ref, "2")
            bd.gnd_via(g[0], g[1] + 1.4, frm=g, width=0.6)
        r12, r11b, r11t = P("R12", "1"), P("R11", "2"), P("R11", "1")
        T("FB_12V", 0.25, [u4["3"], (u4["3"][0], r12[1] - 0.75), r12])
        T("FB_12V", 0.25, [r12, r11b])
        T("+12V_BOOST", 0.3, [r11t, (r11t[0] - 0.85, r11t[1]), (c18[0], c18[1] + 0.65), c18])
        bd.gnd_via(P("R12", "2")[0] + 1.1, r12[1], frm=P("R12", "2"))
    # 出力スイッチ Q1 と、ゲートのまわり
    d4k = P("D4", "1")
    q1g, q1s, q1d = P("Q1", "1"), P("Q1", "2"), P("Q1", "3")
    r14g, r14s = P("R14", "1"), P("R14", "2")
    yq = d4k[1] - 1.4
    T("+12V_BOOST", 0.8, [(d4k[0], yq), (q1s[0] - 1.0, yq), (q1s[0] - 0.3, q1s[1] - 0.2), q1s])
    T("+12V_BOOST", 0.5, [q1s, r14s])
    T("+12V_BOOST", 0.4, [r14s, (r14s[0], P("C20", "2")[1]), P("C20", "2")])
    xs = r14g[0]                                     # Q1_G の縦の線
    T("Q1_G", 0.3, [q1g, (xs, q1g[1])])
    T("Q1_G", 0.3, [P("C20", "1"), (xs, P("C20", "1")[1]), (xs, P("C32", "1")[1]), P("C32", "1")])
    r15a, r15b = P("R15", "1"), P("R15", "2")
    T("Q1_G", 0.3, [(xs, r15a[1]), r15a])
    q2g, q2s, q2d = P("Q2", "1"), P("Q2", "2"), P("Q2", "3")
    q3g, q3s, q3d = P("Q3", "1"), P("Q3", "2"), P("Q3", "3")
    T("Q2_D", 0.3, [r15b, q2d])
    T("Q2_S", 0.3, [q2s, (q2s[0] - 0.9, q2s[1] - 0.9), (q3d[0], q3d[1] + 0.8), q3d])
    bd.gnd_via(q3s[0], q3s[1] - 1.25, frm=q3s)
    # +12V_SW: Q1 のドレイン -> C32 -> F1 -> JP2 (と JP6) -> スロット
    c32 = P("C32", "2")
    f1a, f1b = P("F1", "1"), P("F1", "2")
    T("+12V_SW", 0.8, [q1d, (q1d[0], c32[1]), c32])
    T("+12V_SW", 0.8, [(q1d[0] + 2.5, c32[1]), (q1d[0] + 2.5, f1a[1] - 1.0), (q1d[0] + 3.5, f1a[1]), f1a])
    jp2a, jp2b = P("JP2", "1"), P("JP2", "2")
    jp6a, jp6b = P("JP6", "1"), P("JP6", "2")
    T("+12V_F", 0.8, [f1b, (f1b[0] + 0.9, f1b[1] + 0.9), (jp6a[0] - 0.4, jp6a[1]), jp6a])
    T("+12V_F", 0.6, [f1b, (f1b[0], f1b[1] + 1.7), (jp2a[0], f1b[1] + 1.7), jp2a])
    a2, a3, b1, b2, b3 = (P("J3", n) for n in ("A2", "A3", "B1", "B2", "B3"))
    T("+12V", 0.8, [jp2b, (jp6b[0], jp2b[1]), jp6b])
    T("+12V", 1.0, [jp6b, (b2[0], jp6b[1] - 1.3), b2])
    T("+12V", 0.8, [b2, b1])
    T("+12V", 0.8, [b2, b3])
    T("+12V", 0.8, [b3, a3])                         # 同じ番号の A と B は向かい合わせ。スロットの中をまっすぐ
    T("+12V", 0.8, [a3, a2])
    T("+12V", 0.6, [(jp6b[0], jp2b[1]), P("TP3", "1")])
    # B7 (GND、内側の列): うらでは 2 列の間の細い GND にしかつながらないので、おもてで B4 (GND、外側の列) にもつなぐ
    b7, b4 = P("J3", "B7"), P("J3", "B4")
    T("GND", 0.3, [b7, (b7[0] - 1.5, b7[1] + 1.0), (b4[0] + 0.75, b4[1] - 0.25), b4])
    p = P("R18", "1")
    T("+12V", 0.4, [jp6b, p])
    bd.gnd_via(P("R18", "2")[0] + 1.2, p[1], frm=P("R18", "2"))
    c29, c30 = P("C29", "1"), P("C30", "1")
    T("+12V", 0.6, [(b2[0], c29[1]), c29, (c30[0], c29[1]), c30])
    for ref in ("C29", "C30"):
        g = P(ref, "2")
        bd.gnd_via(g[0], g[1] + 1.45, frm=g, width=0.5)
    # +12V を読む分圧の上の抵抗 (立ち上がりの線のすぐ左)
    r32a, r32b = P("R32", "1"), P("R32", "2")
    T("+12V", 0.3, [r32a, (r32a[0], r32a[1] + 1.0), (r32a[0] + 0.75, r32a[1] + 1.95)])
    # Q3 のゲート (+3V3): A9 のピンから、スロットの 2 列の間をうらで
    v3 = (43.5, 49.0)
    T("+3V3", 0.3, [a9, (a9[0] - 0.4, SLOT[1]), (44.0, SLOT[1]), (v3[0], SLOT[1] + 0.5), v3], layer=B)
    bd.via("+3V3", *v3)
    T("+3V3", 0.3, [v3, (v3[0] - 0.5, q3g[1] - 0.5), (q3g[0] + 0.5, q3g[1]), q3g])

    # ======== スロットの左の端を縦に通る 3 本 ===================================
    u4_4 = P("U4", "4")
    r13 = P("R13", "1")
    xe2 = u4_4[0] - 1.35
    T("EN_12V", 0.2, [(LANE_EN + 9.0, 40.1), (LANE_EN + 0.4, 40.1), (LANE_EN, 40.5), (LANE_EN, 43.2), (LANE_EN - 0.4, 43.6),
                      (xe2, 43.6), (xe2, u4_4[1] - 0.7), (u4_4[0] - 0.8, u4_4[1] - 0.15), u4_4])
    T("EN_12V", 0.2, [(xe2, r13[1]), r13])
    bd.gnd_via(P("R13", "2")[0] - 1.2, r13[1], frm=P("R13", "2"))
    T("Q2_G", 0.2, [(LANE_G + 8.45, 40.55), (LANE_G + 0.4, 40.55), (LANE_G, 40.95), (LANE_G, q2g[1] - 0.4),
                    (LANE_G - 0.4, q2g[1]), q2g])
    T("12V_SENSE", 0.2, [(LANE_S + 8.0, 41.0), (LANE_S + 0.4, 41.0), (LANE_S, 41.4), (LANE_S, r32b[1] - 1.15),
                         (r32b[0], r32b[1]), r32b])

    # ======== マイコンの電源 (rev B の形のまま) ================================
    with bd.frame(**MCU):
        u7 = {n: P("U7", n) for n in ("9", "7")}
        c22 = P("C22", "1")
        c21p, c21g = P("C21", "1"), P("C21", "2")
        T("+5V", 0.3, [u7["9"], (u7["9"][0], c21p[1] - 0.9), c21p])
        T("GND", 0.3, [u7["7"], (u7["7"][0], c21g[1] - 0.9), c21g])
        T("+5V", 0.4, [c21p, (c21p[0], c21p[1] + 1.0), (c22[0], c21p[1] + 1.0), c22])
        bd.gnd_via(c21g[0] - 1.15, c21g[1], frm=c21g)
        bd.gnd_via(P("C22", "2")[0] + 1.15, P("C22", "2")[1], frm=P("C22", "2"))
    T("SW1_IN", 0.25, [P("R19", "2"), P("JP7", "1")])
    bd.gnd_via(P("JP7", "2")[0] - 1.3, P("JP7", "2")[1], frm=P("JP7", "2"))
    bd.gnd_via(P("R16", "2")[0] + 1.15, P("R16", "2")[1], frm=P("R16", "2"))
    for ref in ("C25", "C26", "C23", "C24", "C33"):
        g = P(ref, "2")
        bd.gnd_via(g[0] - 1.15, g[1], frm=g)
    for ref in ("R24", "R26", "R33"):
        g = P(ref, "2")
        bd.gnd_via(g[0], g[1] + 1.25, frm=g)
    T("VIN_SENSE", 0.25, [P("R23", "2"), P("R24", "1")])
    r25b, r26a = P("R25", "2"), P("R26", "1")
    T("VBUS1_SENSE", 0.25, [r25b, (r25b[0] + 1.1, r26a[1]), r26a])
    bd.gnd_via(P("J5", "2")[0] + 1.7, P("J5", "2")[1], frm=P("J5", "2"))
    bd.gnd_via(P("TP5", "1")[0], P("TP5", "1")[1] - 1.3, frm=P("TP5", "1"))

    # ここまでの線は固定する (自動配線が動かさないように)
    for t in bd.b.GetTracks():
        t.SetLocked(True)


def keepouts(bd: Board):
    """自動配線に通らせたくない所。"""
    # うらの GND を切らせたくない所 (USB のデータ線の下、降圧と昇圧の下): うらの配線を禁止
    with bd.frame(**USB1):
        bd.keepout([B], rect(69.0, 10.3, 78.8, 14.8), name="usb-gnd-1")
        bd.keepout([B], rect(80.0, 10.9, 82.5, 15.7), name="usb-gnd-2")
    bd.keepout([B], rect(68.6, 8.4, 83.4, 39.0), name="buck-gnd")
    bd.keepout([B], rect(U4X - 0.6, 45.2, 35.0, 60.2), name="boost-gnd")
    # USB-C の殻の下: ビアを置かせない。おもての線も通さない (CC の線が殻の下へ入らないように)
    for name, y in (("J1", J1Y), ("J2", J2Y)):
        bd.keepout([F, B], rect(0.1, y - 3.7, 5.75, y + 3.7), tracks=False, vias=True, name=name + "-shell-no-via")
        bd.keepout([F], rect(0.1, y - 3.6, 5.6, y + 3.6), name=name + "-shell-no-top-track")
    # D1・D2 の胴体の下: おもての線を禁止
    for name in ("D1", "D2"):
        k = bd.P(name, "2")
        bd.keepout([F], rect(k[0] - 3.75, k[1] - 0.9, k[0] - 1.25, k[1] + 0.9), name=name + "-body")


def drawing(bd: Board):
    """ブラケット・カード・USB-C の口の位置を Dwgs.User の層に描く (寸法の図は export_fab.py が書き出す)。"""
    D = pcbnew.Dwgs_User
    x_out, x_in = MOUTH, MOUTH + BRACKET_T
    y1, y2 = SLOT[1] - BRACKET_A, SLOT[1] + BRACKET_B
    for a, b_ in (((x_out, y1), (x_in, y1)), ((x_in, y1), (x_in, y2)), ((x_in, y2), (x_out, y2)), ((x_out, y2), (x_out, y1))):
        bd.line(D, a[0], a[1], b_[0], b_[1], 0.1)
    bd.line(D, x_out, -4.0, x_out, y2 + 2.0, 0.05)                 # ブラケットの外の面 = USB-C の口の面
    px = SLOT[0] - 9.5
    cx = px - CARD_END                                            # カードの基板の端
    for dy in (-0.785, 0.785):                                    # カードの基板 (厚み 1.57mm)
        bd.line(D, cx, SLOT[1] + dy, W + 6.0, SLOT[1] + dy, 0.1)
    bd.line(D, cx, SLOT[1] - 0.785, cx, SLOT[1] + 0.785, 0.1)
    bd.line(D, px, SLOT[1] - 6.0, px, SLOT[1] + 6.0, 0.05)        # 1 番ピンの中心
    for jy in (J1Y, J2Y):                                         # USB-C の口 (幅 8.94mm)
        bd.line(D, MOUTH, jy - 4.47, MOUTH, jy + 4.47, 0.2)
        bd.line(D, MOUTH, jy - 4.47, 0.0, jy - 4.47, 0.1)
        bd.line(D, MOUTH, jy + 4.47, 0.0, jy + 4.47, 0.1)


def main():
    bd = build()
    route(bd)
    keepouts(bd)
    drawing(bd)
    os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
    out = os.path.join(ROOT, "build", "pre_route.kicad_pcb")
    bd.save(out)
    for ext in ("kicad_pro", "kicad_dru"):
        shutil.copyfile(os.path.join(ROOT, "pcie-tuner-board." + ext), os.path.join(ROOT, "build", "pre_route." + ext))
    for f in ("fp-lib-table", "sym-lib-table"):
        shutil.copyfile(os.path.join(ROOT, f), os.path.join(ROOT, "build", f))
    print("saved", out, "footprints", len(bd.fps))
    return bd


if __name__ == "__main__":
    main()
