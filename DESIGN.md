# DocuGrid DESIGN.md

> Clean SaaS visual system for AI agents (Cursor / Claude Code / etc.).
> **Product:** DocuGrid（資料マトリクス・PDF・OCR・監査）。Folder name `TAXX` ≠ product name.
> **Tokens live in code:** `frontend/src/styles/taxx-tokens.css` + `frontend/tailwind.config.ts`.
> This file is the *intent*. Prefer existing components and tokens over inventing a parallel system.

**How to use in Cursor**

```
@DESIGN.md に沿って [画面/コンポーネント] を作って／直して。
既存の frontend パターンは壊さず、色・余白・タイポだけ DESIGN.md に合わせて。
終わったら DESIGN.md との整合を短く確認して。
```

UI 作業以外（API・tenancy・pytest）では読まなくてよい。

---

## 1. Direction (one sentence)

**Quiet professional workbench:** light cool paper, one corporate teal accent, dense-but-readable Japanese UI for tax-office staff — not a marketing landing page, not a neon dashboard.

Inspiration mood (Refero-style keywords): *clean SaaS*, *frosted paper desk*, *precision instrument on white* — adapted to DocuGrid’s **green brand**, never generic purple-on-white.

---

## 2. Brand & surfaces

| Role | Token / Tailwind | Approx HEX | Use |
|------|------------------|------------|-----|
| Page background | `bg-background` / `--taxx-bg` | `#f4f5f6` | App chrome behind panels |
| Surface (cards, panels) | `bg-surface` / `bg-white` | `#ffffff` | Content sheets |
| Ink | `text-foreground` / `text-slate-900` | `#20262e` | Primary text |
| Muted | `text-muted` / `text-slate-500` | `#7a828c` | Hints, meta, captions |
| Border | `border-border` / `border-slate-200` | `#e1e3e7` | Dividers, inputs |
| Primary CTA | `bg-primary` / `brand-500` | `#1fa98c` | Save, confirm, brand marks |
| Primary hover | `bg-primary-hover` / `brand-600` | `#1a8e76` | Hover |
| Focus ring | `focus` / `--taxx-focus-ring` | brand green | `:focus-visible` only |
| AI / data accent | `accent-*` / `violet-*` (remapped) | muted violet | カルテ Data レール、正規化・AI 系のみ |
| Success / warning / error | `success` / `warning` / `error` | semantic | Status only — not decoration |

**Shell exception:** left workspace rail is **dark** (`slate-950` / neutral-950) with teal active indicators. Do not light-wash the rail.

**Tailwind note:** `slate`, `blue`, `indigo`, `teal`, `emerald` are remapped to brand/neutral tokens. Prefer semantic names (`primary`, `background`, `slate-200` for borders) over inventing new hex.

---

## 3. Do / Don’t

### Do

- One clear hierarchy per panel: title → short helper → content → primary action.
- Use **hairline borders** + white surfaces; shadow only for floating menus / modal / rail overlay.
- Keep Japanese labels short; prefer `text-xs` / `text-[11px]` meta, `text-sm` body, `text-base`+ sparingly for page titles.
- Reuse existing patterns: `rounded-xl` / `rounded-2xl` panels, `rounded-lg` controls, Lucide icons at 16–20px.
- Searchable client pickers (`ClientSearchSelect`) for any long client list.
- Preserve dark rail + light content split.

### Don’t

- Purple-to-indigo hero gradients, glow stacks, or “AI SaaS” violet washes on marketing-style chrome.
- Warm cream + terracotta + display serif (broadsheet / lifestyle look).
- Dark mode as the default for content panels (rail stays dark; content stays light).
- Pill clusters, stat strips, emoji decoration, multi-layer drop shadows on every card.
- Competing accent colors in one viewport (teal + violet + amber + rose all screaming).
- Cards-for-decoration: if removing border/background doesn’t hurt understanding, drop the card chrome.
- Override brand green with a new primary blue.

---

## 4. Typography

| Role | Stack | Weight | Notes |
|------|-------|--------|-------|
| UI body | `font-sans` → Noto Sans JP | 400–700 | Default everywhere |
| Product wordmark | `font-wordmark` → Space Grotesk | 700 | Logo / brand lockups only |
| Mono / IDs | `font-brand-mono` → Space Mono | 400–700 | IDs, period keys, code-ish labels |

**Scale (practical)**

| Use | Class |
|-----|--------|
| Page title | `text-lg`–`text-xl` `font-bold` / `font-black` |
| Section title | `text-sm` `font-bold` |
| Body | `text-sm` |
| Dense tables / forms | `text-xs` |
| Eyebrow / meta | `text-[10px]`–`text-[11px]` `font-bold` `text-slate-500` |
| Uppercase tracking labels | `text-[10px] font-black uppercase tracking-widest text-slate-400` (sparingly) |

Avoid Inter / Roboto / system-only stacks for new branded surfaces. Do not introduce a second display serif.

---

## 5. Spacing & density

- **Rhythm:** 4px base → prefer `gap-2` / `gap-3` / `p-4` / `p-5` / `p-6`.
- **Panel padding:** `p-4` mobile, `p-5`–`p-6` desktop sections.
- **Form stacks:** `space-y-2` or `space-y-3`; label above control with `mb-0.5` / `mt-0.5`.
- **Dense work UIs** (matrix, relations, metrics): okay to go compact; never overlap audit buttons onto neighboring columns — prefer full-width rows then grids below.
- **Max content width:** marketing/standalone pages ~ `max-w-3xl`–`max-w-5xl`; workspace fills remaining viewport beside the rail.

---

## 6. Components (patterns, not a component library)

### Buttons

| Kind | Pattern |
|------|---------|
| Primary | `rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover` (or `.taxx-btn-primary`) |
| Secondary | White + `border-slate-200` + `text-slate-800` |
| Danger | Rose / error text or soft rose fill — never brand green for delete |
| Icon toggle | Compact `rounded-md` / `rounded-lg`; active = filled brand or slate-800 |

One primary action per toolbar cluster.

### Inputs / selects

- `rounded-lg` (or `rounded border` in dense editors) + `border-slate-200` + white fill.
- Disabled: `disabled:bg-white disabled:text-slate-700` (readable, not washed out).
- Client lists: search field **above** select (`ClientSearchSelect`).

### Panels / cards

- Default content block: `rounded-2xl border border-slate-200 bg-white` or `bg-slate-50/80` for nested SSOT editors.
- Prefer **one border** over nested card-in-card.
- Modals: near-fullscreen for authoring; keep chrome minimal.

### Feedback

| State | Pattern |
|-------|---------|
| Error | `rounded-lg bg-rose-50 text-rose-700` |
| Success notice | `border-emerald-200 bg-emerald-50 text-emerald-800` (semantic, not brand CTA) |
| Info / audit legend | Soft teal/emerald tint, short copy |

### Icons

- Lucide only unless the area already uses another set.
- Stroke ~1.75–2.25; active nav can thicken slightly.
- Don’t put icons on every label.

---

## 7. Layout shells

1. **Workspace:** dark slim rail (Doc / PDF / DM / Tax + Data) → light main canvas → optional right inspector.
2. **Settings / tasks / checklist:** light full page, header row with title + filters + auth.
3. **Guest PDF:** calm, centered open flow; client binding optional and searchable.
4. **カルテ / relations / charts:** left or right supporting list; diagram/canvas gets the flex space.

Responsive: stack inspectors under the canvas below `md`; keep tap targets ≥ ~36px on mobile where editable.

---

## 8. Motion

- Prefer `transition-colors` / short opacity transforms (`duration-200`–`300`).
- Entrance: existing `.fade-in-up` is fine; don’t add bounce/glitter.
- Drum / rail animations already exist — don’t invent parallel physics.
- Motion explains hierarchy (focus, open/close), not decoration.

---

## 9. Copy & labeling (UI Japanese)

- Product name in UI: **DocuGrid** (not “TAXX” for this app).
- Prefer verbs staff know: 変更 → 決定、追加、永続へ保存、監査.
- Helper text: one short line under the title; no essay in the first viewport.
- Empty states: say what to do next (“右側から追加できます”).

---

## 10. Compliance checklist (after UI work)

- [ ] Uses brand green / existing tokens — no new primary palette
- [ ] Light content + dark rail respected (if in workspace)
- [ ] No decorative purple gradient / cream-serif / glow stack
- [ ] Hierarchy readable in Japanese at `text-sm` / `text-xs`
- [ ] Borders over heavy shadows; cards only when they group interaction
- [ ] Forms don’t overflow neighboring columns
- [ ] Focus visible via brand ring
- [ ] Matches nearby components more than this file when they conflict — then update this file if the product direction changed

---

## 11. File map

| Asset | Path |
|-------|------|
| Color tokens | `frontend/src/styles/taxx-tokens.css` |
| Tailwind bridge | `frontend/tailwind.config.ts` |
| Global base / utilities | `frontend/src/app/globals.css` |
| Fonts | `frontend/src/app/layout.tsx` |
| Product naming | `docs/product-naming.md` |
| Agent map | `AGENTS.md` |

---

## 12. Change log

| Date | Note |
|------|------|
| 2026-09-03 | Initial clean-SaaS DESIGN.md for DocuGrid agents (aligned to taxx-tokens) |
