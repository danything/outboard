#!/usr/bin/env python3
"""Run the four scenes (plug / on / off / short) with ngspice and write
results.csv + plug.png / on.png / off.png / short.png next to this file.

Usage (inside the Linux container, cwd = this folder):  python3 sim.py
"""
import csv
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
TMP = "/tmp/hsrun"
os.makedirs(TMP, exist_ok=True)

PLANS = {
    "A": dict(R14="100k", R15="150k", C20="1u", C32="33n"),
    "B": dict(R14="100k", R15="33k", C20="1u", C32="47n"),
    "C": dict(R14="100k", R15="100k", C20="100n", C32="47n"),
    # tuning candidates (numbers only, not plotted)
    "D": dict(R14="100k", R15="150k", C20="2.2u", C32="33n"),
    "E": dict(R14="100k", R15="220k", C20="1u", C32="22n"),
}
PLOT = ("A", "B", "C")
PLAN_LABEL = {
    "A": "A: R15=150k C20=1u C32=33n",
    "B": "B: R15=33k C20=1u C32=47n",
    "C": "C: R15=100k C20=100n C32=47n",
}
COLOR = {"A": "#2a78d6", "B": "#eb6834", "C": "#1baf7a"}
VTH = {"typ": "-0.9", "min": "-0.5"}
NOLOAD = "1e9"

_counter = [0]


def run(scene, **params):
    """Run one deck with overridden .param values, return dict of numpy arrays."""
    _counter[0] += 1
    n = _counter[0]
    deck = open(os.path.join(HERE, scene + ".cir")).read()
    for k, v in params.items():
        deck, cnt = re.subn(r"(?m)^\.param %s=\S+" % k, ".param %s=%s" % (k, v), deck)
        if cnt != 1:
            raise RuntimeError("param %s not found in %s.cir" % (k, scene))
    deck = deck.replace(".include hs_switch.cir", ".include " + os.path.join(HERE, "hs_switch.cir"))
    m = re.search(r"(?m)^\.tran (.*)$", deck)
    tran = m.group(1)
    deck = deck.replace(m.group(0), "")
    out = os.path.join(TMP, "r%d.txt" % n)
    ctl = (
        ".control\nset wr_singlescale\ntran %s\n"
        "wrdata %s v(s) v(g) v(d) v(out) i(vid)\n.endc\n.end\n" % (tran, out)
    )
    deck = re.sub(r"(?m)^\.end\s*$", ctl, deck)
    path = os.path.join(TMP, "r%d.cir" % n)
    with open(path, "w") as f:
        f.write(deck)
    p = subprocess.run(["ngspice", "-b", path], capture_output=True, text=True)
    if not os.path.exists(out):
        sys.stderr.write(p.stdout[-3000:] + p.stderr[-3000:])
        raise RuntimeError("ngspice failed: %s %r" % (scene, params))
    a = np.loadtxt(out)
    r = dict(t=a[:, 0], s=a[:, 1], g=a[:, 2], d=a[:, 3], out=a[:, 4], id=a[:, 5])
    r["vgs"] = r["g"] - r["s"]
    r["p"] = (r["s"] - r["d"]) * r["id"]
    return r


def integ(y, t, t0=None, t1=None):
    m = np.ones_like(t, dtype=bool)
    if t0 is not None:
        m &= t >= t0
    if t1 is not None:
        m &= t <= t1
    y, t = y[m], t[m]
    return float(np.sum((y[1:] + y[:-1]) * 0.5 * np.diff(t)))


def cross(t, y, level, rising, t0=0.0):
    """First time after t0 where y crosses level (linear interpolation); nan if never."""
    idx = np.where(t >= t0)[0]
    for i in idx[1:]:
        a, b = y[i - 1], y[i]
        if (rising and a < level <= b) or ((not rising) and a > level >= b):
            if b == a:
                return float(t[i])
            return float(t[i - 1] + (level - a) / (b - a) * (t[i] - t[i - 1]))
    return float("nan")


def at(t, y, tq):
    return float(np.interp(tq, t, y))


def ms(x):
    return round(x * 1e3, 3)


# ----------------------------------------------------------------------------
jobs = []  # (key, scene, params)


def add(key, scene, **params):
    jobs.append((key, scene, params))


for plan, pv in PLANS.items():
    for vth, vto in VTH.items():
        # scene 1
        for vin in ("4.6", "8.6", "19.6"):
            for tr in ("10u", "100u", "1m"):
                add(("plug", plan, vth, vin, tr), "plug", VIN=vin, TR=tr, VTO=vto, **pv)
        # scene 2
        for cl in ("100u", "220u"):
            for rl in (NOLOAD, "24"):
                add(("on", plan, vth, cl, rl, "44u", "12.36"), "on", CL=cl, RL=rl, VTO=vto, **pv)
        add(("on", plan, vth, "220u", NOLOAD, "20u", "12.36"), "on", CL="220u", CS="20u", VTO=vto, **pv)
        add(("on", plan, vth, "100u", NOLOAD, "44u", "13.8"), "on", VBST="13.8", VTO=vto, **pv)
        # scene 3
        for cl in ("100u", "220u"):
            add(("off", plan, vth, cl), "off", CL=cl, VTO=vto, **pv)
        # scene 4
        add(("short", plan, vth), "short", VTO=vto, **pv)

with ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as ex:
    res = list(ex.map(lambda j: run(j[1], **j[2]), jobs))
R = {j[0]: r for j, r in zip(jobs, res)}

rows = []
T0 = 1e-3  # every event starts at 1 ms

for key, r in R.items():
    t = r["t"]
    scene, plan, vth = key[0], key[1], key[2]
    row = dict(scene=scene, plan=plan, vth=vth)
    if scene == "plug":
        row.update(vin_V=key[3], rise=key[4], CL="100u", load="none")
        below = (r["vgs"] < -0.5).astype(float)
        row.update(
            vgs_min_V=round(float(r["vgs"].min()), 4),
            t_absvgs_gt_0p5_ms=ms(integ(below, t)),
            vd_max_V=round(float(r["d"].max()), 4),
            vout_max_V=round(float(r["out"].max()), 4),
            id_max_mA=round(float(r["id"].max()) * 1e3, 4),
        )
    elif scene == "on":
        cl, rl, cs, vb = key[3], key[4], key[5], key[6]
        row.update(CL=cl, load="none" if rl == NOLOAD else rl + "ohm", CS=cs, vbst_V=vb)
        vf = float(r["out"][-1])
        t10 = cross(t, r["out"], 0.1 * vf, True, T0)
        t90 = cross(t, r["out"], 0.9 * vf, True, T0)
        row.update(
            vout_final_V=round(vf, 3),
            t_delay_10pct_ms=ms(t10 - T0),
            t_rise_10_90_ms=ms(t90 - t10),
            slew_V_per_ms=round(0.8 * vf / (t90 - t10) / 1e3, 3),
            id_max_A=round(float(r["id"].max()), 3),
            s_min_V=round(float(r["s"].min()), 3),
            s_dip_V=round(float(r["s"][0] - r["s"].min()), 3),
            vgs_final_V=round(float(r["vgs"][-1]), 3),
        )
    elif scene == "off":
        row.update(CL=key[3], load="24ohm")
        v0 = at(t, r["out"], T0)
        t90 = cross(t, r["out"], 0.9 * v0, False, T0)
        t10 = cross(t, r["out"], 0.1 * v0, False, T0)
        t05 = cross(t, r["out"], 0.5, False, T0)
        row.update(
            vout_start_V=round(v0, 3),
            t_delay_90pct_ms=ms(t90 - T0),
            t_fall_90_10_ms=ms(t10 - t90),
            t_to_0p5V_ms=ms(t05 - T0),
            e_q1_mJ=round(integ(r["p"], t, T0, t05) * 1e3, 2),
            e_q1_fall_only_mJ=round(integ(r["p"], t, t90, t05) * 1e3, 2),
            p_max_W=round(float(r["p"][t >= T0].max()), 3),
        )
    elif scene == "short":
        row.update(CL="100u", load="24ohm + 0.1ohm short")
        toff = 51e-3
        tstop = cross(t, r["id"], 0.010, False, toff)
        row.update(
            id_max_A=round(float(r["id"].max()), 2),
            id_at_50ms_A=round(at(t, r["id"], toff), 3),
            s_min_V=round(float(r["s"][(t >= T0) & (t <= toff)].min()), 3),
            s_at_50ms_V=round(at(t, r["s"], toff), 3),
            vgs_at_50ms_V=round(at(t, r["vgs"], toff), 3),
            e_q1_50ms_mJ=round(integ(r["p"], t, T0, toff) * 1e3, 1),
            p_max_W=round(float(r["p"].max()), 2),
            p_at_50ms_W=round(at(t, r["p"], toff), 3),
            t_stop_after_off_ms=ms(tstop - toff),
            e_q1_after_off_mJ=round(integ(r["p"], t, toff, tstop) * 1e3, 1),
        )
    rows.append(row)

cols = []
for row in rows:
    for k in row:
        if k not in cols:
            cols.append(k)
with open(os.path.join(HERE, "results.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    w.writerows(rows)

# ----------------------------------------------------------------------------
# plots
plt.rcParams.update({
    "font.size": 9, "axes.grid": True, "grid.color": "#e4e3df", "grid.linewidth": 0.6,
    "axes.edgecolor": "#8a8983", "axes.spines.top": False, "axes.spines.right": False,
    "figure.facecolor": "#fcfcfb", "axes.facecolor": "#fcfcfb", "lines.linewidth": 1.6,
    "legend.frameon": False, "axes.titlesize": 10,
})


def tms(r):
    return (r["t"] - T0) * 1e3


def finish(fig, name, title):
    fig.suptitle(title, fontsize=11)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, name), dpi=130)
    plt.close(fig)


# plug.png: columns = VIN, rows = Vgs / Vout. 10 us edge, Vth min (worst case for leakage)
fig, ax = plt.subplots(2, 3, figsize=(13, 6.5), sharex=True)
for c, vin in enumerate(("4.6", "8.6", "19.6")):
    for plan in PLOT:
        r = R[("plug", plan, "min", vin, "10u")]
        ax[0][c].plot(tms(r), r["vgs"], color=COLOR[plan], label=PLAN_LABEL[plan])
        ax[1][c].plot(tms(r), r["out"], color=COLOR[plan], label=PLAN_LABEL[plan])
    ax[0][c].axhline(-0.5, color="#52514e", lw=0.9, ls="--")
    ax[0][c].axhline(-0.9, color="#52514e", lw=0.9, ls=":")
    ax[0][c].text(395, -0.5, "Vth min -0.5 V", ha="right", va="bottom", fontsize=8, color="#52514e")
    ax[0][c].text(395, -0.9, "Vth typ -0.9 V", ha="right", va="bottom", fontsize=8, color="#52514e")
    ax[0][c].set_title("S: 0 -> %s V in 10 us" % vin)
    ax[0][c].set_ylabel("Vgs = V(G)-V(S) [V]")
    ax[1][c].set_ylabel("V(OUT) [V]")
    ax[1][c].set_xlabel("time after plug [ms]")
    ax[1][c].set_xlim(-10, 400)
ax[1][0].legend(loc="center right")
finish(fig, "plug.png", "Scene 1: hot plug, SWN off (Q1 Vth = -0.5 V model, CL = 100 uF, no load)")

# on.png
fig, ax = plt.subplots(2, 2, figsize=(12, 7.5))
for plan in PLOT:
    for cl, ls in (("100u", "-"), ("220u", "--")):
        r = R[("on", plan, "typ", cl, NOLOAD, "44u", "12.36")]
        lab = "%s, CL=%s" % (PLAN_LABEL[plan], cl)
        ax[0][0].plot(tms(r), r["out"], color=COLOR[plan], ls=ls, label=lab)
        ax[0][1].plot(tms(r), r["id"], color=COLOR[plan], ls=ls, label=lab)
        ax[1][0].plot(tms(r), r["s"], color=COLOR[plan], ls=ls, label=lab)
        ax[1][1].plot(tms(r), r["vgs"], color=COLOR[plan], ls=ls, label=lab)
for a, yl in ((ax[0][0], "V(OUT) [V]"), (ax[0][1], "Q1 drain current [A]"),
              (ax[1][0], "V(S) [V]"), (ax[1][1], "Vgs [V]")):
    a.set_ylabel(yl)
    a.set_xlabel("time after SWN on [ms]")
    a.set_xlim(-2, 40)
ax[1][1].set_xlim(-10, 400)
ax[1][1].axhline(-12, color="#e34948", lw=0.9, ls="--")
ax[1][1].text(395, -12, "Vgs abs max -12 V", ha="right", va="bottom", fontsize=8, color="#52514e")
ax[0][0].legend(loc="lower right", fontsize=8)
finish(fig, "on.png", "Scene 2: turn on, S = 12.36 V via 1 ohm + 44 uF, no load (solid CL=100 uF, dashed CL=220 uF, Vth typ)")

# off.png
fig, ax = plt.subplots(3, 1, figsize=(10, 9), sharex=True)
for plan in PLOT:
    for cl, ls in (("100u", "-"), ("220u", "--")):
        r = R[("off", plan, "typ", cl)]
        lab = "%s, CL=%s" % (PLAN_LABEL[plan], cl)
        ax[0].plot(tms(r), r["out"], color=COLOR[plan], ls=ls, label=lab)
        ax[1].plot(tms(r), r["vgs"], color=COLOR[plan], ls=ls, label=lab)
        ax[2].plot(tms(r), r["p"], color=COLOR[plan], ls=ls, label=lab)
ax[0].set_ylabel("V(OUT) [V]")
ax[1].set_ylabel("Vgs [V]")
ax[2].set_ylabel("Q1 power Vds*Id [W]")
ax[2].set_xlabel("time after SWN off [ms]")
ax[2].set_xlim(-10, 450)
ax[0].legend(loc="upper right", fontsize=8)
finish(fig, "off.png", "Scene 3: turn off from 0.5 A (24 ohm) steady state (solid CL=100 uF, dashed CL=220 uF, Vth typ)")

# short.png
fig, ax = plt.subplots(2, 2, figsize=(12, 7.5), sharex=True)
for plan in PLOT:
    for vth, ls in (("typ", "-"), ("min", "--")):
        r = R[("short", plan, vth)]
        lab = "%s, Vth %s" % (PLAN_LABEL[plan], vth)
        ax[0][0].plot(tms(r), r["id"], color=COLOR[plan], ls=ls, label=lab)
        ax[0][1].plot(tms(r), r["s"], color=COLOR[plan], ls=ls, label=lab)
        ax[1][0].plot(tms(r), r["p"], color=COLOR[plan], ls=ls, label=lab)
        ax[1][1].plot(tms(r), r["vgs"], color=COLOR[plan], ls=ls, label=lab)
for a, yl in ((ax[0][0], "Q1 drain current [A]"), (ax[0][1], "V(S) [V]"),
              (ax[1][0], "Q1 power Vds*Id [W]"), (ax[1][1], "Vgs [V]")):
    a.set_ylabel(yl)
    a.axvline(50, color="#52514e", lw=0.9, ls=":")
    a.set_xlim(-5, 300)
ax[1][0].set_xlabel("time after short [ms]  (dotted line: SWN off at 50 ms)")
ax[1][1].set_xlabel("time after short [ms]  (dotted line: SWN off at 50 ms)")
ax[0][0].legend(loc="upper right", fontsize=8)
finish(fig, "short.png", "Scene 4: OUT shorted through 0.1 ohm at t=0, SWN off at 50 ms (F1 = 0.2 ohm, source 12.36 V via 1 ohm)")

# ----------------------------------------------------------------------------
# console summary
def g(key, col):
    for row in rows:
        if row["_k"] == key:
            return row[col]


for row, (key, _) in zip(rows, R.items()):
    row["_k"] = key

print("== plug: vgs_min / t(|Vgs|>0.5) ms / vd_max / vout_max / id_max mA")
for plan in PLANS:
    for vth in VTH:
        for vin in ("4.6", "8.6", "19.6"):
            for tr in ("10u", "100u", "1m"):
                k = ("plug", plan, vth, vin, tr)
                print(plan, vth, vin, tr, g(k, "vgs_min_V"), g(k, "t_absvgs_gt_0p5_ms"),
                      g(k, "vd_max_V"), g(k, "vout_max_V"), g(k, "id_max_mA"))
print("== on: delay10 / rise / slew / id_max / s_dip / vgs_final / vout_final")
for k in R:
    if k[0] == "on":
        print(*k[1:], g(k, "t_delay_10pct_ms"), g(k, "t_rise_10_90_ms"), g(k, "slew_V_per_ms"),
              g(k, "id_max_A"), g(k, "s_dip_V"), g(k, "vgs_final_V"), g(k, "vout_final_V"))
print("== off: delay90 / fall / t0.5V / E mJ / E fall-only mJ / Pmax")
for k in R:
    if k[0] == "off":
        print(*k[1:], g(k, "t_delay_90pct_ms"), g(k, "t_fall_90_10_ms"), g(k, "t_to_0p5V_ms"),
              g(k, "e_q1_mJ"), g(k, "e_q1_fall_only_mJ"), g(k, "p_max_W"))
print("== short: id_max / id50 / s_min / s50 / vgs50 / E50 mJ / pmax / p50 / t_stop / E_after")
for k in R:
    if k[0] == "short":
        print(*k[1:], g(k, "id_max_A"), g(k, "id_at_50ms_A"), g(k, "s_min_V"), g(k, "s_at_50ms_V"),
              g(k, "vgs_at_50ms_V"), g(k, "e_q1_50ms_mJ"), g(k, "p_max_W"), g(k, "p_at_50ms_W"),
              g(k, "t_stop_after_off_ms"), g(k, "e_q1_after_off_mJ"))
