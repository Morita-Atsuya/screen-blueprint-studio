# Screen Blueprint Studio user guide

[日本語](./USER_GUIDE.ja.md) · [Product overview](../README.md) · [Portable specification](./PORTABLE_SPEC.md) · [Roadmap](./ROADMAP.md)

## Understand the workspace

The editor has four primary working surfaces:

- **Palette** provides semantic components and available Shared Component Definitions.
- **Tree** shows the canonical screen hierarchy, including independent Modal roots and Collection boundaries.
- **Canvas** renders the current Screen and Scenario as an editable wireframe.
- **Inspector** edits the selected Screen, component, resolved Definition node, state, Event, or API specification.

Use the Screen list to add, rename, select, and remove Screens. Use the view tabs to switch between the Screen editor, navigation Flow, and Shared Component Definitions. The state controls above the Canvas create and select named Scenarios such as loading, empty, saving, success, and error.

Drag Palette items into the Tree or Canvas. Drag existing non-root components to reorder them or move them between compatible Containers, Pages, and Modals. Invalid parents, descendants, and sizing contexts are rejected with an explanation rather than silently adjusted.

Human edits to the confirmed project support Undo and Redo. Text fields keep a local draft while you type and commit one operation on Enter or blur where appropriate; Escape cancels an uncommitted text draft.

## Build with semantic components

The current release supports Page, Container, Text, Text Input, Select, Button, Image, Link, Collection, and Modal. Page is the Screen root. Modal is an independent Screen-owned frame. Container, Page, and Modal provide vertical, horizontal, or grid layouts.

Descriptions on structural components are editor metadata that help identify groups in the Tree and Canvas. Visible headings and copy belong in Text components. Button and Link labels remain separate from their behavior or destination.

### Images and links

Use **Image** when an image is part of the screen specification rather than decoration. Set a portable relative URL or absolute HTTP(S) URL, meaningful alt text, constrained fit, aspect ratio, and placeholder style. An unset source and a network loading failure appear as explicit wireframe placeholders.

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

Use a **Component Definition** when the same semantic subtree should stay synchronized across Screens. A Definition owns stable local nodes, a base design, typed public properties, and optional Variants. A Screen stores a Definition **Instance** with its selected Variant, explicit public-property values, and outer placement and sizing. Editing the Definition updates every Instance immediately.

Open **Definitions** to create, rename, describe, or duplicate a Definition; inspect its structure; expose a supported node field as a public property; and add Variant overrides. Instance values resolve in this order:

1. Definition base
2. selected final Variant
3. explicit Instance public-property value
4. active Scenario override

A Variant changes only supported fields and never changes node identity or topology.

The Palette lists available Definitions. Select an Instance boundary to edit its Variant, public properties, placement, or sizing. Select a resolved node inside it to inspect the stable Instance-and-node-path target, attach behavior or a Scenario override, and open its source Definition. Resolved nodes are sealed against direct base edits.

You can extract an inline subtree into a Definition or detach a normal Instance back to inline components. Each operation is one atomic Undo step and rewrites affected Scenario, Event, and API targets. Deleting a Definition is blocked while Screen Instances or nested Definition references still use it; the Definitions view shows the impact. Nested Definitions must remain acyclic and within bounded expansion limits.

## Describe Collections

Use a **Collection** to repeat one Definition from a bounded preview slice. Choose the item Definition, provide preview objects, and set a stable item-key JSON Pointer. The response items path is relative to an API response body. Item keys, public-property bindings, Variant rules, visibility rules, and behavior item values are relative to each item. A missing value remains different from an explicit `null`.

Each preview item resolves to one completed Definition: Definition base, one final Variant, then item-bound public properties. Variant selection uses the first exact scalar case, then the rule fallback, then the item-template Variant. Visibility uses an exact scalar rule with explicit matched and fallback outcomes.

Canvas repeats resolved items without adding Screen-owned component copies. Tree keeps one canonical Collection boundary. Clicking an internal node in any preview item selects the shared template target, identified by the Collection ID and stable Definition-local node path. Inspector labels it as applying to every item and shows its Event and API behavior. Preview item order and runtime DOM IDs are never persisted as targets.

Preview data is limited to 20 objects, 32 KiB, and eight levels of nesting. Item keys must resolve to unique strings or numbers. A Definition cannot be deleted while a Collection uses it. Removing a referenced API operation explicitly disconnects the Collection data source while preserving its preview slice.

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

People use the visual workspace; AI agents use 11 named and typed WebMCP tools. Both read the same live Screen, selection, resolved components, states, Events, and APIs.

An AI write begins a change set. Its operations appear in the effective preview and Changes panel while the confirmed project remains unchanged. During review, document-changing controls, drag and drop, Undo, and Redo are locked, but selection, inspection, Canvas pan and zoom, and Flow remain available. Apply the proposal to make it one confirmed history entry, or discard it to leave the project unchanged.

WebMCP requires a compatible experimental Chrome build. Browsers without `document.modelContext` skip tool registration while retaining the full human editor. Setup and the tool list are in the [development guide](./DEVELOPMENT.md).

## Saving and current limitations

The workspace is cached in browser `localStorage`, including the confirmed document, revision, active context, and an in-progress change set. Invalid persisted data opens a recovery screen instead of being silently reset. A storage write failure remains visible and allows a JSON recovery download.

The current product does not provide normal JSON or YAML import/export UI. The recovery download is not a general project-file workflow. File-based sharing, broader custom specification entries, and a non-editing review mode are planned in the [roadmap](./ROADMAP.md).
