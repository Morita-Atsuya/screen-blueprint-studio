# Portable specification v3

[日本語](./PORTABLE_SPEC.ja.md) · [Product overview](../README.md) · [Public JSON Schema](../public/schemas/screen-blueprint-project-v3.schema.json) · [Canonical example](../public/examples/screen-blueprint-project-v3.json)

## Purpose

Screen Blueprint Studio stores a screen blueprint as a canonical v3 document: the authoritative structured form of the project from which the Canvas, Tree, Inspector, Flow view, and WebMCP projections are derived.

Here, **canonical** means that one representation defines the project rather than keeping separate wireframe and behavior files. **Typed** means that each supported component, target, action, and value has an explicit shape that can be checked. **Portable** means that the document uses stable IDs, local references, JSON-compatible values, and constrained layout tokens instead of browser DOM nodes, coordinates, or runtime-only state.

## Canonical document and workspace state

The canonical document is a revision-free confirmed project. Its top-level shape is:

```text
$schema
kind
schemaVersion
project
componentDefinitions
screens
components
screenScenarios
events
apiOperations
```

It intentionally does not contain an editor revision, active screen, active Scenario, selection, Undo history, or an active change set.

The application keeps those operational values in a workspace envelope stored in browser `localStorage`. The envelope includes the confirmed document, its optimistic revision, active UI context, and any in-progress AI change set. The effective preview document is derived by applying that change set to the confirmed document; it is not a second saved project.

## Public contract

- Schema version: `3`
- Kind: `screen-blueprint-project`
- Schema URL: <https://morita-atsuya.github.io/screen-blueprint-studio/schemas/screen-blueprint-project-v3.schema.json>
- Repository schema: [`public/schemas/screen-blueprint-project-v3.schema.json`](../public/schemas/screen-blueprint-project-v3.schema.json)
- Repository example: [`public/examples/screen-blueprint-project-v3.json`](../public/examples/screen-blueprint-project-v3.json)

The public Schema and example are developer-facing contract artifacts. In the current release, the product UI does **not** import or export JSON or YAML project files. File-based sharing and validated import/export are planned on the [roadmap](./ROADMAP.md).

## Main concepts

### Project, Screen, and Scenario

A Project orders Screens by stable ID. Each Screen has a name, route, base description, one Page root, optional independent Modal roots, named Scenarios, and Events.

A Scenario represents a state such as loading, empty, saving, success, or error. It contains field-level overrides addressed through canonical component targets. The base screen remains the default; Scenarios store only explicit differences.

### Screen components, placement, and sizing

Screen-owned components are either inline nodes or Shared Component Instances. Inline nodes form a parent/child tree and use supported semantic kinds: Page, Container, Text, Text Input, Select, Button, Image, Link, Collection, and Modal.

Placement uses constrained modes: flow, overlay, sticky edge, or frame viewport. Sizing uses portable values for inline size, minimum and maximum width, 12-track grid span, grow ratio, and shrink behavior. Root placement and sizing are fixed. Invalid parent, layout, placement, or sizing combinations are rejected instead of being silently adjusted.

### Shared Component Definition and Instance

A Definition is global to the project. It owns:

- a stable Definition ID;
- stable Definition-local node IDs and one root node;
- the reusable subtree;
- typed public properties;
- Variant properties and completed Variants.

A screen Instance has its own stable screen component ID and a local JSON Pointer `$ref` to the Definition. It stores only explicit public-property values, the selected Variant, and the outer placement and sizing owned by the screen.

Definition node topology does not change between Variants. A Variant may override only supported fields. Resolved values follow this order:

1. Definition base fields
2. selected final Variant
3. explicit Instance public-property values
4. active Scenario override

Nested Definition references must form a directed acyclic graph and remain within bounded expansion limits.

### Collection

A Collection repeats one Definition without creating a separate screen component subtree for every preview item. It stores:

- an optional API operation reference and response `itemsPath`;
- at most 20 bounded preview objects;
- an RFC 6901 item-key JSON Pointer whose scalar results are unique;
- one item template with a Definition reference, base Variant, and explicit properties;
- item or literal bindings to public properties;
- ordered exact-scalar Variant cases and an explicit fallback;
- an optional exact-scalar visibility rule with explicit matched and fallback results.

Preview items are an editor slice, not a second API response schema. A rendered item's runtime DOM ID or preview order is never a persisted behavior target.

### Targets and identity

Components, Scenario overrides, Events, and API bindings use one of three target forms:

- `inline`: a screen-owned inline component ID;
- `definitionNode`: an Instance ID plus a stable Definition-local `nodePath`;
- `collectionItemNode`: a Collection ID plus a stable Definition-local `nodePath`.

The last form means “this node in the item template for every Collection item.” An ephemeral preview item key may help render the Canvas, but it is not stored in the canonical target. Renaming or reordering display content therefore does not change target identity.

Definition references use local JSON Pointer fragments such as `#/componentDefinitions/shared~1header`. Pointer tokens escape `~` as `~0` and `/` as `~1`.

### Events, actions, and API operations

An Event belongs to a Screen, has a `click` or `submit` trigger, and stores ordered actions. Supported actions set or clear a Scenario, call an API operation, or navigate to another Screen.

Navigation may map named route and query parameters from:

- `{ "type": "item", "path": "/id" }`, using an RFC 6901 pointer into the current Collection item; or
- `{ "type": "literal", "value": "task-list" }`, using a JSON scalar.

An API operation records its method, path, request bindings, and optional success and error Scenarios. A request binding connects an existing structured target path to an input component target, current Collection item value, or literal scalar.

Item sources are valid only when the Event target establishes one Collection item context. API item bindings require callers from that same Collection context. Missing pointers, object or array results where a scalar is required, type mismatches, cross-Screen references, and cross-Collection contexts are validation errors rather than defaulted values.

## Validation and round-trip policy

The runtime validates both structure and meaning:

- exact supported object fields and value types;
- entity ownership and reference existence;
- parent/child topology and root constraints;
- Definition DAG and expansion limits;
- public-property and Variant compatibility;
- Collection bounds, pointer syntax, item-key uniqueness, and scalar rules;
- Event, navigation, API, Scenario, and target context;
- placement and sizing rules;
- prototype-chain-safe entity IDs.

Missing values and explicit `null` are distinct. Copy, duplicate, extract, detach, and delete operations must either rewrite dependent IDs and targets atomically or refuse the operation. Unsupported or malformed data is not silently removed.

The current v3 model is intentionally guided: only the listed standard kinds and behaviors are accepted. Preserving custom, non-executable specification entries for other components and behavior is a planned enhancement described in the [roadmap](./ROADMAP.md).
