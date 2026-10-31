"""Build Needle's brand assets: mark SVGs, wordmark lockups and the repository cover.

Standard library only. PNGs are rendered with headless Google Chrome.
Run from the repo root: python3 docs/brand/src/build.py
"""
import json
import math
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "docs" / "brand"
SRC = OUT / "src"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

INK, INK_DEEP, SNOW = "#0F172A", "#0B1220", "#F8FAFC"
TEAL, TEAL_LIGHT, HOT = "#0F766E", "#2DD4BF", "#F97316"
FONTS = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800'
         '&family=IBM+Plex+Mono:wght@400;500&display=block">')

# Mark geometry on a 64-unit grid. The orbit ring passes through the needle's eye;
# the needle runs off-centre so the mark never reads as a "prohibited" sign.
RING_C, RING_R = (30.0, 30.0), 19.0
OFFSET = 8.0                                  # needle line distance from the ring centre
U = (math.sin(math.radians(42)), -math.cos(math.radians(42)))   # needle direction, tip to head
N = (-U[1], U[0])
P0 = (RING_C[0] + OFFSET * N[0], RING_C[1] + OFFSET * N[1])
T_EYE = math.sqrt(RING_R ** 2 - OFFSET ** 2)
EYE = (P0[0] + T_EYE * U[0], P0[1] + T_EYE * U[1])
SAT_ANGLE = math.radians(200)
SAT = (RING_C[0] + RING_R * math.cos(SAT_ANGLE), RING_C[1] + RING_R * math.sin(SAT_ANGLE))


def needle_path():
    # tapered shaft with a rounded head; the elliptical eye is cut out with the even-odd rule
    return ("M0 44 L-3.2 -1.8 A3.2 3.2 0 0 1 3.2 -1.8 Z "
            "M-1.15 0.6 A1.15 3.4 0 1 0 1.15 0.6 A1.15 3.4 0 1 0 -1.15 0.6 Z")


def mark_body(needle, ring, sat_edge, ring_w=3.0):
    """SVG elements for the mark on the 64-unit grid: ring behind, needle over it, satellite dot."""
    return (
        f'<circle cx="{RING_C[0]}" cy="{RING_C[1]}" r="{RING_R}" fill="none" stroke="{ring}" stroke-width="{ring_w}"/>'
        f'<g transform="translate({EYE[0]:.2f} {EYE[1]:.2f}) rotate(42)">'
        f'<path fill="{needle}" fill-rule="evenodd" d="{needle_path()}"/></g>'
        f'<circle cx="{SAT[0]:.2f}" cy="{SAT[1]:.2f}" r="3.6" fill="{HOT}" stroke="{sat_edge}" stroke-width="1.6"/>'
    )


def mark_svg(variant):
    if variant == "light":
        body = mark_body(INK, TEAL, "#FFFFFF")
        bg = ""
    elif variant == "dark":
        body = mark_body(SNOW, TEAL_LIGHT, INK_DEEP)
        bg = ""
    else:
        body = mark_body(SNOW, TEAL_LIGHT, INK)
        bg = f'<rect width="64" height="64" rx="14" fill="{INK}"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" '
            f'role="img" aria-label="Needle">{bg}{body}</svg>\n')


def lockup_html(dark):
    fg = SNOW if dark else INK
    sub = "#94A3B8" if dark else "#475569"
    body = mark_body(SNOW, TEAL_LIGHT, INK_DEEP) if dark else mark_body(INK, TEAL, "#FFFFFF")
    return f"""<!doctype html><html><head><meta charset="utf-8">{FONTS}
<style>html,body{{margin:0;background:transparent}}
.l{{display:flex;align-items:center;gap:22px;padding:20px 28px;width:max-content}}
.w{{font:800 76px/1 'Manrope',sans-serif;letter-spacing:-0.035em;color:{fg}}}
.t{{font:500 19px/1.3 'Manrope',sans-serif;color:{sub};margin-top:8px;letter-spacing:0.01em}}</style></head>
<body><div class="l"><svg viewBox="8 8 50 50" width="96" height="96">{body}</svg>
<div><div class="w">Needle</div><div class="t">Pc-first conjunction triage</div></div></div></body></html>"""


def cover_html():
    fleet = json.loads((ROOT / "artifacts" / "fleet.json").read_text())
    dots = fleet["dots"]
    cx, cy, r = 965.0, 318.0, 196.0
    order = {0: 0, 1: 1, 2: 2, 3: 3}
    marks = []
    for k, d in enumerate(sorted(dots, key=lambda d: order[d[3]])):
        code, eid = d[3], d[4]
        h1 = (math.sin(eid * 12.9898 + 1.7) * 43758.5453) % 1
        h2 = (math.sin(eid * 78.233 + 3.1) * 12345.6789) % 1
        ang = h1 * 2 * math.pi
        spread = {0: 74, 1: 40, 2: 52, 3: 16}[code]
        rr = r + (h2 - 0.5) * 2 * spread
        x, y = cx + rr * math.cos(ang), cy + rr * math.sin(ang) * 0.92
        size = {0: 1.6, 1: 2.4, 2: 2.6, 3: 4.2}[code]
        color = {0: "#334155", 1: "#3B82F6", 2: "#D97706", 3: HOT}[code]
        op = {0: 0.85, 1: 0.9, 2: 0.95, 3: 1}[code]
        marks.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{size}" fill="{color}" fill-opacity="{op}"/>')
    n = {c: sum(1 for d in dots if d[3] == c) for c in range(4)}
    s = r / RING_R
    ex, ey = cx + (EYE[0] - RING_C[0]) * s, cy + (EYE[1] - RING_C[1]) * s
    fx, fy = cx + r * math.cos(math.radians(205)), cy + r * math.sin(math.radians(205)) * 0.92
    return f"""<!doctype html><html><head><meta charset="utf-8">{FONTS}
<style>
html,body{{margin:0;width:1280px;height:640px;overflow:hidden;background:{INK_DEEP}}}
.c{{position:relative;width:1280px;height:640px;font-family:'Manrope',sans-serif;color:{SNOW};
background:radial-gradient(900px 520px at 980px 330px,rgba(45,212,191,0.10),transparent 60%),{INK_DEEP}}}
.grid{{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,0.035) 1px,transparent 1px),
linear-gradient(90deg,rgba(255,255,255,0.035) 1px,transparent 1px);background-size:40px 40px}}
.left{{position:absolute;left:80px;top:64px;width:600px}}
.brand{{display:flex;align-items:center;gap:14px}}
.brand span{{font:800 34px/1 'Manrope';letter-spacing:-0.03em}}
h1{{margin:44px 0 0;font:800 56px/1.04 'Manrope';letter-spacing:-0.035em}}
h1 em{{font-style:normal;color:{TEAL_LIGHT}}}
p{{margin:18px 0 0;font:500 19px/1.45 'Manrope';color:#CBD5E1;width:540px}}
.stats{{position:absolute;left:80px;bottom:92px;display:flex;gap:44px}}
.stat b{{display:block;font:500 34px/1 'IBM Plex Mono';letter-spacing:-0.02em}}
.stat span{{display:block;margin-top:8px;font:500 14px/1.35 'Manrope';color:#94A3B8;width:170px}}
.foot{{position:absolute;left:80px;right:80px;bottom:34px;display:flex;justify-content:space-between;
font:500 13px/1 'IBM Plex Mono';color:#64748B;letter-spacing:0.02em}}
.call{{position:absolute;left:{fx + 34:.0f}px;top:{fy + 22:.0f}px;padding:10px 12px;border:1px solid #334155;border-radius:8px;
background:rgba(11,18,32,0.92);font:400 13px/1.5 'IBM Plex Mono';color:#CBD5E1;width:max-content}}
.call b{{color:{HOT};font-weight:500}}
.key{{position:absolute;right:64px;top:56px;display:flex;flex-direction:column;gap:7px;padding:10px 12px;border:1px solid #1E293B;
border-radius:8px;background:rgba(11,18,32,0.88);font:400 12.5px/1 'IBM Plex Mono';color:#94A3B8}}
.key i{{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px;vertical-align:0}}
</style></head><body><div class="c"><div class="grid"></div>
<svg width="1280" height="640" style="position:absolute;inset:0">
<ellipse cx="{cx}" cy="{cy}" rx="{r}" ry="{r * 0.92:.1f}" fill="none" stroke="{TEAL_LIGHT}" stroke-opacity="0.55" stroke-width="2"/>
{''.join(marks)}
<circle cx="{fx:.1f}" cy="{fy:.1f}" r="15" fill="none" stroke="{HOT}" stroke-width="1.5" stroke-opacity="0.7"/>
<circle cx="{fx:.1f}" cy="{fy:.1f}" r="27" fill="none" stroke="{HOT}" stroke-width="1" stroke-opacity="0.3"/>
<g transform="translate({ex:.1f} {ey:.1f}) rotate(42) scale({s * 0.98:.2f})"><path fill="{SNOW}" fill-rule="evenodd" d="{needle_path()}"/></g>
</svg>
<div class="left">
<div class="brand"><svg viewBox="8 8 50 50" width="44" height="44">{mark_body(SNOW, TEAL_LIGHT, INK_DEEP)}</svg><span>Needle</span></div>
<h1>Find the few<br>conjunctions that<br><em>need a burn.</em></h1>
<p>Pc-first triage for satellite operators: rank every conjunction by the decision it needs, then plan the burn.</p>
</div>
<div class="key"><span><i style="background:{HOT}"></i>Pc ≥ 1e-4 · {n[3]}</span><span><i style="background:#D97706"></i>Pc ≥ 1e-6, far · {n[2]}</span>
<span><i style="background:#3B82F6"></i>miss &lt; 1 km only · {n[1]}</span><span><i style="background:#475569"></i>other · {n[0]:,}</span></div>
<div class="call"><b>#891</b> · ESA-02 vs debris<br>Pc 1.3e-3 (1 in 780) · miss 503 m<br>burn 7.0 mm/s retrograde</div>
<div class="stats">
<div class="stat"><b>186 → 23</b><span>Critical alerts that are Pc-confirmed (ESA test set)</span></div>
<div class="stat"><b>150 / 167</b><span>events that end Critical, flagged 2 days ahead</span></div>
<div class="stat"><b>1.25×</b><span>median Δv cost of waiting 24 h to burn</span></div>
</div>
<div class="foot"><span>AUTONOMOUS SG 2026 · AIRBUS CHALLENGE #1</span><span>{len(dots):,} ESA TEST EVENTS · LATEST MESSAGE</span></div>
</div></body></html>"""


def render(html_path, png_path, w, h, transparent=False):
    args = [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
            f"--window-size={w},{h}", "--virtual-time-budget=6000", f"--screenshot={png_path}"]
    if transparent:
        args.append("--default-background-color=00000000")
    subprocess.run(args + [html_path.as_uri()], check=True, capture_output=True)


def main():
    for v, name in [("light", "needle-mark.svg"), ("dark", "needle-mark-dark.svg"), ("tile", "needle-mark-tile.svg")]:
        (OUT / name).write_text(mark_svg(v))
    for dark, name in [(False, "needle-lockup"), (True, "needle-lockup-dark")]:
        p = SRC / f"{name}.html"
        p.write_text(lockup_html(dark))
        render(p, OUT / f"{name}.png", 520, 136, transparent=True)
    p = SRC / "cover.html"
    p.write_text(cover_html())
    render(p, OUT / "needle-cover.png", 1280, 640)
    print("built", sorted(x.name for x in OUT.iterdir() if x.is_file()))


if __name__ == "__main__":
    main()
