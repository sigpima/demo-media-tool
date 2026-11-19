# UI upgrade: before/after slider, EN/VI, fit-mode grid, presets panel

Date: 2026-11-19. Scope: `frontend/` only. No backend change.

## Intent

The user is polishing the Creative Batch Toolkit before showing it to HR and companies.
Four things felt wrong or missing:

1. After processing, comparing the original with the optimized image uses two side-by-side boxes. They want the usual
   single frame with a draggable vertical divider.
2. The UI is English only. It needs English and Vietnamese with a visible switch.
3. "Fitting mode" is a dropdown of four options. They want a 2x2 grid of tiles with text and an illustration, so the
   difference between the modes is visible without reading.
4. The "Workflow presets" area is hard to reach. They chose option **C** from the mockups: tabs inside the recipe panel,
   one row per preset, a large save button.

Success: a person can understand what each fit mode does at a glance, see exactly where the optimized image differs
from the original, switch language in one click, and save/reuse a preset without hunting for controls.

## Goals / non-goals / anti-goals

Goals: the four items above; keyboard and screen-reader access for every new control; existing tests keep passing.

Non-goals: a third language (the structure allows it, we ship two); zoom/pan inside the compare frame; preset
import/export or server-side presets; translating text that comes from the server (see 2); backend changes.

Anti-goals: the compare slider must never imply a pixel-accurate comparison when sizes differ; the fit illustrations
must not suggest behaviour the backend does not have (no stretching, no distortion); no library for 150 strings.

## Constraints

- Stack stays React 18 + TS + Tailwind 3 + Radix; contrast rules in `design-system/creative-batch-toolkit/MASTER.md` apply
  (no `outline` colour for text, min 11px text).
- CSP is strict (`font-src 'self'`, no inline scripts). Illustrations are inline SVG, no external assets.
- The recipe panel is 320px wide (slide-over below 1200px).
- Browser tests run in Chromium with an `en-US` locale, so the default-language rule keeps old English assertions valid.

## Approaches considered

**Compare slider.** (a) Two stacked `<img>` with the top one clipped by `clip-path` and a draggable handle (chosen).
(b) A canvas that composites both images: more code, no benefit. (c) Keep side-by-side and add a synced zoom: does not
answer the request.

**i18n.** (a) A small in-repo dictionary with typed keys, a React context and a `t(key, params)` function (chosen:
about 150 strings, two languages, no routing or lazy loading needed). (b) `react-i18next`/`FormatJS`: heavier, adds
dependencies and CSP/bundle surface for little gain. Pluralisation is handled by explicit `_one`/`_other` keys.

**Presets (user chose C).** A dropdown+menu (A) and a chip bar above the grid (B) were rejected by the user. C keeps the
location and adds structure.

## Design

### 1. Compare slider (`ComparePanel.tsx`)

- One frame replaces the two panes. Original is the base layer on the left, Optimized is clipped on the right of the
  divider (`clip-path: inset(0 0 0 X%)`). Corner tags "Original" / "Optimized" stay visible; each side keeps its meta line
  (size, format, quality, dimensions) under the frame.
- The frame uses the **output's** aspect ratio and both images use `object-cover`. In Fit and Width the aspect is the
  same as the original, so the layers align exactly; in Fill the backend centre-crops, which is exactly what `object-cover`
  does, so the layers still align. In Original mode nothing is resized and the layers are identical in size.
- Divider: pointer drag (Pointer Events with capture, so it also works on touch), click anywhere to jump, and the handle is
  `role="slider"` with `aria-valuenow`, arrow keys (5%), Shift+arrow (20%), Home/End. Starts at 50%. `touch-action: pan-y`
  so vertical scrolling still works on touch.
- Header keeps the saving badge and Download. Demo mode (no output URL) keeps the "demo" note.
- Frame height is capped (`max-h`) so a tall portrait image does not push the page.

### 2. i18n

- `src/i18n/en.ts` is the source of truth and defines the key type; `src/i18n/vi.ts` must satisfy `Record<keyof typeof en, string>`.
  A vitest test also checks every `{param}` placeholder in vi matches en.
- `I18nProvider` + `useI18n()` returns `{ lang, setLang, t }`. `t('key', { n })`; numbers/dates formatted with
  `Intl` using the active language.
- Initial language: saved choice in `localStorage` (`cbt.lang`), else `navigator.language` starting with `vi` -> `vi`,
  else `en`. Switch is a two-segment control **EN | VI** in the top bar (`aria-label` translated, visible at all widths).
  Changing it sets `document.documentElement.lang`. localStorage access is wrapped in try/catch as elsewhere.
- Covered: every component, toasts, the `aria-live` announcements, client-side validation messages (`limits.ts`),
  the demo bar is **not** translated (dev only).
- **Not translated (my call):** text returned by the server (per-asset failure reasons, upload rejections, CSV export
  content) stays English; it is shown as received. Making these codes + client-side messages is a follow-up that touches
  the API contract.
- Not translated (my call): built-in preset names (Social Square, Web Banner...), filename tokens (`{index}`...) and
  format names, which behave like proper names.
- Vietnamese copy is written by me and should be read by the user before release.

### 3. Fitting mode grid (`FitModePicker.tsx`)

- Replaces the `<select>`. A `role="radiogroup"` of four tiles in a 2x2 grid; each tile is a `<label>` around a visually hidden
  radio input (arrow keys, focus ring on the tile, works with the existing `manual()` update).
- Tile = illustration on top, short title, one-line sub-label:

| Mode | Title | Sub-label | Illustration (inline SVG, `currentColor`, `aria-hidden`) |
|---|---|---|---|
| fit | Fit | Whole image inside, no crop | dashed frame, smaller image inside with margins |
| cover | Fill | Fills the frame, centre crop | dashed frame, larger image behind it; the overflow is drawn faint |
| width | Width | Fixed width, height automatic | horizontal arrow across the image; vertical edge marked "auto" |
| original | Original | No resize | image with no frame, a "1:1" mark |

- The existing longer help sentence for the selected mode remains below the grid (`aria-live` not needed).
- Width/height fields below behave as today (hidden for Original, one field for Width).

### 4. Presets panel, option C (`PresetsSection.tsx`, replaces the block in `Inspector.tsx`)

- Section "Presets": tab bar **Built-in (4) | Mine (n/10)**, then one row per preset (name, `W×H · FORMAT · Qn`).
  The selected row is highlighted. Built-in rows are apply-only; "Mine" rows add inline rename and delete.
- **Modified state (new):** manual edits no longer clear the selected preset. The row stays selected and shows a
  "Modified" tag when the current settings differ from that preset (width, height, format, quality, and any of
  resizeMode/background/removeMetadata/pattern/padding the preset carries). The old `presetId: null` on manual edit goes away.
- Buttons under the list: **Save as new preset** (primary, opens the existing inline name form) and **Update "X"**
  (shown only when a *custom* preset is selected and modified; overwrites its recipe with the current one). New store
  function `updatePreset(list, id, recipe)` with tests. Built-ins can never be overwritten.
- The default tab is the one holding the selected preset; if none, "Mine" when it has items, otherwise "Built-in".
- Rename: row turns into an input (Enter saves, Esc cancels), same validation as today. Delete: two-step inline confirm that
  disarms after 3.5 s (same behaviour as the dialog today).
- **The preset dialog (`PresetLibrary.tsx`) is removed (my call):** with rename/delete inline it only duplicates the panel and
  was the second, confusing entry point. The sidebar "Presets" button now opens the recipe tray when it is a slide-over,
  scrolls the section into view and moves focus to the active tab. Focus-return logic added earlier is dropped with the dialog.
- Limits unchanged: 10 custom presets, name 30 chars, no duplicate names, `localStorage` key `cbt.presets.v1`.

## Testing

- vitest: i18n key parity and placeholder parity; `updatePreset`; a pure `isModified(settings, preset)` helper;
  slider value clamping helper.
- Browser e2e (puppeteer, as before): drag and keyboard on the compare slider (clip position changes, `aria-valuenow`),
  the four fit tiles select and update the recipe/preview, language switch changes text, persists after reload and sets `<html lang>`,
  preset save/update/rename/delete/modified flow, sidebar Presets button focus.
- Regression: backend 85 pytest, real-backend e2e 14/14, typecheck, build.
- Manual check of the Vietnamese strings for overflow in the 320px panel and top bar (VI text is usually longer).

## Left to the builder

Exact SVG artwork; exact Vietnamese wording (propose, user reviews); tab keyboard behaviour (use the WAI-ARIA tabs pattern);
tray-opening mechanics for the sidebar button; updating README/MASTER.md; the migration of existing e2e scripts' selectors
(the fit `<select>` and the old preset grid are gone).
