# Nexora - Design System

- Status: `active`
- Last updated: 2026-08-06
- Source: Stage 4 Enterprise UI/UX Design request, logged as `accepted-improvements.md` I-019
- Built on: ADR-18 (Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, React Query, React Hook Form)
- Consumed by: `segments/S1.4-frontend-foundation.md`

This document is a token/rules specification, not application code — it defines
what `web/` should be configured with when S1.4 is built, not a running
implementation. It is built as a **shadcn/ui theme** (CSS variables in shadcn's
own HSL convention) rather than a competing token system, so ADR-18's tooling
choice stays load-bearing instead of being quietly replaced.

## 0. Design principles (reused from `vision.md` §7, not reinvented)

| Vision principle | What it means for design |
|---|---|
| Configuration over customization | Every screen exposes settings through the platform's configuration model, not one-off visual hacks per tenant. |
| Auditability over convenience | Destructive/controlled actions are never one accidental click away; confirmation and audit-trail visibility take priority over speed. |
| Beginner clarity over legacy complexity | Progressive disclosure by default — dense SAP-style all-fields-visible forms are the exception, not the baseline. |
| Real-time truth over after-the-fact reporting | Dashboards and lists show live/near-live data with visible freshness timestamps, never silently stale data. |
| Secure-by-default over optional hardening | Permission-denied states are designed states (clear, informative), not blank pages or raw 403s. |

## 1. Color system

Semantic tokens in shadcn's `--variable: H S% L%` format, so they drop directly
into `tailwind.config` / `globals.css` when S1.4 is built. `--success` and
`--warning` are Nexora extensions beyond shadcn's default set (needed for
finance-positive/warning states throughout an ERP).

### Light theme

| Token | Value (HSL) | Approx hex | Use |
|---|---|---|---|
| `--background` | 0 0% 100% | #FFFFFF | App background |
| `--foreground` | 222 47% 11% | #111827 | Primary text |
| `--card` | 0 0% 100% | #FFFFFF | Card/panel surface |
| `--card-foreground` | 222 47% 11% | #111827 | Text on card |
| `--popover` / `--popover-foreground` | 0 0% 100% / 222 47% 11% | #FFFFFF / #111827 | Dropdowns, tooltips |
| `--primary` | 243 75% 59% | #4F46E5 | Primary actions, links, focus accents |
| `--primary-foreground` | 0 0% 100% | #FFFFFF | Text/icons on primary |
| `--secondary` / `--muted` / `--accent` | 220 14% 96% | #F3F4F6 | Secondary surfaces, subtle backgrounds |
| `--secondary-foreground` / `--accent-foreground` | 222 47% 11% | #111827 | Text on secondary surfaces |
| `--muted-foreground` | 220 9% 46% | #6B7280 | Placeholder/disabled/helper text |
| `--destructive` | 0 72% 51% | #DC2626 | Delete, reject, critical error |
| `--destructive-foreground` | 0 0% 100% | #FFFFFF | Text on destructive |
| `--success` | 152 69% 31% | #0F9D58 | Posted/approved/reconciled states |
| `--success-foreground` | 0 0% 100% | #FFFFFF | Text on success |
| `--warning` | 38 92% 50% | #F59E0B | Pending/exception/waiver states |
| `--warning-foreground` | 222 47% 11% | #111827 | Text on warning |
| `--border` / `--input` | 220 13% 91% | #E5E7EB | Borders, input outlines |
| `--ring` | 243 75% 59% | #4F46E5 | Focus ring (matches primary) |

### Application shell tokens (light theme)

The persistent navigation rail uses a deliberately dark surface in the light
theme. This creates a clear boundary between global navigation and the active
working canvas without changing any module or permission semantics.

| Token | Value (HSL) | Approx hex | Use |
|---|---|---|---|
| `--sidebar` | 222 47% 11% | #0F172A | Persistent navigation surface |
| `--sidebar-foreground` | 210 20% 98% | #F8FAFC | Navigation labels and icons |
| `--sidebar-primary` | 217 91% 60% | #3B82F6 | Active navigation and focus accent |
| `--sidebar-primary-foreground` | 0 0% 100% | #FFFFFF | Text/icons on the active accent |
| `--sidebar-accent` | 222 39% 17% | #1A263A | Hovered/selected navigation surface |
| `--sidebar-accent-foreground` | 210 20% 98% | #F8FAFC | Text/icons on navigation accent |
| `--sidebar-border` | 222 28% 22% | #28354A | Navigation dividers and boundaries |
| `--sidebar-ring` | 217 91% 60% | #3B82F6 | Navigation focus ring |

### Dark theme

| Token | Value (HSL) | Approx hex |
|---|---|---|
| `--background` | 222 47% 6% | #0B0F19 |
| `--foreground` | 210 20% 98% | #F8FAFC |
| `--card` / `--popover` | 222 47% 8% | #0F1524 |
| `--primary` | 243 82% 68% | #7C7CF0 |
| `--primary-foreground` | 222 47% 6% | #0B0F19 |
| `--secondary` / `--muted` / `--accent` | 222 30% 14% | #1B2333 |
| `--muted-foreground` | 220 10% 65% | #9CA3AF |
| `--destructive` | 0 63% 55% | #E14848 |
| `--success` | 152 55% 45% | #35B27A |
| `--warning` | 38 92% 55% | #F7A62D |
| `--border` / `--input` | 222 25% 18% | #232B3E |
| `--ring` | 243 82% 68% | #7C7CF0 |

Both themes are checked to WCAG 2.1 AA contrast (4.5:1 body text, 3:1 large
text/UI components) — see §14.

### Module wayfinding accents

Used only for sidebar module icons, badges, and chart series — never for body
text or primary actions, so a colorblind user relying on shape/label/position
is never dependent on hue alone.

| Module | Accent | Approx hex |
|---|---|---|
| Finance | Primary indigo (reused — finance is "the v1 center of gravity," `segments/S2.2`) | #4F46E5 |
| Procurement | Blue | #2563EB |
| Inventory | Amber | #D97706 |
| Sales / CRM | Rose | #E11D48 |
| HR | Teal | #0D9488 |
| Manufacturing | Orange | #EA580C |
| Projects | Violet | #7C3AED |
| Reporting / Analytics | Cyan | #0891B2 |
| AI Assistant | AI purple (distinct from Projects violet, reserved solely for AI-originated content) | #8B5CF6 |

## 2. Typography

- **UI font:** Inter (variable weight), fallback `system-ui, sans-serif`.
- **Numeric/financial figures:** Inter with `font-variant-numeric: tabular-nums` enabled on every table/ledger/report cell — not a separate font, just the OpenType feature, so digits align in columns without a font-family switch.
- **Technical/identifier text:** JetBrains Mono, reserved for `correlation_id`, audit hash values, API keys, and other values a user might copy-paste — never for body copy.

| Role | Size / line-height | Weight |
|---|---|---|
| Display | 2.25rem / 2.5rem (36/40px) | 700 |
| H1 | 1.875rem / 2.25rem (30/36px) | 700 |
| H2 | 1.5rem / 2rem (24/32px) | 600 |
| H3 | 1.25rem / 1.75rem (20/28px) | 600 |
| H4 | 1.125rem / 1.5rem (18/24px) | 600 |
| Body (default) | 0.875rem / 1.25rem (14/20px) | 400 |
| Body-large | 1rem / 1.5rem (16/24px) | 400 |
| Caption / helper | 0.75rem / 1rem (12/16px) | 400 |
| Label | 0.8125rem / 1rem (13/16px) | 500 |

14px body is the default, not 16px — ERP screens are data-dense (this matches
GitHub's and Linear's density choice for the same reason); `Body-large` is
reserved for marketing/onboarding surfaces, not transactional screens.

## 3. Icons

**Lucide** (`lucide-react`) — the icon set shadcn/ui already ships with by
convention (ADR-18), so no second icon library is introduced. 20px default
size in UI chrome, 16px inline with text, 24px for empty-state illustrations.
One icon per meaning, reused identically across every module (e.g., the same
"approve" checkmark icon everywhere an approval action exists).

## 4. Elevation & shadows

| Level | Use | Shadow (light) |
|---|---|---|
| 0 | Flat surface, border only | none |
| 1 | Resting card | `0 1px 2px rgba(0,0,0,.05)` |
| 2 | Dropdown, popover | `0 4px 6px rgba(0,0,0,.07)` |
| 3 | Dialog | `0 10px 15px rgba(0,0,0,.1)` |
| 4 | Drawer | `0 20px 25px rgba(0,0,0,.12)` |
| 5 | Command palette, toast | `0 25px 50px rgba(0,0,0,.15)` |

Dark theme uses the same levels with lower-opacity shadows plus a subtle
`1px` border (shadows read poorly on dark backgrounds alone).

## 5. Border radius

`--radius: 0.5rem` (8px) base, matching shadcn's default variable so no
override is needed. `sm` = 0.375rem (6px) for badges/chips; `lg` = 0.75rem
(12px) for cards/dialogs; `full` for avatars and pill-shaped status badges.

## 6. Spacing scale

4px base grid — Tailwind's default spacing scale is used as-is (0, 1=4px,
2=8px, 3=12px, 4=16px, 5=20px, 6=24px, 8=32px, 10=40px, 12=48px, 16=64px,
20=80px, 24=96px). No custom spacing scale is introduced.

## 7. Grid & responsive breakpoints

Tailwind's default breakpoints (`sm` 640px, `md` 768px, `lg` 1024px, `xl`
1280px, `2xl` 1536px) are used as-is. One ERP-specific addition: a **dense**
threshold at 1440px+, where data grids widen to show more columns before
truncating — named as a container query, not a new global breakpoint, so it
only affects grid-bearing layouts.

## 8. Animation & motion guidelines

| Token | Duration | Easing | Use |
|---|---|---|---|
| `--motion-fast` | 100ms | ease-out | Hover, press, checkbox/switch toggle |
| `--motion-base` | 175ms | ease-out (enter) / ease-in (exit) | Dropdown, tooltip, popover |
| `--motion-slow` | 250ms | ease-out (enter) / ease-in (exit) | Dialog, drawer, page transition |

`prefers-reduced-motion: reduce` disables all non-essential transitions
(opacity-only fades remain; movement/scale transforms are removed) — this is
a hard rule, not a nice-to-have, consistent with the WCAG 2.1 AA target
already locked in `architecture.md`.

## 9. UX standards

- **Progressive disclosure**: forms default to the common-case fields; advanced/rare fields sit behind an explicit "Advanced" toggle, never pre-expanded.
- **Draft preservation**: any form that can fail validation preserves entered values on failure — this isn't a nice-to-have, it's already a named S1.3 acceptance criterion ("Admin screens or APIs preserve drafts on validation failure").
- **Confirmation for controlled actions**: any action that would emit an `AuditEvent` per `docs/security-authorization-audit.md` requires an explicit confirm step naming what will happen (not a generic "Are you sure?").
- **Errors surface the canonical shape**: every error toast/inline message renders from `{code, message, details, correlation_id}` — the `correlation_id` is always visible (small, copyable) so a support request can be traced to the exact server-side event.
- **Empty states** explain why a list is empty and what action fixes it (not a bare "No results").
- **Loading states** use skeletons matching the real layout, not spinners, for anything that takes >300ms — spinners are reserved for actions under 300ms (button press feedback).
- **AI suggestions are never pre-applied**: any `AiSuggestion` (S4.2) renders as a proposal with visible confidence/source and explicit Approve/Reject controls — this is a UI-level enforcement of the already-locked "human approval for high-impact actions" NFR, not a new rule.

## 10. UI standards

- **Density modes**: `comfortable` (default, 40px row height) and `compact` (32px row height, user-toggleable per data grid) — ERP power users spend hours in tables and need the density choice.
- **Button hierarchy**: exactly one `primary` button per view/section; everything else is `secondary` or `ghost`. Destructive actions use `destructive` variant, never `primary`.
- **Consistent iconography**: one icon = one meaning, project-wide (see §3).

## 11. Responsive design standards

| Breakpoint | Sidebar | Data tables | Top nav |
|---|---|---|---|
| `< md` (mobile) | Collapses to a drawer, triggered by hamburger | Switches to stacked cards (one record per card) or horizontal scroll with a sticky first column, per table | Search collapses into an icon; command palette remains keyboard-accessible |
| `md`–`lg` (tablet) | Collapsible, icon-only by default | Horizontal scroll with sticky first column | Full search bar, condensed tenant/user menu |
| `≥ lg` (desktop) | Persistent, expanded by default | Full grid, `dense` variant available above 1440px | Full nav, command palette trigger visible |

## 12. Accessibility standards (WCAG 2.1 AA — already the locked NFR in `architecture.md`)

- Contrast: 4.5:1 minimum for body text, 3:1 for large text (≥18px) and UI component boundaries, verified for every token pair in §1.
- Keyboard: every interactive element reachable via Tab, visible focus ring (`--ring` token) on every focusable element, no keyboard traps in dialogs/drawers (focus is trapped intentionally inside modal dialogs and returned to the trigger element on close).
- Screen reader: data tables use proper `<th scope>` semantics; audit-trail timelines and AI-suggestion cards use `aria-live="polite"` regions for state changes (approved/rejected), not silent visual-only updates.
- Touch targets: minimum 44×44px, matching the NFR already locked in `architecture.md`.
- Motion: respects `prefers-reduced-motion` (§8).
- Forms: every input has a visible, programmatically-associated label — placeholder text is never the only label.

## 13. Frontend design rules (do / don't)

| Do | Don't |
|---|---|
| Use the same data-grid component across every module | Build a second, module-specific table component |
| Show `correlation_id` on every error surface | Suppress or hide correlation/error detail from the end user |
| Require explicit Approve/Reject on every AI suggestion | Auto-apply or silently pre-fill from an AI suggestion |
| Reuse the module accent color only for wayfinding (icons, badges, chart series) | Use module accent color for body text or as a second primary-action color |
| Preserve form drafts on validation failure | Clear a form's contents when validation fails |
| Use skeleton loaders for >300ms operations | Use indefinite spinners with no skeleton for list/table loads |

## 14. Figma-ready token export

Structured for import into a token tool (e.g. Tokens Studio for Figma) — this
is a data spec, not a `.fig` file, which can't be generated from a text
session. Colors are given as HSL to match the CSS variables in §1 directly.

```json
{
  "color": {
    "background": { "light": "hsl(0 0% 100%)", "dark": "hsl(222 47% 6%)" },
    "foreground": { "light": "hsl(222 47% 11%)", "dark": "hsl(210 20% 98%)" },
    "primary": { "light": "hsl(243 75% 59%)", "dark": "hsl(243 82% 68%)" },
    "destructive": { "light": "hsl(0 72% 51%)", "dark": "hsl(0 63% 55%)" },
    "success": { "light": "hsl(152 69% 31%)", "dark": "hsl(152 55% 45%)" },
    "warning": { "light": "hsl(38 92% 50%)", "dark": "hsl(38 92% 55%)" }
  },
  "radius": { "sm": "0.375rem", "base": "0.5rem", "lg": "0.75rem", "full": "9999px" },
  "spacing": { "base": "4px", "scale": [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96] },
  "typography": {
    "fontFamily": { "ui": "Inter", "mono": "JetBrains Mono" },
    "fontSize": { "display": "2.25rem", "h1": "1.875rem", "h2": "1.5rem", "h3": "1.25rem", "body": "0.875rem", "caption": "0.75rem" }
  },
  "motion": { "fast": "100ms", "base": "175ms", "slow": "250ms" }
}
```
