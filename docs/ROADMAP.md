# Screen Blueprint Studio product roadmap

[日本語](./ROADMAP.ja.md)

Last updated: September 1, 2026

Screen Blueprint Studio turns semantic UI components into a shared source of truth for wireframes, screen states, behaviors, API bindings, and reviewable human–AI changes. This roadmap separates capabilities available in the product today from work in the current milestone and the enhancements planned next.

## Product principles

- Model screens as semantic, structured specifications rather than free-form drawings.
- Keep visual editing, behavior, and documentation aligned through one portable model.
- Let people retain control of AI-authored changes through explicit preview, accept, and reject steps.
- Prefer constrained, typed choices over hidden implementation details. The specification does not expose raw CSS or arbitrary JavaScript expressions.

## Available now

- A three-pane workspace for screen structure, a wireframe canvas, and specification inspection.
- Multiple screens with Page and Modal roots, semantic components, reusable layout primitives, constrained placement, and portable sizing tokens.
- Screen states with component-level overrides for visibility, enabled state, content, and values.
- Ordered `click` and `submit` behaviors that can change state, call an API operation, or navigate to another screen.
- API operations with request field bindings and success or error state outcomes.
- Safe semantic Image and Link specifications for portable URLs, internal screens, external URLs, and logical resources.
- Direct human editing, undo/redo, local persistence and recovery, subtree duplication, copy/paste, and validated drag-and-drop.
- Typed WebMCP tools that share the live screen, selection, and effective document with an AI agent. Agent writes remain in a reviewable change set until a person accepts or rejects them.

## Current milestone

| Capability | Status | Intended outcome |
| --- | --- | --- |
| Shared Components | **In progress** | Define reusable components once, expose typed public properties and variants, and place validated instances across screens. |
| Collection | **In progress** | Deliver a vertical slice for modeling repeated, item-driven screen content while preserving semantic selection and specification editing. |

These rows intentionally remain **In progress** until their implementations are integrated and released. At final integration, each row can move independently to **Available now** or remain in this milestone without changing the rest of the roadmap.

## Planned next

The next product increment extends portability and behavior modeling without turning the studio into a code editor:

- **Portable JSON/YAML import and export** for moving complete projects between environments and reviewing them in version control.
- A general typed **ValueSource** model with `component`, `item`, `route`, `query`, and `literal` sources for data-driven properties and bindings.
- **`load` and `change` triggers** alongside the existing `click` and `submit` triggers.
- **Back, external navigation, resource, and scroll actions** alongside state changes, API calls, and internal navigation.
- **HTTP status-specific API outcomes** so individual response classes or status codes can select distinct states.
- Definition-based **Status Badge, Pagination, and Notification patterns** built from reusable component definitions rather than hard-coded special cases.
- **Improved interaction preview** for exercising triggers, actions, collection items, navigation, and API outcomes while keeping editing and execution modes clearly separated.

Roadmap scope may be refined as each capability is designed, but the portability, typed-model, and human-review principles above remain the product boundary.
