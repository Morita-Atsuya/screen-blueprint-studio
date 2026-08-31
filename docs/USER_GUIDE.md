# Screen Blueprint Studio user guide

[日本語](./USER_GUIDE.ja.md)

## Semantic media and links

Use **Image** when an image is part of the screen specification rather than decoration. Set a portable relative URL or an absolute HTTP(S) URL, provide meaningful alt text, then choose constrained fit, aspect-ratio, and placeholder tokens. An unset source and a network loading failure are shown as explicit wireframe placeholders.

Use **Link** for navigation to an internal screen, an external HTTP(S) URL, or a logical resource. The visible label is independent from its destination. Internal links open in the same context. External links may open in the same or a new context. Resource links may additionally request a download, although browsers and resource servers can ignore that request. A resource ID is an opaque logical identifier, not a reference to a project-level resource catalog.

Unsafe URL schemes, scheme-relative URLs, control characters, and backslash-based host forms are rejected. Links opened in a new context use `noopener noreferrer`. Canvas links remain focusable anchors but do not navigate while the wireframe is being edited.

## Component placement

Every component has a portable placement mode. **Flow** participates in its parent layout. **Overlay** does not occupy layout space and uses a nine-point anchor inside its immediate logical parent. **Sticky edge** is not CSS document-sticky behavior: it occupies no layout space and remains at the top or bottom edge of the owning Page or Modal frame. **Frame viewport** uses a nine-point anchor in that same owning frame and remains separate from the frame's scrolling content.

Insets use `none`, `xs`, `sm`, `md`, or `lg` tokens and always move inward from an aligned edge. Raw pixels, negative offsets, and specification-level z-index values are not supported. A centered axis requires a `none` inset. Visual stacking follows placement layers and canonical sibling order while Tree hierarchy, selection, behavior targets, copy/paste, and drag-and-drop continue to use canonical component identity and parent/index order.
