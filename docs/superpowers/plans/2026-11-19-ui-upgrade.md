# UI upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the before/after compare slider, EN/VI i18n with a switch, the 2x2 fit-mode grid, and the tabbed presets panel (option C).

**Architecture:** Frontend only. i18n is a small in-repo dictionary (`src/i18n`) with typed keys, a pure `translate()` and a React context; every user-visible string goes through `t()`. Pure logic (language detection, slider maths, preset helpers) lives in `src/lib` or `src/i18n` and is unit-tested with vitest (node environment, no DOM). Behaviour of components is verified with the Puppeteer scripts in the scratchpad.

**Tech Stack:** React 18, TypeScript 5.6, Tailwind 3.4, Radix (Slider/Switch), vitest 2, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-19-ui-upgrade-design.md`

## Global Constraints

- No new runtime dependency for i18n. `@radix-ui/react-dialog` is removed in Task 5 once `PresetLibrary` is gone.
- Language storage key `cbt.lang` (values `en` | `vi`); presets key stays `cbt.presets.v1`; max 10 custom presets, name max 30 chars, delete confirm disarms after 3.5 s.
- Compare slider starts at 50%; arrow keys 5%, Shift+arrow 20%, Home/End = 0/100; frame width capped by `70vh`.
- Text min 11px; never use the `outline` colour for text (MASTER.md). No inline scripts or external assets (strict CSP); illustrations are inline SVG using `currentColor`, `aria-hidden`.
- Not translated: server-returned text, built-in preset names, naming tokens (`{index}`...), format names, the dev-only `DemoBar`.
- All localStorage access wrapped in try/catch. No commits are made by this plan (the user commits when they choose); verify with `git status` only.
- Commands run from `frontend/` unless stated: tests `npx vitest run`, types `npm run typecheck`, build `npm run build`.
- E2E harness: scripts live in `/tmp/claude-1000/-home-nuc-Documents-project-media-tool/3fa80437-733d-4bcf-9bc5-67ff0d0f5b56/scratchpad/e2e/` (call it `$E2E`, run `node <file>.mjs` there). They expect `vite preview` on port 4173: `npm run build && (npx vite preview --port 4173 --strictPort >/dev/null 2>&1 & echo $! > $E2E/../work/preview.pid)`; stop it with `kill $(cat $E2E/../work/preview.pid)`. Chromium is `en-US`, so English assertions keep working until a script switches the language.

## Review Focus

1. A saved language value that is not `en`/`vi` (hand-edited storage) must fall back to browser detection (Task 1 test).
2. A compare output with an extreme aspect (4:1 panorama, 1:4 tall) or zero/missing dimensions (demo/Original mode) must keep the frame within `70vh` and 100% width without NaN styles (Task 2 test).
3. The selected custom preset deleted (here or in another tab) or edited in storage: selection must not point at a missing preset and "Modified" must not show for it (Task 4 test, Task 5 e2e).
4. Vietnamese strings are longer: no horizontal overflow in the 320px recipe panel or the top bar at 1200px and 1440px (Task 8 e2e).
5. Switching language while toasts or a global error are on screen: live UI re-renders in the new language, messages already created keep their original language (accepted; Task 6 documents it in a code comment).

---

### Task 1: i18n core, language switch, top bar

**Files:**
- Create: `src/i18n/en.ts`, `src/i18n/vi.ts`, `src/i18n/index.tsx`, `src/i18n/i18n.test.ts`
- Modify: `src/main.tsx` (wrap `<App/>` in `I18nProvider`), `src/components/TopBar.tsx`

**Interfaces:**
- Produces (`src/i18n/index.tsx`):
  - `type Lang = 'en' | 'vi'`; `type Key = keyof typeof en`; `type Params = Record<string, string | number>`
  - `type PluralBase = Key extends infer K ? (K extends `${infer B}_one` ? B : never) : never`
  - `type TFn = (key: Key | PluralBase, params?: Params) => string`
  - `detectLang(saved: string | null, navigatorLang: string | undefined): Lang`
  - `format(template: string, params?: Params): string` (single pass; unknown `{x}` left as is)
  - `translate(lang: Lang, key: Key | PluralBase, params?: Params): string` (if `params.count` is a number it looks up `${key}_${new Intl.PluralRules(lang).select(count)}` first, then `key`)
  - `I18nProvider`, `useI18n(): { lang: Lang; setLang(l: Lang): void; t: TFn }` (`t` is memoised per `lang`)
- `en.ts` exports `en` (source of truth); `vi.ts` exports `vi: Record<Key, string>`. Plural keys need both `_one` and `_other` in both files. Key naming: `area.thing` (`topbar.*`, `guest.*`, `lang.*` now; later tasks add `compare.*`, `fit.*`, `presets.*`, `error.*`, ...).

- [ ] **Step 1: Write failing tests** in `src/i18n/i18n.test.ts`:
  - `detectLang(null,'vi-VN')==='vi'`, `(null,'en-US')==='en'`, `(null,undefined)==='en'`, `('en','vi-VN')==='en'`, `('vi','en-US')==='vi'`, `('xx','vi-VN')==='vi'` (Review Focus 1).
  - `format('Hi {name}, {n}',{name:'A',n:3})==='Hi A, 3'`; `format('{x}')==='{x}'`; `format('{a} {b}',{a:'{b}',b:'z'})==='{b} z'`.
  - `translate('en','guest.days',{count:1})==='expires in 1 day'`, `{count:2}` → `'expires in 2 days'`; `translate('vi','guest.days',{count:1})` equals the vi `_other` text with `1` substituted.
  - Parity: `Object.keys(vi)` equals `Object.keys(en)`; every value non-empty; for every key the set of `{placeholder}` names is identical in en and vi.
- [ ] **Step 2: Run** `npx vitest run src/i18n` → FAIL (module missing).
- [ ] **Step 3: Implement** the interfaces above. `I18nProvider` reads `cbt.lang` via `detectLang`, writes on `setLang`, sets `document.documentElement.lang` in an effect. Seed `en`/`vi` with the keys the top bar needs: step names, "Batch", "Recipe", aria labels (`topbar.progress`, step done/current), guest chip (`guest.label`, `guest.imagesLeft` with `{n}`, `guest.days` plural with `{count}`, `guest.title`), `lang.switch` ("Language"). Vietnamese copy written by you, natural and short.
- [ ] **Step 4: Run** `npx vitest run src/i18n` → PASS.
- [ ] **Step 5: Convert `TopBar.tsx`** to `t()`; add `LangSwitch` (reuse `ui/Segmented`, options `EN`/`VI`, `label={t('lang.switch')}`) always visible at the right, replacing the fixed 148px spacer while keeping the stepper centred on `desk`. Format the guest-chip day count with `t('guest.days',{count})`.
- [ ] **Step 6: Verify** `npm run typecheck && npx vitest run`; run e2e `run.mjs` (English still passes) and a throwaway check that clicking `VI` changes the step labels, `document.documentElement.lang==='vi'`, and persists after reload.

### Task 2: Before/after compare slider

**Files:**
- Create: `src/lib/compare.ts`, `src/lib/compare.test.ts`
- Modify: `src/components/ComparePanel.tsx`, `src/i18n/en.ts`, `src/i18n/vi.ts` (`compare.*` keys)

**Interfaces:**
- Produces (`src/lib/compare.ts`):
  - `clampPct(n: number): number` (0..100, `NaN` → 50)
  - `pctFromPointer(clientX: number, rect: { left: number; width: number }): number` (width 0 → 50)
  - `nextPct(current: number, key: string, shift: boolean): number | null` (ArrowRight/ArrowUp +5, ArrowLeft/ArrowDown −5, Shift = 20, Home 0, End 100, other keys `null`, result clamped)
  - `frameStyle(w: number, h: number): { aspectRatio: string; width: string }` (non-positive/NaN dimensions fall back to 16:9; `aspectRatio` is `` `${w} / ${h}` ``; `width` is `` `min(100%, calc(70vh * ${(w / h).toFixed(4)}))` ``)

- [ ] **Step 1: Write failing tests**: `clampPct(-5)===0`, `(130)===100`, `(NaN)===50`; `pctFromPointer(150,{left:100,width:200})===25`, `(50,{left:100,width:200})===0`, `(1,{left:0,width:0})===50`; `nextPct(50,'ArrowRight',false)===55`, `(50,'ArrowLeft',true)===30`, `(98,'ArrowRight',false)===100`, `(50,'Home',false)===0`, `(50,'End',false)===100`, `(50,'a',false)===null`; `frameStyle(1600,900).width==='min(100%, calc(70vh * 1.7778))'`, `frameStyle(4000,1000).width` ends `* 4.0000))`, `frameStyle(0,0).aspectRatio==='16 / 9'`, `frameStyle(1000,4000).aspectRatio==='1000 / 4000'` (Review Focus 2).
- [ ] **Step 2: Run** `npx vitest run src/lib/compare.test.ts` → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5: Rewrite `ComparePanel.tsx`**: header (title, inspecting name, saving badge, Download) unchanged. Body is one frame (`frameStyle(outWidth ?? width, outHeight ?? height)`, centred, `touch-action: pan-y`, `select-none`): Original `<img>` as base layer, Optimized `<img>` on top with `style={{ clipPath: `inset(0 0 0 ${pct}%)` }}`, both `object-cover`, plus corner tags and the vertical divider with a round handle. Pointer events with `setPointerCapture` (drag + click-to-jump via `pctFromPointer`). Handle: `role="slider"`, `tabIndex=0`, `aria-valuemin=0`, `aria-valuemax=100`, `aria-valuenow={pct}`, translated `aria-label`/`aria-valuetext`, `onKeyDown` via `nextPct` (`preventDefault` only when non-null), visible focus ring. Under the frame: two meta lines (Original: size · format · dims; Optimized: size · format · Q · dims) and a note `compare.note` ("Both images are scaled to the same frame."). Keep the demo note when `outputUrl` is missing. `pct` resets to 50 when the inspected asset id changes.
- [ ] **Step 6: Verify** typecheck + vitest; new e2e `$E2E/compare.mjs` (real backend or `?demo&state=completed`): frame exists, `aria-valuenow` is 50, ArrowRight → 55, Shift+ArrowLeft → 35, End → 100 and the clip inset equals `100%`, mouse drag from the frame centre to 25% width sets `aria-valuenow` within ±2, switching the inspected asset resets to 50.

### Task 3: Fitting mode grid

**Files:**
- Create: `src/components/FitModePicker.tsx`
- Modify: `src/components/Inspector.tsx` (replace `FIT_OPTIONS` + `<select id="fit-mode">`), `src/i18n/en.ts`, `src/i18n/vi.ts` (`fit.<mode>.title|sub|help`, `fit.label`)

**Interfaces:**
- Produces: `FitModePicker({ value, onChange, disabled? }: { value: ResizeMode; onChange: (v: ResizeMode) => void; disabled?: boolean })` — order `fit, cover, width, original`.

- [ ] **Step 1: Implement.** `role="radiogroup"` with translated label; 2x2 `grid grid-cols-2 gap-1.5` of `<label>` tiles each wrapping `<input type="radio" name="fit-mode" className="peer sr-only">` (native arrow-key handling), so selection styling uses `peer-checked:` and the focus ring `peer-focus-visible:`. Tile = inline SVG illustration (~56×36, `currentColor`, `aria-hidden`: fit = dashed frame with smaller solid rect inside; cover = dashed frame, larger faint rect behind with solid overlap; width = rect with horizontal double arrow and "auto" mark on the vertical edge; original = solid rect, no frame, "1:1" mark), title (Fit / Fill / Width / Original) and one-line sub-label per spec table. Selected help sentence stays below the grid (`fit.<mode>.help`). Selected tile uses the `primary` accent + `shadow-glow-sm` like current preset tiles; text colours per MASTER.md.
- [ ] **Step 2: Wire into `Inspector`**: `onChange={(resizeMode) => manual({ resizeMode })}`; width/height fields below unchanged (hidden for Original, one field for Width).
- [ ] **Step 3: Verify** typecheck; e2e `$E2E/fit.mjs`: four radios exist in a 2×2 layout (tile `getBoundingClientRect` rows/cols), clicking each updates the label (`Max width`/`Width`) and hides the fields for Original, ArrowRight on a focused tile moves the selection, the "Preview" box dims change for Fill vs Fit with a 1:1 target.

### Task 4: Preset store and hook (pure logic)

**Files:**
- Modify: `src/lib/presetStore.ts`, `src/lib/presetStore.test.ts`, `src/state/usePresets.ts`

**Interfaces:**
- Produces (`presetStore.ts`):
  - `type PresetError = 'name-empty' | 'name-long' | 'name-taken' | 'limit'`; `validateName(...)` now returns `PresetError | null`; `Result`'s `error` is `PresetError | null` (UI translates with `t('presets.error.' + code, { max })`). English strings leave this module.
  - `updatePreset(list: CustomPreset[], id: string, recipe: PresetRecipe): CustomPreset[]` (keeps `id`, `name`, `createdAt`; unknown id → same list)
  - `isModified(s: Settings, p: Preset): boolean` — compares `width, height, format, quality` always; `resizeMode, background, removeMetadata, pattern, padding` only when `p` defines them
  - `presetSummary(p: Pick<Preset,'width'|'height'|'format'|'quality'|'resizeMode'>, originalLabel: string): string` → `"1600×900 · WebP · Q80"`; PNG omits `· Q…`; `resizeMode==='original'` shows `originalLabel` instead of the size; `'width'` shows `` `${width}px` ``
  - `describe` and `MODE_LABEL` are removed
- Produces (`usePresets`): `update(id: string, recipe: PresetRecipe): void`

- [ ] **Step 1: Update/add failing tests**: adapt existing assertions that compared English messages to the codes; add `updatePreset` (recipe replaced, name/id/createdAt unchanged, unknown id returns same array reference content), `isModified` table (built-in preset with only size/format/quality: changing `resizeMode` → false, changing `quality` → true; custom preset: changing `pattern` → true, equal recipe → false; Review Focus 3), `presetSummary` cases (webp, png, original, width), a `parseStored` case where a stored preset's recipe is tampered (width `0`) is dropped, and `isModified` never throws for a preset missing optional fields.
- [ ] **Step 2: Run** `npx vitest run src/lib/presetStore.test.ts` → FAIL. **Step 3:** implement and add `update` to the hook (`commit(updatePreset(list, id, recipe))`). **Step 4:** run → PASS (all prior 22 tests still covered).

### Task 5: Presets section (option C) and sidebar entry

**Files:**
- Create: `src/components/PresetsSection.tsx`
- Modify: `src/components/Inspector.tsx` (remove the presets block and `SavePreset`; `manual = (p) => set(p)` so edits no longer clear `presetId`), `src/components/Sidebar.tsx`, `src/App.tsx`, `src/i18n/en.ts`, `src/i18n/vi.ts` (`presets.*`), `package.json`/`package-lock.json`
- Delete: `src/components/PresetLibrary.tsx`

**Interfaces:**
- Consumes: Task 4 (`isModified`, `presetSummary`, `PresetError`, `presets.update`), Task 1 (`useI18n`).
- Produces: `PresetsSection({ presets, settings, onApply, onDeselect }: { presets: Presets; settings: Settings; onApply: (p: Preset) => void; onDeselect: () => void })` rendered with `id="presets-section"`; Sidebar prop `onOpenPresets` unchanged.

- [ ] **Step 1: Read `PresetLibrary.tsx` first** (rename input, 3.5 s two-step delete, error handling) and port that behaviour; then delete it.
- [ ] **Step 2: Implement `PresetsSection`**: WAI-ARIA tabs (`role=tablist` with roving tabindex, Left/Right/Home/End, `role=tabpanel`), tabs "Built-in · 4" and "Mine · n/10". Default tab = the one holding `settings.presetId`, else Mine when non-empty, else Built-in. Rows are `<li>` with an apply button (`aria-pressed`, name + `presetSummary`) and, in Mine, rename (✎) and delete (🗑) buttons; the selected row shows a "Modified" pill when `isModified` is true. Rename: row becomes an input (Enter saves, Esc cancels, `maxLength=NAME_MAX`, `aria-invalid`, error `role=alert`). Delete: first click arms ("Delete?"), second deletes, disarms after 3.5 s; deleting the selected preset calls `onDeselect`. Below the list: primary **Save as new preset** (inline name form as before, disabled with a message at 10) and **Update "name"** (only when the selected preset is custom and modified; `presets.update(id, recipeFrom(settings))`). Empty Mine: short hint text. Built-in names are shown as-is.
- [ ] **Step 3: Wire** in `Inspector` (`onDeselect={() => set({ presetId: null })}`; after save-new select the new id as today). In `App.tsx` remove `libraryOpen`/`libraryOpener`/`PresetLibrary`; `openPresets` = `setRecipeOpen(true)` then in `requestAnimationFrame` scroll `#presets-section` into view and focus its selected tab. Sidebar button drops `aria-haspopup="dialog"`.
- [ ] **Step 4: Remove the unused dependency**: `grep -rn "react-dialog" src` must be empty, then `npm uninstall @radix-ui/react-dialog`.
- [ ] **Step 5: Verify** typecheck + vitest + build; new `$E2E/presets2.mjs` covering: save → row selected, edit quality → "Modified" pill and **Update** appears, Update → pill gone and stored recipe changed, built-in never shows Update, rename/duplicate-name error, two-step delete (and disarm after ~4 s), deleting the selected preset clears the selection, tampering `localStorage` in another page and firing `storage` leaves no selected missing preset (Review Focus 3), sidebar Presets button focuses the active tab, tab arrow keys, 10-preset limit message. Update the older `presets.mjs` selectors or retire it.

### Task 6: Translate state, services and errors

**Files:**
- Create: `src/i18n/errors.ts`, `src/i18n/errors.test.ts`
- Modify: `src/services/api.ts`, `src/services/mockService.ts`, `src/state/useBatch.ts`, `src/App.tsx`, `src/i18n/en.ts`, `src/i18n/vi.ts` (`error.*`, `batch.*`, `upload.*`, `announce.*`)

**Interfaces:**
- Produces: `ApiError(status: number, message: string, code?: 'network' | 'expired' | 'invalid' | 'failed')` — `code` is set only for client-generated messages, never when the text came from the server body; `describeError(e: unknown, t: TFn): string` — `ApiError` with `code` → `t('error.' + code, { status })`; any other `Error` → its `message` (server text, shown as is); anything else → `t('error.unknown')`.
- `useBatch(limits: Limits, t: TFn, onUploaded?: () => void)` (keeps `t` in a ref); `prepareFiles(files, existingCount, limits, t)` returns translated rejection reasons.

- [ ] **Step 1: Write failing tests** in `errors.test.ts` using `translate`-backed `t` for en and vi: `describeError(new ApiError(0,'x','network'), tEn)` equals the en `error.network` text; with `'expired'` the vi text differs from en; `new ApiError(500,'Server said no')` → `'Server said no'`; `new Error('boom')` → `'boom'`; `42` → `error.unknown` text. **Step 2:** run → FAIL. **Step 3:** implement; set `code` in `api.ts` at the five client-generated sites (cannot reach server, 401 without server detail, invalid request, request failed, upload failed). **Step 4:** run → PASS.
- [ ] **Step 5: Convert** every string in `useBatch.ts` (toasts, `announcement`, `globalError`, skipped-file messages, demo download notes) and `mockService.prepareFiles` to `t(...)`, using `describeError` wherever `(e as Error).message` is shown. Pass `t` from `App.tsx`. Add a code comment at `notify`/`globalError` that messages keep the language they were created in (Review Focus 5). Plural announcements use `t('announce.uploaded',{count})`.
- [ ] **Step 6: Verify** typecheck + vitest; `$E2E/real.mjs` still 14/14.

### Task 7: Translate the remaining components

**Files:**
- Modify: `src/components/{Sidebar,Toolbar,UploadZone,StatusPanel,AssetCard,AssetGrid,Toaster,Inspector}.tsx`, `src/components/ui/*.tsx` (aria/visible default strings only), `src/App.tsx` (drag overlay, banners), `src/i18n/en.ts`, `src/i18n/vi.ts`

**Interfaces:** Consumes `useI18n().t` and the existing key naming; no new exports.

- [ ] **Step 1: Convert** each component's visible text, `aria-label`s, `title`s, `placeholder`s and `sr-only` text (Inspector remaining sections: Geometry, Format & quality, Naming, Sanitization, Preview box, Footer buttons). Use `Intl.NumberFormat`/`toLocaleString(lang)` only where numbers are already localised; byte units (`KB`, `MB`) stay.
- [ ] **Step 2: Leftover scan**: `grep -rnE ">[[:space:]]*[A-Z][a-z]+( [a-z]+)*[[:space:]]*<|aria-label=\"[A-Z]|title=\"[A-Z]" src/components src/App.tsx` — each remaining hit must be a deliberately untranslated item from Global Constraints.
- [ ] **Step 3: Verify** typecheck + vitest (parity test now covers all keys) + build; new `$E2E/i18n.mjs`: with the language set to `vi` before load, walk `?demo&state=` empty, uploading, ready, processing, completed, partial, failed and assert none of these English stems appear in `document.body.innerText`: `Process batch`, `Export all`, `Drag`, `Retry`, `Batch recipe`, `Fitting mode`, `Format`, `Strip GPS`, `Try again`, `Before & after`; then switch back to `EN` and assert English returns without reload.

### Task 8: Vietnamese review, overflow, docs, full regression

**Files:**
- Modify: `README.md`, `design-system/creative-batch-toolkit/MASTER.md`, `src/i18n/vi.ts` (copy fixes), scratchpad e2e scripts that referenced removed UI (`run.mjs`, `real.mjs`, `focus.mjs`, `presets.mjs`)

- [ ] **Step 1: Overflow check** `$E2E/overflow.mjs` at 1200px and 1440px in `vi` and `en` across all demo states: `#recipe-panel` and `header` have `scrollWidth <= clientWidth`, no horizontal page scroll, fit tiles and preset rows do not clip (Review Focus 4). Fix by shortening `vi` strings or allowing wrap; never by shrinking below 11px.
- [ ] **Step 2: Docs**: README feature table (language switch, compare slider, fit grid, tabbed presets; "Not included": server messages stay English), MASTER.md (§2 changes: compare slider, fit grid, presets tabs, modified state; §4 layout; §6 radiogroup/tabs/slider a11y).
- [ ] **Step 3: Full regression**: `npm run typecheck && npx vitest run && npm run build`; backend `cd ../backend && .venv/bin/python -m pytest -q` (85 pass); e2e `real.mjs` 14/14, `run.mjs`, the new compare/fit/presets2/i18n/overflow scripts, and `invite.mjs` if the container image is rebuilt. Stop the preview server and any temp processes.
- [ ] **Step 4: Report to the user** in Vietnamese: what changed, what was verified, the Vietnamese copy to proofread, the known gaps (server text English, shown messages keep their language, Chromium only), and that nothing is committed.
