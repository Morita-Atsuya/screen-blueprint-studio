# Screen Blueprint Studio user guide

[日本語](./USER_GUIDE.ja.md)

## Semantic media and links

Use **Image** when an image is part of the screen specification rather than decoration. Set a portable relative URL or an absolute HTTP(S) URL, provide meaningful alt text, then choose constrained fit, aspect-ratio, and placeholder tokens. An unset source and a network loading failure are shown as explicit wireframe placeholders.

Use **Link** for navigation to an internal screen, an external HTTP(S) URL, or a logical resource. The visible label is independent from its destination. Internal links open in the same context. External links may open in the same or a new context. Resource links may additionally request a download, although browsers and resource servers can ignore that request. A resource ID is an opaque logical identifier, not a reference to a project-level resource catalog.

Unsafe URL schemes, scheme-relative URLs, control characters, and backslash-based host forms are rejected. Links opened in a new context use `noopener noreferrer`. Canvas links remain focusable anchors but do not navigate while the wireframe is being edited.

## Component placement

Every component has a portable placement mode. **Flow** participates in its parent layout. **Overlay** does not occupy layout space and uses a nine-point anchor inside its immediate logical parent. **Sticky edge** is not CSS document-sticky behavior: it occupies no layout space and remains at the top or bottom edge of the owning Page or Modal frame. **Frame viewport** uses a nine-point anchor in that same owning frame and remains separate from the frame's scrolling content.

Insets use `none`, `xs`, `sm`, `md`, or `lg` tokens and always move inward from an aligned edge. Raw pixels, negative offsets, and specification-level z-index values are not supported. A centered axis requires a `none` inset. Visual stacking follows placement layers and canonical sibling order while Tree hierarchy, selection, behavior targets, copy/paste, and drag-and-drop continue to use canonical component identity and parent/index order.

## Constrained component sizing

Non-root components expose portable inline sizing in the Placement section. **Auto** follows the parent layout default, **Fit content** shrink-wraps intrinsic content within available width, and **Fill** uses the available inline width. Minimum and maximum widths use the ordered `xs` through `xl` tokens; the minimum cannot exceed the maximum.

A Grid has 1–12 explicit equal tracks and each flow child may span 1 through the parent column count. Tracks do not collapse responsively, so narrow frames preserve horizontal overflow. Horizontal-flow children may use grow ratios 0–3 and allow or prevent shrinking. A positive grow ratio requires Fill and Allow shrink and uses a zero flex basis. Vertical and non-flow context values remain neutral. Root sizing is fixed and structural changes or drag-and-drop operations that would invalidate sizing are rejected rather than adjusted.

## Shared components

Use a **Component Definition** when the same semantic subtree should stay synchronized across screens. A Definition owns stable local nodes, a base design, typed public properties, and optional Variants. A screen stores only a Definition **Instance** with its selected Variant, explicit public-property values, and outer placement and sizing. Editing the Definition updates every Instance immediately.

Open **Definitions** in the main view to create, rename, describe, or duplicate a Definition; inspect its structure; expose a supported node field as a public property; and add Variant overrides. Instance values resolve in a fixed order: Definition base, selected Variant, explicit Instance property, then the active Scenario override. A Variant changes only supported fields and never changes node identity or topology.

The Palette lists available Definitions. Select an Instance boundary to edit its Variant, public properties, placement, or sizing. Select a resolved node inside it to inspect its stable Instance-and-node-path identity, target it from a Scenario, and jump to its source Definition. Resolved nodes are sealed against direct base edits.

You can extract an inline subtree into a Definition or detach a normal Instance back to inline components. Each operation is one atomic Undo step and rewrites affected Scenario, Event, and API targets to preserve behavior. Deleting a Definition is blocked while screen Instances or nested Definition references still use it; the Definitions view shows the affected reference counts. Nested Definitions must form an acyclic graph and stay within bounded expansion limits.
