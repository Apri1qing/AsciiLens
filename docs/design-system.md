# AsciiLens Design System

## Context and Goals

AsciiLens is an image-to-ASCII art editor for visual experimentation. The interface should follow the Poch Studio visual direction: black stage, high-contrast white typography, playful pink/cream object energy, rounded pill controls, and direct structure.

This guide follows the authoring structure from `design-system-poch-studio`, but the target brand is AsciiLens. Poch Studio names must not appear in the AsciiLens product UI; its visual style is used only as a design reference.

## Design Tokens and Foundations

### Brand Naming

- Product name must be `AsciiLens`.
- App/editor headers must not use `ASCII Studio`, `Base44`, `Poch Studio`, or other generator/template names.
- When a shorter label is needed, use `AsciiLens`, `Studio`, or `Editor` depending on context.

### Color System

Use semantic CSS variables and Tailwind tokens instead of raw hex values in components.

| Role | Token | Use |
| --- | --- | --- |
| App background | `--background` | Main canvas, page shell, full-screen surfaces |
| Panel surface | `--card` | Editor panels, menus, tool surfaces |
| Raised surface | `--popover` | Floating controls, context actions, overlays |
| Primary | `--primary` | Active selection, primary actions, key focus moments |
| Accent | `--accent` | Secondary glow, hover detail, non-primary highlights |
| Destructive | `--destructive` | Delete action and irreversible controls |
| Border | `--border` | Panel edges, dividers, field outlines |
| Muted | `--muted` | Subtle control backgrounds and inactive regions |
| Foreground | `--foreground` | Primary readable text |
| Muted foreground | `--muted-foreground` | Labels, helper metadata, low-priority UI text |

The current palette is black, white, Poch pink, cream, electric blue, and object green. It should read as playful studio/editorial, not black-gold, beige luxury, or generic cyberpunk green.

### Typography

- UI text must use the existing sans-serif stack.
- Labels should be compact and scannable.
- Hero-scale type must not be used inside editor panels, cards, toolbars, or compact controls.
- Letter spacing should stay at `0` unless a component has an existing established token.

### Radius, Borders, and Effects

- Repeated cards and panels should stay at `8px` radius or less unless the component is a round icon button.
- Icon-only action buttons may use `999px` radius.
- Light effects should be sparse: soft pink object glow, canvas focus, and pointer feedback.
- Exaggerated gradients, black-gold luxury styling, and generic cyberpunk grids are prohibited.

### Layout

- The editor layout should prioritize the preview/canvas and keep controls dense but calm.
- Controls must not resize the layout when values, hover states, labels, or dynamic content change.
- Page sections must not be nested cards. Use one surface for a tool region and individual cards only for repeated items or isolated controls.

## Component-Level Rules

### App Shell

Anatomy:
- Top identity area
- Main preview/canvas area
- Editor control panel

Rules:
- The first viewport must clearly identify AsciiLens.
- The app should feel like a usable editor immediately, not a marketing landing page.
- Base44 or import-source references must not be visible in production UI.

States:
- Loading must preserve panel and canvas dimensions.
- Empty state must show upload/selection affordances without visual clutter.
- Error state must use destructive color sparingly and include a direct recovery action.

### Editor Panel

Anatomy:
- `Render Mode`
- Conditional `Selection Tool`
- Selection-specific controls: `Color`, `Character`, `Columns`, `Light & Tone`
- Global export or utility controls

Rules:
- `Render Mode` must be the first editor section.
- `Selection Tool` must appear directly below `Render Mode` when `Subject Overlay` is selected.
- There must not be a visible region list for selections.
- Selection-specific controls must edit the active selection when a selection is active.
- Controls should use segmented controls, swatches, sliders, steppers, inputs, toggles, or icon buttons according to interaction type.

Responsive behavior:
- The panel must remain scrollable on short viewports.
- Labels and values must not overflow control containers.
- Button text should wrap or compact before it clips.

### Preview and Selection Canvas

Anatomy:
- Image/ASCII preview
- Selection drawing layer
- Active-selection handles or affordances
- Active-selection delete action

Rules:
- Users must be able to create multiple custom selections.
- Users must be able to select, move, and delete a specific selection.
- Selections must not display numeric badges or region IDs in the preview.
- The delete action must appear only for the active selection.
- The delete action must be icon-first, compact, visually refined, and positioned so it does not block selection editing.

Pointer behavior:
- Drag on empty canvas should create a selection.
- Drag on an existing selection should move that selection.
- Tap/click on a selection should make it active.
- Delete icon click/tap should remove only the active selection.

Keyboard behavior:
- The active selection should be removable with a keyboard path when focus is inside the editor.
- Focus-visible styling must make the current action clear.

### Color Picker

Rules:
- Swatches must reflect the current AsciiLens palette.
- Every swatch must have a readable label.
- Color names should be expressive but not obscure: `Pearl`, `Acid`, `Verdant`, `Cyan`, `Coral`.
- A selected swatch must have a clear visual state that does not rely on color alone.

### Upload Zone

Rules:
- Upload affordance must be visually calm and clearly interactive.
- Drag-over state should use primary/accent color, not destructive or warning color.
- Empty state copy should be concise and action-oriented.

### Icon Buttons

Rules:
- Use recognizable icons for delete, close, move, reset, upload, and export where available.
- Destructive icon buttons must be compact and use destructive color only on the active/hover emphasis.
- Icon buttons must include accessible names.

## Accessibility Requirements

- All interactive controls must be keyboard reachable.
- Every icon-only control must have an accessible name.
- Focus-visible states must be visible against the deep background.
- Text contrast must meet WCAG 2.2 AA.
- Selection delete must not depend on hover only; touch users must be able to reveal and activate it after selecting a shape.
- Motion and glow effects should not be required to understand state.
- Controls must preserve readable labels at mobile widths and short desktop heights.

Acceptance checks:
- Tab through upload, render mode, selection tool, swatches, sliders, and delete action.
- Confirm active/focus/disabled states are visually distinct.
- Confirm a selection can be created, moved, styled independently, and deleted.
- Confirm no UI text overlaps at common desktop and mobile viewport sizes.

## Content and Tone Standards

Tone should be concise, creative, and product-focused.

Preferred:
- `AsciiLens`
- `Render Mode`
- `Subject Overlay`
- `Selection Tool`
- `Color`
- `Character`
- `Columns`
- `Light & Tone`

Avoid:
- `ASCII Studio`
- `Base44`
- `Region list`
- `Area #1`
- Long explanatory text inside the app UI

Labels should describe the user action or editable property. Helper text should be rare and only appear when it reduces ambiguity.

## Anti-Patterns and Prohibited Implementations

- Do not use black-gold, beige/brown, or one-note monochrome palettes.
- Do not add large decorative blobs or unrelated atmospheric effects.
- Do not display selection numbers in the preview.
- Do not reintroduce a region list unless there is a clear batch-management workflow.
- Do not hide delete behind an oversized, visually heavy button.
- Do not hardcode raw colors in React components when a token exists.
- Do not place cards inside cards for editor sections.
- Do not use template or generator branding in visible UI.

## QA Checklist

- Brand name is AsciiLens everywhere visible.
- `Render Mode` is the first editor control.
- `Selection Tool` appears directly under render mode only for `Subject Overlay`.
- Multiple selections can be created, selected, moved, styled independently, and deleted.
- Active selection delete icon is small, polished, and accessible.
- No region list or selection number badges are visible.
- Palette reads black, white, pink, cream, blue, and object green.
- No black-gold or green cyberpunk styling remains.
- UI text does not overlap or clip on desktop or mobile.
- Build, lint, typecheck, and browser smoke test pass before release.
