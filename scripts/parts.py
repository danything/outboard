"""部品の一覧 (値・フットプリント・LCSC の品番・メーカーの型番)。回路図と基板の両方がここを読む。

FP: 短い名前 -> lib/pcie-tuner.pretty の中のフットプリントの名前。
    easyeda2kicad で作ったものは EasyEDA (JLCPCB のライブラリ) の名前のまま。
PARTS: 部品の種類ごとの定義。sym はダイオードと LED のシンボルの種類
    (フットプリントのパッド 1 がアノードかカソードかで決まる。build_lib.py が EasyEDA のシンボルと突き合わせる)。
"""

FP = {
    "USBC": "USB-C_SMD-TYPE-C-31-M-12_1",
    "PCIE": "CONN-TH_36P-P1.00-V_3183-XXXXXPXT",
    "HDR10": "HDR-TH_10P-P2.54-V-M-R2-C5-S2.54",
    "HDR2": "HDR-TH_2P-P2.54-V-M",
    "ESSOP10": "ESSOP-10_L4.9-W3.9-P1.0-LS6.0-TL-EP",
    "SOT583": "SOT-583-8_L2.1-W1.2-P0.50-LS1.6-BR",
    "SOT23-6": "SOT-23-6_L2.9-W1.6-P0.95-LS2.8-BR",
    "SOT89": "SOT-89-3_L4.5-W2.5-P1.50-LS4.2-BR",
    "TSSOP20": "TSSOP-20_L6.5-W4.4-P0.65-LS6.4-BL",
    "SOT23_AO3401": "SOT-23_L2.9-W1.3-P1.90-LS2.4-BR",
    "F1206": "F1206",
    "SOT23_2N": "SOT-23-3_L2.9-W1.3-P1.90-LS2.4-BR",
    "SMA_SS54": "SMA_L4.4-W2.8-LS5.4-R-RD",
    "SMA_SS34": "SMA_L4.3-W2.6-LS5.2-RD",
    "SOD123F": "SOD-123F_L2.7-W1.6-LS3.8-RD",
    "IND": "IND-SMD_L7.0-W6.6",
    "SW": "SW-TH_MSK12C02",
    "LED_R": "LED-SMD_L1.6-W0.8-R-RD",
    "R0603": "R0603",
    "C0603": "C0603",
    "C0805": "C0805",
    # KiCad 10.0.8 の標準ライブラリから写したもの (部品を載せない)
    "TP": "TestPoint_Pad_D1.5mm",
    "HOLE": "MountingHole_3.2mm_M3",
    "JP_SOLDER": "SolderJumper-2_P1.3mm_Bridged_RoundedPad1.0x1.5mm",
}


def _r(value, lcsc, mpn):
    return dict(value=value, fp="R0603", lcsc=lcsc, mpn=mpn, desc=f"Resistor {value} 1% 0603")


def _c(value, fp, lcsc, mpn):
    return dict(value=value, fp=fp, lcsc=lcsc, mpn=mpn, desc=f"MLCC {value}")


PARTS = {
    "USBC": dict(value="TYPE-C-31-M-12", fp="USBC", lcsc="C165948", mpn="TYPE-C-31-M-12",
                 desc="USB Type-C receptacle 16P (Korean Hroparts)"),
    "PCIE": dict(value="3183-10200P1T", fp="PCIE", lcsc="C404113", mpn="3183-10200P1T",
                 desc="PCIe x1 slot 36P through-hole (UMAX)"),
    "HDR10": dict(value="PZ254V-12-10P", fp="HDR10", lcsc="C492422", mpn="PZ254V-12-10P",
                  desc="Pin header 2x5 2.54mm (XFCN)"),
    "HDR2": dict(value="PZ254V-11-02P", fp="HDR2", lcsc="C492401", mpn="PZ254V-11-02P",
                 desc="Pin header 1x2 2.54mm (XFCN)"),
    "CH224A": dict(value="CH224A", fp="ESSOP10", lcsc="C42459160", mpn="CH224A", desc="USB PD sink (WCH)"),
    "TPS62933": dict(value="TPS62933DRLR", fp="SOT583", lcsc="C3200405", mpn="TPS62933DRLR",
                     desc="Buck 3.8-30V 3A (TI)"),
    "MT3608B": dict(value="MT3608B", fp="SOT23-6", lcsc="C19189893", mpn="MT3608B", desc="Boost 4A switch (Aerosemi)"),
    "SRV05": dict(value="SRV05-4-P-T7", fp="SOT23-6", lcsc="C85364", mpn="SRV05-4-P-T7",
                  desc="ESD array 4 lines (ProTek)"),
    "HT7550": dict(value="HT7550-1", fp="SOT89", lcsc="C16106", mpn="HT7550-1", desc="LDO 5V 100mA (Holtek)"),
    "CH32V003": dict(value="CH32V003F4P6", fp="TSSOP20", lcsc="C5187096", mpn="CH32V003F4P6", desc="MCU (WCH)"),
    "AO3401A": dict(value="AO3401A", fp="SOT23_AO3401", lcsc="C15127", mpn="AO3401A",
                    desc="P-MOSFET -30V, Vgs +-12V (AOS)"),
    "PTC": dict(value="nSMD075-13.2V", fp="F1206", lcsc="C70079", mpn="nSMD075-13.2V",
                desc="Resettable fuse 0.75A hold / 1.5A trip, 13.2V (TECHFUSE)"),
    "2N7002": dict(value="2N7002", fp="SOT23_2N", lcsc="C8545", mpn="2N7002", desc="N-MOSFET 60V (Changjing)"),
    "SS54": dict(value="SS54", fp="SMA_SS54", lcsc="C22452", mpn="SS54", sym="D_A1K2", desc="Schottky 40V 5A (MDD)"),
    "SS34": dict(value="SS34", fp="SMA_SS34", lcsc="C8678", mpn="SS34", sym="D_K1A2", desc="Schottky 40V 3A (MDD)"),
    "1N4148W": dict(value="1N4148W", fp="SOD123F", lcsc="C81598", mpn="1N4148W", sym="D_K1A2",
                    desc="Switching diode 75V"),
    "L_4U7": dict(value="4.7uH FXL0630", fp="IND", lcsc="C167220", mpn="FXL0630-4R7-M",
                  desc="Inductor 4.7uH 6A (cjiang)"),
    "MSK12C02": dict(value="MSK12C02", fp="SW", lcsc="C431540", mpn="MSK12C02", desc="Slide switch SPDT (SHOU HAN)"),
    "LED_R": dict(value="Red", fp="LED_R", lcsc="C2286", mpn="KT-0603R", sym="LED_A1K2", desc="LED red 0603"),
    "R_6K8": _r("6.8k", "C23212", "0603WAF6801T5E"),
    "R_10K": _r("10k", "C25804", "0603WAF1002T5E"),
    "R_1K": _r("1k", "C21190", "0603WAF1001T5E"),
    "R_100K": _r("100k", "C25803", "0603WAF1003T5E"),
    "R_5K1": _r("5.1k", "C23186", "0603WAF5101T5E"),
    "R_1M": _r("1M", "C22935", "0603WAF1004T5E"),
    "R_47K": _r("47k", "C25819", "0603WAF4702T5E"),
    "R_15K": _r("15k", "C22809", "0603WAF1502T5E"),
    "R_68K": _r("68k", "C23231", "0603WAF6802T5E"),
    "R_33K": _r("33k", "C4216", "0603WAF3302T5E"),
    "R_2K": _r("2k", "C22975", "0603WAF2001T5E"),
    "C_100N": _c("100nF 50V", "C0603", "C14663", "CC0603KRX7R9BB104"),
    "C_1U": _c("1uF 50V", "C0603", "C15849", "CL10A105KB8NNNC"),
    "C_47N": _c("47nF 50V", "C0603", "C1622", "CL10B473KB8NNNC"),
    "C_10U": _c("10uF 25V", "C0805", "C15850", "CL21A106KAYNNNE"),
    "C_22U": _c("22uF 25V", "C0805", "C45783", "CL21A226MAQNNNE"),
    # 部品を載せないもの
    "TP": dict(value="TP", fp="TP", lcsc="", mpn="", desc="Test point pad"),
    "HOLE": dict(value="M3", fp="HOLE", lcsc="", mpn="", desc="Mounting hole 3.2mm"),
    "JP_SOLDER": dict(value="Solder jumper (closed)", fp="JP_SOLDER", lcsc="", mpn="", desc="Solder jumper"),
}

# LCSC の品番 -> EasyEDA のシンボルの名前 (build_lib.py の突き合わせ用)
EASYEDA_SYMBOL = {
    "C165948": "TYPE-C-31-M-12", "C404113": "3183-10200P1T", "C492422": "PZ254V-12-10P", "C492401": "PZ254V-11-02P",
    "C42459160": "CH224A", "C3200405": "TPS62933DRLR", "C19189893": "MT3608B", "C85364": "SRV05-4-P-T7",
    "C16106": "HT7550-1_C16106", "C5187096": "CH32V003F4P6", "C15127": "AO3401A", "C8545": "2N7002",
    "C22452": "SS54_C22452", "C8678": "SS34_C8678", "C81598": "1N4148W_C81598",
    "C167220": "FXL0630-4R7-M", "C431540": "MSK12C02", "C2286": "KT-0603R",
}
