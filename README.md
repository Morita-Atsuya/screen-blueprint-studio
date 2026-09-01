<img src="./brand/logo-lockup.svg" alt="Screen Blueprint Studio" width="324">

# Screen Blueprint Studio

[日本語](./README.ja.md)

Design screen structure, states, reusable UI, and behavior in one visual blueprint that product, design, engineering, QA, and AI collaborators can all understand.

[Try the live demo](https://morita-atsuya.github.io/screen-blueprint-studio/)

## Why it exists

Wireframes often show appearance while written specifications describe states, navigation, and API behavior somewhere else. As a product changes, those sources drift.

Screen Blueprint Studio keeps the visible wireframe and its structured specification together. Instead of free drawing, you assemble screens from named components with explicit layout, identity, state, and behavior. The canvas remains easy to review, while the underlying model stays precise enough for implementation discussions and automated tools.

## What you can do

- **Design complete screen flows.** Create multiple screens, model default and named states, and inspect navigation in a flow view.
- **Build with semantic components.** Arrange Pages, Containers, Text, Text Inputs, Selects, Buttons, Images, Links, Collections, and independent Modal frames through the Palette, Tree, Canvas, and Inspector.
- **Control layout without pixel-level guesswork.** Use vertical, horizontal, or 12-track grid layouts together with constrained placement, width, span, grow, and shrink settings.
- **Reuse UI safely.** Create Shared Component Definitions with stable internal nodes, typed public properties, and Variants. Editing a Definition updates every Instance.
- **Describe data-driven lists.** Repeat a Definition through a Collection with bounded preview data, stable item keys, item-to-property bindings, exact Variant selection, and visibility rules.
- **Connect behavior to the design.** Model click and submit events, ordered actions, screen states, navigation, and API request bindings. Collection item or literal values can populate API fields and navigation route or query parameters.
- **Edit with confidence.** Use Undo and Redo for confirmed human edits, inspect deletion impact, recover invalid browser data, and review AI-proposed change sets before applying or discarding them.

## One workspace for people and AI

People work visually with drag and drop, screen states, the Canvas, the Tree, and the Inspector. AI agents work through 10 WebMCP tools that expose named, typed operations for reading the current screen and selection or proposing changes to screens, components, states, behavior, and shared components.

Both use the same live page model. AI proposals appear as change sets inside the application, where a person can preview the result and then apply or discard it. This review step is part of the product's collaboration model rather than a separate export or approval system.

## Quick start

Open the [live demo](https://morita-atsuya.github.io/screen-blueprint-studio/), choose a screen, and select components in the Canvas or Tree. Drag Palette items into the structure, use the Inspector to edit specifications and behavior, and switch states above the Canvas.

To run locally:

```bash
npm install
npm run dev
```

See the [development guide](./docs/DEVELOPMENT.md) for commands, browser regression, WebMCP-enabled Chrome setup, and contribution checks.

## Public documentation

- [User guide](./docs/USER_GUIDE.md) / [ユーザーガイド](./docs/USER_GUIDE.ja.md)
- [Portable specification v3](./docs/PORTABLE_SPEC.md) / [ポータブル仕様 v3](./docs/PORTABLE_SPEC.ja.md)
- [Development guide](./docs/DEVELOPMENT.md) / [開発ガイド](./docs/DEVELOPMENT.ja.md)
- [Product roadmap](./docs/ROADMAP.md) / [プロダクトロードマップ](./docs/ROADMAP.ja.md)
- [Public JSON Schema](./public/schemas/screen-blueprint-project-v3.schema.json)
- [Canonical v3 example](./public/examples/screen-blueprint-project-v3.json)

## Current limitations

Projects are currently kept in browser `localStorage`; the product does not yet provide JSON or YAML import/export UI. The editor supports a defined set of component and behavior types, and the Canvas is an editing surface rather than an interactive prototype player. WebMCP support also depends on a compatible experimental Chrome build, while the human editing interface works without WebMCP.

See the [product roadmap](./docs/ROADMAP.md) for planned project files, broader specification coverage, and a dedicated review mode.

## License

Screen Blueprint Studio is available under the [MIT License](./LICENSE).
