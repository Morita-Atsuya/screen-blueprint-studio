# Screen Blueprint Studio product roadmap

[日本語](./ROADMAP.ja.md)

Last updated: September 1, 2026

Screen Blueprint Studio turns semantic UI components into a shared source of truth for wireframes, screen states, behaviors, API bindings, and reviewable human–AI changes. It models screens as structured specifications rather than free-form drawings, keeps visual editing and behavior aligned through one portable model, and gives people explicit control over AI-authored changes. The editor does not render or execute raw CSS, arbitrary HTML, or JavaScript expressions from specifications.

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
- An **open-world specification model** with typed standard cases for references, validation, and WebMCP operations. Standard conveniences include `component`, `item`, `route`, `query`, and `literal` ValueSources; `load` and `change` triggers; back, external navigation, resource, and scroll actions; and HTTP status-specific API outcomes.
- A **custom specification fallback** for HTML/UI components, triggers, actions, conditions, and value sources that do not yet have a standard type. Custom entries retain `name`, `description`, `input`, `output`, `example`, and `implementation notes`, remain visible in the studio, and round-trip without being rejected as unknown enum values. They are descriptive specifications, not executable HTML or JavaScript.
- **Improved interaction preview** for clearer feedback across screen states, collection items, navigation, and API outcomes while keeping editing and preview contexts clearly separated.

Roadmap scope may be refined as each capability is designed, but portability, typed standard cases with an open-world fallback, and human review remain the product boundary.
