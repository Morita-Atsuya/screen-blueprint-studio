# Screen Blueprint Studio product roadmap

[日本語](./ROADMAP.ja.md)

Last updated: September 1, 2026

Screen Blueprint Studio turns semantic UI components into a shared source of truth for wireframes, screen states, behaviors, API bindings, and reviewable human–AI changes. It models screens as structured specifications rather than free-form drawings, keeps visual editing and behavior aligned through one portable model, and gives people explicit control over AI-authored changes. The specification favors constrained, typed choices and does not expose raw CSS or arbitrary JavaScript expressions.

## Available in this release

- A three-pane workspace for screen structure, a wireframe canvas, and specification inspection.
- Multiple screens with Page and Modal roots, semantic components, reusable layout primitives, constrained placement, and portable sizing tokens.
- Shared Components with typed public properties and variants for placing validated, reusable instances across screens.
- Collection modeling for repeated, item-driven screen content with semantic selection and specification editing.
- Screen states with component-level overrides for visibility, enabled state, content, and values.
- Ordered `click` and `submit` behaviors that can change state, call an API operation, or navigate to another screen.
- API operations with request field bindings and success or error state outcomes.
- Safe semantic Image and Link specifications for portable URLs, internal screens, external URLs, and logical resources.
- Direct human editing, undo/redo, local persistence and recovery, subtree duplication, copy/paste, and validated drag-and-drop.
- Typed WebMCP tools that share the live screen, selection, and effective document with an AI agent. Agent writes remain in a reviewable change set until a person accepts or rejects them.

## Planned enhancements

Planned enhancements extend portability and behavior modeling without turning the studio into a code editor:

- **Portable JSON/YAML import and export** for moving complete projects between environments and reviewing them in version control.
- A general typed **ValueSource** model with `component`, `item`, `route`, `query`, and `literal` sources for data-driven properties and bindings.
- **`load` and `change` triggers** alongside the existing `click` and `submit` triggers.
- **Back, external navigation, resource, and scroll actions** alongside state changes, API calls, and internal navigation.
- **HTTP status-specific API outcomes** so individual response classes or status codes can select distinct states.
- Definition-based **Status Badge, Pagination, and Notification patterns** built from reusable component definitions rather than hard-coded special cases.
- **Improved interaction preview** for exercising triggers, actions, collection items, navigation, and API outcomes while keeping editing and execution modes clearly separated.

Roadmap scope may be refined as each capability is designed, but the portability, typed-model, and human-review principles above remain the product boundary.
