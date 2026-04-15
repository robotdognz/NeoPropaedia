# UI Grammar

This repo should use one calm, reference-led visual language. Prefer extending the shared primitives over inventing new local surface styles.

## Workspace Roles

- `Everything`, `Guided`, and `Outline` are structural workspaces: calm, restrained, and map-like.
- `Library` and `My Shelf` can carry more personality, but should still inherit the same spacing, radius, and control grammar.

## Typography

- Workspace page titles: serif, bold, `text-2xl` on mobile and `sm:text-3xl`.
- Workspace intro copy: serif body text, `text-sm` to `sm:text-base`, slate-muted.
- Control section labels such as `Reading Type`, `View`, `Search`, and `Sort`: uppercase sans labels using `CONTROL_SECTION_LABEL_CLASS`.
- Small in-card eyebrows such as `Active field`: uppercase sans using `CONTROL_LABEL_CLASS`.
- Selector, input, and list-card titles: serif.

## Surfaces

- Control groups use `CONTROL_SURFACE_CLASS` with `CONTROL_PANEL_PADDING_CLASS`.
- Display cards should stay white unless they are explicitly acting like controls.
- Avoid nesting one full control surface inside another unless it is genuinely a separate interaction group.

## Controls

- Use `SelectorCardRail` for segmented choices wherever possible.
- Text inputs and selects should use the shared field shell and text classes from `controlTheme.ts`.
- Control groups should generally use:
  - `gap-2.5` between major blocks
  - `gap-1.5` inside compact rails and stacked field groups

## Radius And Spacing

- Primary surfaces: `rounded-2xl`
- Interactive cards and fields inside a surface: `rounded-xl`
- Keep section rhythms on content pages to a single stack where possible instead of mixing ad hoc `mt-*` values.

## Bottom Navigation

- All tab icons should share one visual box and one label spacing stack.
- Active tabs should be differentiated by darker icon/label treatment first; any shadow or lift effect is secondary.
- Avoid adding extra active-state capsules or panels around the selected tab unless the whole nav is redesigned around them.

## Process

When adding or changing UI:

1. Start from an existing shared primitive.
2. Compare against the nearest matching workspace or control, not against the feature in isolation.
3. Do one screenshot pass for spacing, clipping, hierarchy, active state, and wasted space before calling it done.
