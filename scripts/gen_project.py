"""プロジェクトファイル (pcie-tuner-board.kicad_pro) を作る。デザインルールとネットクラスをここで決める。

デザインルールは JLCPCB の公式の capabilities (https://jlcpcb.com/capabilities/pcb-capabilities、
2026-11-11 に確認。1-2 層・1oz) の最小値より、どれも余裕を持たせてある:

  項目                      JLCPCB の最小            この基板のルール
  線幅 / 間隔               0.10 / 0.10 mm           0.15 / 0.15 mm (ふつうの信号は 0.25 / 0.2)
  ビアの穴 / 外径           0.15 / 0.25 mm           0.3 / 0.6 mm (追加料金のかからない大きさ)
  ビアの外径 - 穴           0.1 mm 以上 (0.15 推奨)   0.3 mm (輪の幅 0.15)
  スルーホールの輪          0.18 mm (0.25 推奨)       0.2 mm 以上
  穴と穴 (パッド)           0.45 mm                  0.45 mm
  穴と線 (めっきあり)       0.28 mm (0.35 推奨)       0.3 mm
  穴と線 (めっきなし)       0.2 mm                   0.2 mm
  銅と外形                  0.2 mm                   0.3 mm
  シルクの線幅 / 文字の高さ  0.15 / 1.0 mm            0.15 / 1.0 mm
  シルクとパッド            0.15 mm                  0.15 mm

使い方: python scripts/gen_project.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Power: 太い線は make_board.py が幅を決めて手で引く。ここの 0.5mm は、自動配線が引く枝 (分圧の抵抗などへの細い線) の幅
POWER_NETS = ["VIN", "VBUS1", "VBUS2", "+3V3", "+3V3_BUCK", "+3V3AUX", "SW_3V3", "+12V", "+12V_BOOST", "+12V_SW",
              "SW_12V", "+5V", "USBH_VBUS"]


# 基板の設定 (下限) より厳しくしたい所を、条件つきのルールで書く。
# 穴と銅: JLCPCB の最小は、めっきのない穴 (NPTH) が 0.2mm、めっきのある穴が 0.28mm (推奨 0.35mm)。
# 基板の設定は 0.2mm (下限) にしておき、NPTH が相手でないときは 0.3mm を求める。
# NPTH だけ 0.2mm まで許すのは、PCIe スロットの位置決めの柱の穴と 11 番ピンの間隔が、
# 部品の寸法で 0.22mm に決まっているため。
DRU = """(version 1)

(rule "Plated hole to copper of another net: 0.3mm"
	(condition "!(A.Pad_Type == 'NPTH, mechanical') && !(B.Pad_Type == 'NPTH, mechanical')")
	(constraint hole_clearance (min 0.3mm)))
"""


def netclass(name, clearance, width, **kw):
    d = {
        "bus_width": 12, "clearance": clearance, "diff_pair_gap": 0.15, "diff_pair_via_gap": 0.25,
        "diff_pair_width": 0.8, "line_style": 0, "microvia_diameter": 0.3, "microvia_drill": 0.1, "name": name,
        "pcb_color": "rgba(0, 0, 0, 0.000)", "priority": 0 if name != "Default" else 2147483647,
        "schematic_color": "rgba(0, 0, 0, 0.000)", "track_width": width, "via_diameter": 0.6, "via_drill": 0.3,
        "wire_width": 6,
    }
    d.update(kw)
    return d


def main():
    pro = {
        "board": {
            "design_settings": {
                "defaults": {"silk_line_width": 0.15, "silk_text_size_h": 1.0, "silk_text_size_v": 1.0,
                             "silk_text_thickness": 0.15},
                "rules": {
                    "max_error": 0.005,
                    "min_clearance": 0.15,
                    "min_connection": 0.0,
                    "min_copper_edge_clearance": 0.3,
                    "min_groove_width": 0.0,
                    "min_hole_clearance": 0.2,
                    "min_hole_to_hole": 0.45,
                    "min_microvia_diameter": 0.2,
                    "min_microvia_drill": 0.1,
                    "min_resolved_spokes": 1,
                    "min_silk_clearance": 0.0,
                    "min_text_height": 1.0,
                    "min_text_thickness": 0.15,
                    "min_through_hole_diameter": 0.3,
                    "min_track_width": 0.15,
                    "min_via_annular_width": 0.15,
                    "min_via_diameter": 0.6,
                    "solder_mask_to_copper_clearance": 0.0,
                    "use_height_for_length_calcs": True,
                },
                "rule_severities": {
                    # 既定のまま。ここに書いたものだけ既定から変えている
                    "lib_footprint_issues": "ignore",      # フットプリントは基板の中で 1 番ピンの印などを足しているため
                    "lib_footprint_mismatch": "ignore",
                },
                "track_widths": [0.0, 0.2, 0.25, 0.4, 0.8, 1.0, 1.5, 2.0],
                "via_dimensions": [{"diameter": 0.0, "drill": 0.0}, {"diameter": 0.6, "drill": 0.3},
                                   {"diameter": 0.8, "drill": 0.4}],
                "zones_allow_external_fillets": False,
            },
            "layer_pairs": [], "layer_presets": [], "viewports": [],
        },
        "boards": [],
        "cvpcb": {"equivalence_files": []},
        "libraries": {"pinned_footprint_libs": ["pcie-tuner"], "pinned_symbol_libs": ["pcie-tuner"]},
        "meta": {"filename": "pcie-tuner-board.kicad_pro", "version": 3},
        "net_settings": {
            "classes": [
                netclass("Default", 0.2, 0.25),
                netclass("Power", 0.2, 0.5, priority=1),
                netclass("GND", 0.2, 0.5, priority=3),
                netclass("USB", 0.2, 0.8, priority=2, diff_pair_width=0.8, diff_pair_gap=0.15),
            ],
            "meta": {"version": 4},
            "net_colors": None,
            "netclass_assignments": None,
            "netclass_patterns": [{"netclass": "Power", "pattern": "/" + n} for n in POWER_NETS]
            + [{"netclass": "USB", "pattern": "/USB_D[PN]"}, {"netclass": "GND", "pattern": "/GND"}],
        },
        "pcbnew": {"last_paths": {}, "page_layout_descr_file": ""},
        "schematic": {"legacy_lib_dir": "", "legacy_lib_list": []},
        "sheets": [],
        "text_variables": {},
    }
    with open(os.path.join(ROOT, "pcie-tuner-board.kicad_pro"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(pro, fh, indent=2)
        fh.write("\n")
    with open(os.path.join(ROOT, "pcie-tuner-board.kicad_dru"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(DRU)
    print("wrote pcie-tuner-board.kicad_pro and .kicad_dru")


if __name__ == "__main__":
    main()
