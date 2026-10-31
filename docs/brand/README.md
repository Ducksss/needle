# Needle brand

## Name and line

**Needle.** Operators look for the few conjunctions that matter among thousands of messages: a needle in a haystack. An avoidance burn also has to thread the needle, opening enough miss distance with the least Δv.

Tagline: **Pc-first conjunction triage.**

## Mark

<img src="needle-mark.svg" width="96" alt="Needle mark"> <img src="needle-mark-tile.svg" width="96" alt="Needle app tile">

An orbit ring passes through the eye of a needle, and an orange dot on the ring is the satellite. The needle runs off-centre, so the mark never reads as a "prohibited" sign.

- Clear space: at least the ring's radius on every side.
- Minimum size: 16 px for the tile version (favicon), 24 px for the open mark.
- Do not rotate, outline, or recolour the parts. Do not drop the orange dot.

## Colour

The colours match the console's tokens. Each one has one meaning in the product.

| Token | Hex | Meaning |
|---|---|---|
| Ink | `#0F172A` | Text, needle on light backgrounds, tile background |
| Deep ink | `#0B1220` | Cover and dark backgrounds |
| Teal | `#0F766E` (light bg), `#2DD4BF` (dark bg) | Brand ring; in the product, approved and safe states only |
| Hot orange | `#F97316` | The satellite dot; Pc ≥ 1e-4 in charts |
| Risk | `#C2410C` | Risk text and Decide chips |
| Watch blue | `#2563EB` | Distance-only alerts |
| Hidden amber | `#B45309` | Pc ≥ 1e-6 while far apart |
| Action violet | `#6D28D9` | Proposed burns and approve actions |
| Deadline red | `#DC2626` | Decision deadlines and unmitigated passes |

## Type

- **Manrope** (500, 700, 800) for words. The wordmark is Manrope 800 with -0.035 em tracking.
- **IBM Plex Mono** (400, 500) for numbers: Pc, distances, Δv, times.

## Files

| File | Use |
|---|---|
| `needle-mark.svg` | Mark on light backgrounds |
| `needle-mark-dark.svg` | Mark on dark backgrounds |
| `needle-mark-tile.svg` | App icon and favicon |
| `needle-lockup.png`, `needle-lockup-dark.png` | Mark, wordmark and tagline for light and dark backgrounds, rendered at 2× |
| `needle-cover@2x.png` | 2560 × 1280 cover (876 KB): README hero, slides, GitHub social preview |
| `needle-cover.png` | 1280 × 640 cover: for uploads that need the standard size |

To set the GitHub social preview, open the repository's **Settings → General → Social preview** and upload `needle-cover@2x.png` (under GitHub's 1 MB limit). GitHub has no API for this.

Every number on the cover comes from the verified results in the root README.

## Rebuild

```sh
python3 docs/brand/src/build.py
```

The script writes the SVGs, then renders the PNGs with headless Google Chrome at 2× device pixels (the 1280 × 640 cover at 1×). The cover's dots are the 2,167 test events from `artifacts/fleet.json`.
