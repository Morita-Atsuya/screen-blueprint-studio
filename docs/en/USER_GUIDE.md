# Screen Blueprint Studio user guide

[日本語](../ja/USER_GUIDE.md) · [Product overview](../../README.md) · [Portable specification](./PORTABLE_SPEC.md) · [Roadmap](./ROADMAP.md)

## Understand the workspace

The editor has four primary working surfaces:

- **Palette** provides semantic components and available Shared components.
- **Tree** shows the canonical screen hierarchy, including independent Modal roots and Collection boundaries.
- **Canvas** renders the current Screen and Scenario as an editable wireframe.
- **Inspector** edits the selected Screen component, Shared component element, state, Event, or API specification.

Use the Screen list to add, rename, select, and remove Screens. Use the view tabs to switch between the Screen editor, navigation Flow, and **Shared components**. The state controls above the Canvas create and select named Scenarios such as loading, empty, saving, success, and error.

Drag Palette items into the Tree or Canvas. Drag existing non-root components to reorder them or move them between compatible Containers, Pages, and Modals. Invalid parents, descendants, and sizing contexts are rejected with an explanation rather than silently adjusted.

Human edits to the confirmed project support Undo and Redo. Text fields keep a local draft while you type and commit one operation on Enter or blur where appropriate; Escape cancels an uncommitted text draft.

## Build with semantic components

The current release supports Page, Container, Text, Text Input, Select, Button, Image, Link, Collection, and Modal. Page is the Screen root. Modal is an independent Screen-owned frame. Container, Page, and Modal provide vertical, horizontal, or grid layouts.

Descriptions on structural components are editor metadata that help identify groups in the Tree and Canvas. Visible headings and copy belong in Text components. Button and Link labels remain separate from their behavior or destination.

### Images and links

Use **Image** when an image is part of the screen specification rather than decoration. Describe its purpose with the component description, and set meaningful alt text, constrained fit, aspect ratio, and placeholder style. The standard Inspector does not ask wireframe authors to type a runtime image URL. Existing imported documents and resolved Collection or Definition data may still provide a portable relative or HTTP(S) source for preview; otherwise the Canvas shows a low-fidelity image placeholder. A loading failure falls back to the same placeholder.

Use **Link** for navigation to an internal Screen, an external HTTP(S) URL, or a logical resource. Internal links open in the same context. External links may use the same or a new context. Resource links may request a download, although browsers and servers may ignore that request. A resource ID is an opaque identifier, not a reference to a project-level asset catalog.

Unsafe URL schemes, scheme-relative URLs, control characters, and backslash-based host forms are rejected. Links opened in a new context use `noopener noreferrer`. Canvas links remain focusable but do not navigate while the wireframe is being edited.

## Arrange placement and sizing

Every component has a constrained placement mode:

- **Flow** participates in its parent layout.
- **Overlay** leaves layout flow and uses a nine-point anchor inside its immediate logical parent.
- **Sticky edge** leaves layout flow and stays at the top or bottom of its owning Page or Modal frame. It is not CSS document-sticky behavior.
- **Frame viewport** uses a nine-point anchor in the owning frame and remains separate from scrolling frame content.

Insets use `none`, `xs`, `sm`, `md`, or `lg` tokens and always move inward from an aligned edge. Raw pixels, negative offsets, and specification-level z-index values are not supported. Visual stacking follows placement layers and canonical sibling order; Tree order, selection, behavior targets, copy/paste, and drag and drop continue to use stable canonical identity.

Non-root components also expose inline sizing. **Auto** follows the parent layout default, **Fit content** follows intrinsic content within available width, and **Fill** uses the available inline width. Minimum and maximum width use ordered `xs` through `xl` tokens, and minimum cannot exceed maximum.

A Grid has 1–12 explicit equal tracks. Each flow child may span up to its parent's track count. Tracks do not collapse responsively, so narrow frames preserve horizontal overflow. Horizontal-flow children may use grow ratios 0–3 and allow or prevent shrinking. A positive grow ratio requires Fill and Allow shrink. Vertical or non-flow contexts keep grow and shrink neutral. Root sizing is fixed.

## Reuse Shared Components

Use a **Shared component** when the same semantic subtree should stay synchronized across Screens. It owns stable local elements, a base design, typed public fields, and optional display patterns. Each usage location on a Screen stores its selected pattern, explicit public-field values, and outer placement and sizing. Editing the Shared component updates every usage location immediately.

Open **Shared components** to see the reusable design as an isolated visual preview. Select an element in the preview or structure list, then use the right Inspector to rename, describe, duplicate, edit basic fields, adjust layout/placement/sizing, expose a public field, or add display-pattern overrides. The Base/Pattern and Base values/Usage sample controls only change what the preview shows. Usage values resolve in this order:

1. Shared component base
2. selected final display pattern
3. explicit usage-location public-field value
4. active Scenario override

A display pattern changes only supported fields and never changes element identity or topology.

The Palette lists available Shared components. Select a usage boundary to edit its display pattern, public fields, placement, or sizing. Select a resolved element inside it to inspect the stable usage-and-element-path target, attach behavior or a Scenario override, and open its source Shared component. Resolved elements are sealed against direct base edits.

You can extract an inline subtree into a Shared component or detach a normal usage back to inline components. Each operation is one atomic Undo step and rewrites affected Scenario, Event, and API targets. Deleting a Shared component is blocked while Screen or nested usage locations still reference it; the Inspector shows the impact. Nested Shared components must remain acyclic and within bounded expansion limits. Elements owned by a nested Shared component are read-only until you open that source component.

## Describe Collections

Use a **Collection** to repeat one Shared component from a bounded preview slice. Choose the item Shared component, provide preview objects, and set a stable item-key JSON Pointer. The response items path is relative to an API response body. Item keys, public-field bindings, display-pattern rules, visibility rules, and behavior item values are relative to each item. A missing value remains different from an explicit `null`.

Each preview item resolves to one completed Shared component: base, one final display pattern, then item-bound public fields. Pattern selection uses the first exact scalar case, then the rule fallback, then the item-template pattern. Visibility uses an exact scalar rule with explicit matched and fallback outcomes.

Canvas repeats resolved items without adding Screen-owned component copies. Tree keeps one canonical Collection boundary. Clicking an internal element in any preview item selects the shared template target, identified by the Collection ID and stable Shared-component-local path. Inspector labels it as applying to every item and shows its Event and API behavior. Preview item order and runtime DOM IDs are never persisted as targets.

Preview data is limited to 20 objects, 32 KiB, and eight levels of nesting. Item keys must resolve to unique strings or numbers. A Shared component cannot be deleted while a Collection uses it. Removing a referenced API operation explicitly disconnects the Collection data source while preserving its preview slice.

## Connect Events, navigation, and APIs

Select a suitable component or resolved target and open **Behavior** in Inspector. Events use a click or submit trigger and an ordered list of actions. Actions can set or clear a Scenario, call an API operation, or navigate to another Screen.

Navigation can include named route and query parameters. Each parameter may use a literal scalar or, when the trigger is a Collection item node, an RFC 6901 JSON Pointer into the current item.

API operations record a method, path, request bindings, and optional success and error Scenarios. A request binding connects an existing target path such as `path.taskId` or `body.title` to:

- a Text Input or Select target on the same Screen;
- a literal JSON scalar; or
- the current Collection item through a JSON Pointer.

An item value is accepted only when the Event target establishes one Collection context. Missing pointers, object values where a scalar is required, type mismatches, and mixed Collection contexts are shown as validation errors rather than replaced with defaults.

Text Input components also support ordered validation rules for required values, minimum or maximum length, patterns, email format, and documented custom requirements.

## Work with AI through WebMCP

People use the visual workspace; AI agents use 10 named and typed WebMCP tools. Both read the same live Screen, selection, resolved components, states, Events, and APIs.

The first valid AI write atomically creates a change set and adds its operation; later writes append to that proposal. A failed first write does not leave an empty review lock. Operations appear in the effective preview and Changes panel while the confirmed project remains unchanged. During review, document-changing controls, drag and drop, Undo, and Redo are locked, but selection, inspection, Canvas pan and zoom, and Flow remain available. Apply the proposal to make it one confirmed history entry, or discard it to leave the project unchanged.

WebMCP requires a compatible experimental Chrome build. Browsers without `document.modelContext` skip tool registration while retaining the full human editor. Setup and the tool list are in the [development guide](./DEVELOPMENT.md).

## Saving and current limitations

The workspace is cached in browser `localStorage`, including the confirmed document, revision, active context, and an in-progress change set. Invalid persisted data opens a recovery screen instead of being silently reset. A storage write failure remains visible and allows a JSON recovery download.

The current product does not provide normal JSON or YAML import/export UI. The recovery download is not a general project-file workflow. File-based sharing, broader custom specification entries, and a non-editing review mode are planned in the [roadmap](./ROADMAP.md).
