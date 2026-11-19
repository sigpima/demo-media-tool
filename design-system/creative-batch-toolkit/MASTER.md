# Design System Master — Creative Batch Toolkit

**Source of truth:** the Stitch export in `resource/stitch_creative_batch_toolkit/` (kept locally, not in git) (`DESIGN.md`, `code.html`, `screen.png`),
ported to React + Tailwind in `frontend/`. This file records (1) the tokens we actually use,
(2) what we **changed** from Stitch and why, and (3) what we **removed** because it is not in the MVP.
Earlier drafts of this file and `prototype/index.html` were an alternative design and are kept only for reference.

**Stack:** React + TypeScript + Vite · Tailwind v3 · Radix primitives (Slider, Switch) · lucide-react icons ·
fonts self-hosted via `@fontsource` (no Google Fonts request at runtime).
**Viewport:** desktop-first (≥ 1200px full layout; < 1200px the inspector becomes a slide-over tray).

---

## 1. Tokens (from `code.html` Tailwind config)

| Token | Hex | Use |
|---|---|---|
| `surface-container-lowest` | `#0c0e12` | App canvas / main area |
| `surface-dim` | `#0e1014` | Scrollbar track alt |
| `surface` | `#111317` | Header, sidebar, inspector, cards |
| `surface-container-low` | `#14161b` | Nested boxes, thumb placeholder |
| `surface-container` | `#1a1c22` | Inputs, chips, hover fill |
| `surface-container-high` | `#22252c` | Hover on containers, progress track |
| `surface-container-highest` | `#2e313b` | Active nav / active segment |
| `surface-bright` | `#383c48` | Scrollbar hover |
| `outline-variant` | `#2b2f3a` | Borders (used at 40–60% alpha) |
| `on-surface` | `#e2e2e8` | Primary text |
| `on-surface-variant` | `#9ca3af` | Secondary text |
| `muted` (**new**) | `#8b94a3` | Tertiary text (replaces `outline` for text) |
| `outline` | `#6b7280` | **Decorative only** (icons, dividers) — never text |
| `primary` | `#818cf8` | Accent text/icon, focus ring, selected borders |
| `primary-container` | `#4f46e5` | Primary button fill (white text) |
| `secondary` | `#4edea3` | Completed / savings / Export |
| `secondary-container` | `#059669` | Export hover |
| `tertiary` | `#ffb95f` | Processing / warnings |
| `error` | `#f87171` | Failed |
| `error-container` | `#450a0a` | Error tint fill |

Fonts: **Inter** 400/500/600/700 (UI), **JetBrains Mono** 400/500 (filenames, sizes, dimensions, tokens, numbers).
Radii: 4px controls, 8px cards/panels, 12px floating pills. Elevation = tonal layers + 1px borders; glow `0 0 16px -2px rgba(99,102,241,.25)` only on the active/primary element.

### Contrast (measured, WCAG 2.x relative luminance)

| Pair | Ratio | Verdict |
|---|---|---|
| on-surface on surface | 14.4 | pass |
| on-surface-variant on surface / container / high | 7.3 / 6.7 / 6.0 | pass |
| muted `#8b94a3` on surface / container / high | 6.1 / 5.6 / 5.0 | pass |
| primary `#818cf8` on surface / container / high | 6.2 / 5.7 / 5.1 | pass |
| secondary, tertiary, error on surface | 10.9 / 10.9 / 6.7 | pass |
| white on `primary-container` `#4f46e5` | 6.3 | pass |
| **outline `#6b7280` as text** on surface / container / high | 3.8 / 3.5 / 3.2 | **fail → use `muted`** |
| **white on `primary` `#818cf8`** (Stitch primary button) | ≈ 2.9 | **fail → use `primary-container` fill** |

## 2. Changes from the Stitch design (deliberate)

1. **Primary button** = `primary-container` (#4f46e5) fill + white text (Stitch had white on #818cf8). Hover `#4338ca`.
2. **Text never uses `outline`**; tertiary text uses `muted`.
3. **Minimum text size 11px** (Stitch used 9–10px in places). Filenames/sizes/dims in mono at 11–12px.
4. **Sidebar** expands on hover **and** `:focus-within`; every item has an `aria-label` (Stitch: hover only).
5. **Single "Process" action** (inspector footer). Stitch had two (toolbar + inspector).
6. **Export ZIP (emerald)** is only enabled when there is something to export, so green never competes with Process.
7. **Processing is indeterminate per file** (stripe animation + "Processing"), overall progress by file count.
   Pillow encodes are short and give no real per-file percent; the design must not promise one.
8. **Status is never colour-only**: icon + text + colour.
9. **Compare** is an inline panel under the grid (as in Stitch) and shows exact sizes only when they come from a real encode; estimates are labelled "est.".
10. Added missing MVP controls: **background colour for JPEG**, **prefix / padding / start index**, **Width** mode.
11. Added missing states: **Empty, Uploading, Completed, Partial failure, Global failure** banners.
12. Real files first: sample/demo assets only in dev (`?demo`).

## 3. Removed from Stitch (not in MVP / not true for our backend)

PRO v2.4 badge · user avatar "JD" · "Batch #409 …" history · "WASM+AVX-512" and "SIMD Engine / Cache RAM" telemetry ·
Debug Console · Cloud Destinations · "Worker #n" naming and MB/s·ETA ticker (replaced by "Slot #1–3", the real concurrency limit) ·
Table view · Sort by · Invert · Process Now (toolbar) · Processing History and Settings entries (were disabled "Soon" placeholders) · Save Preset (replaced by real browser-local presets: up to 10, saved from the recipe panel, managed in the Presets dialog) · Lanczos3 label · Lock Aspect Ratio (spec: never distort) ·
Stretch / Percentage fit modes · **AVIF** codec and "Mobile Story (AVIF)" preset · "Print Hi-Res" preset ·
Preserve ICC profile · SSIM badge (unmeasured claim) · "Max 50MB" (we enforce our own limit).

## 4. Layout

```
Header (52px): brand · batch name · 3-step indicator ──────────────────────────
Sidebar 56→224px | Main (scroll): toolbar · banner/pipeline · dropzone · grid · compare | Inspector 320px
```
Inspector ("Batch Recipe"): Presets → Geometry → Codec & Quality → Naming → Sanitization → footer actions.
Sidebar rail: **Workspace** and **Presets** (opens the preset library dialog; focus returns to the button when it closes).

## 5. States

| State | Main area | Footer actions |
|---|---|---|
| empty | Large dropzone | Process disabled · Export disabled |
| uploading | Progress per file + overall | Process disabled |
| ready | Grid, selection | **Process Batch (n)** |
| processing | Pipeline panel, indeterminate cards, settings locked | Process shows "Processing x/n" |
| completed | Emerald summary banner (totals, % saved) | **Export All as ZIP (size)** |
| partial failure | Amber banner "x ok · y failed", failed cards with reason + Retry | **Retry y failed** + Export ZIP (successes) |
| failed (global) | Red `role=alert` banner with cause + Try again | Try again |

Card variants: ready · queued · processing · completed (−% badge, out size, Compare, Download, Remove) · failed (reason, Retry, Discard).

## 6. Interaction & accessibility

- Visible focus ring (`primary`, 2px, offset 2px) on every interactive element; never `outline: none` without replacement.
- Drag-and-drop always has a Browse button; keyboard can select, remove, retry, download.
- Errors: per-card message + banner with `role="alert"`; status changes announced in an `aria-live="polite"` region.
- Slider/switch via Radix (keyboard + ARIA built in). Quality slider disabled (with explanation) for PNG.
- Transitions 150–250ms colour/opacity only; `prefers-reduced-motion` disables spin/pulse/stripe animations.
- Icons: lucide SVG, decorative ones `aria-hidden`, icon-only buttons have `aria-label`.

## 7. Pre-delivery checklist

- [ ] All 7 states reachable and distinct (demo bar in dev)
- [ ] Full flow with keyboard only
- [ ] No text below 11px; no `outline` colour used for text
- [ ] No horizontal scroll at 1200px and 1440px; inspector tray works < 1200px
- [ ] Reduced motion honoured
- [ ] 100 thumbnails scroll smoothly (fixed aspect box, `loading="lazy"`, `decoding="async"`)
