# Developing Screen Blueprint Studio

[日本語](./DEVELOPMENT.ja.md) · [Product overview](../README.md) · [Portable specification](./PORTABLE_SPEC.md)

## Requirements and setup

Use Node.js 22 and npm. Chrome or Chromium is also required for the browser regression suite.

```bash
npm install
npm run dev
```

Open the URL printed by Vite, normally <http://localhost:5173>.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check the project and build the production bundle |
| `npm run test:foundation` | Check canonical v3, resolver, invariant, Definition, Collection, and WebMCP foundations |
| `npm run test:ui-regression` | Run domain, store, persistence, UI contract, and mounted DOM regression groups |
| `npm run test:browser-regression` | Run production-DOM regression in Chrome or Chromium |
| `npm run test:regression` | Run all three regression suites |
| `npm run preview` | Serve the existing `dist` production bundle locally |

Build before running the complete or browser-only regression because the browser runner serves `dist`:

```bash
npm run build
npm run test:regression
```

If Chrome is not installed in a standard location, set `CHROME_PATH` to the executable. The browser runner starts an isolated local server and browser profile, exercises the production DOM, and cleans up the process tree on macOS and Linux. Its process-tree cleanup is not supported on Windows.

## Architecture and project structure

The application is a client-side React and TypeScript editor. Zustand owns the workspace state, CSS Modules render the interface, and dnd-kit provides structural drag and drop.

The confirmed canonical document is separate from editor workspace state. Human edits update the confirmed document and its workspace revision. AI writes are collected in an active change set and projected into an effective document for preview. Applying the change set replaces the confirmed document atomically; discarding it leaves the confirmed document unchanged.

```text
.
├── public/
│   ├── examples/         # Canonical v3 example
│   └── schemas/          # Public canonical v3 JSON Schema
├── scripts/              # Foundation, UI, and Chrome regression runners
├── src/
│   ├── app/              # Store, app shell, review lock, recovery, shortcuts
│   ├── config/           # Build-time feature flags
│   ├── dnd/              # Drag context, drop zones, and placement validation
│   ├── domain/           # Model, commands, invariants, resolvers, transactions
│   ├── features/         # Canvas, Tree, Inspector, Palette, Flow, Definitions
│   ├── i18n/             # Typed English and Japanese UI messages
│   ├── persistence/      # Workspace cache and recovery in localStorage
│   ├── sample/           # TaskFlow sample project
│   ├── styles/           # Shared styling
│   └── webmcp/           # Tool definitions, schemas, parsing, registration
├── package.json
└── vite.config.ts
```

See the [portable specification guide](./PORTABLE_SPEC.md) for the canonical document model and its identity rules.

## Development-only sample reset

`Reset to sample` is a development aid. It is hidden in ordinary development, production builds, and GitHub Pages unless `VITE_ENABLE_SAMPLE_RESET` is exactly `true`.

```bash
VITE_ENABLE_SAMPLE_RESET=true npm run dev
```

For a production build with the same control:

```bash
VITE_ENABLE_SAMPLE_RESET=true npm run build
```

You can also place the value in `.env.local`. Unset, empty, `false`, and `1` keep the control hidden. Recovery actions for invalid persisted data are always available and do not depend on this flag.

## Manual WebMCP verification in Chrome

WebMCP is experimental. Use a compatible Chrome build, enable:

```text
chrome://flags/#enable-webmcp-testing
```

Restart Chrome, open the application, and inspect WebMCP in Chrome DevTools. The current release registers 10 tools:

| Tool | Role |
| --- | --- |
| `get_current_screen_context` | Read the effective active screen, selection, revision, and proposal metadata |
| `get_component` | Read a component or canonical resolved target |
| `get_pending_change_set` | Read the active proposal and review diff |
| `change_screen_structure` | Add, update, or remove screens |
| `change_component_structure` | Add, move, duplicate, or remove components |
| `update_component_spec` | Update component content, placement, sizing, or kind-specific settings |
| `upsert_screen_state` | Create, update, or remove named screen states |
| `connect_behavior` | Create, update, or remove Events and API operations |
| `manage_component_definition` | Manage Definitions, public properties, and Variants |
| `manage_definition_instance` | Add or update Instances, or extract and detach shared components |

A useful manual check is:

1. Confirm that all 10 tools register once without console errors.
2. Run `get_current_screen_context` and verify that it reports the visible active screen and current selection.
3. Submit one typed write and confirm that it atomically creates a proposal and returns the change-set ID, base revision, version, operation ID, and any created entity IDs.
4. Submit a related second write and confirm that it appends to the same proposal without agent-carried revision or version arguments.
5. Read `get_pending_change_set` and compare its summary and field diff with the preview in the application.
6. Apply or discard the proposal in the human UI and confirm that the review lock clears.

Registration waits for each `registerTool()` call. If registration fails partway through, the shared abort signal unregisters previously added tools and the error is reported. Browsers without `document.modelContext` skip registration while keeping the human editor available.

## Contribution checks

Prefer the smallest relevant test while editing, then run the complete regression once the change is stable. Documentation-only changes need only link and consistency checks unless they alter generated or executable examples.

The canonical v3 contract is represented in several deliberate surfaces. When changing it, keep these aligned:

- TypeScript model and canonical constants in `src/domain/`
- Runtime parsing, semantic invariants, commands, cloning, and resolver behavior
- WebMCP input schemas, parsers, projections, and tool descriptions
- `public/schemas/screen-blueprint-project-v3.schema.json`
- `public/examples/screen-blueprint-project-v3.json`
- The TaskFlow sample, Inspector, Canvas, Tree, and change-set presentation
- English and Japanese UI messages and public documentation
- Foundation, UI, and browser regressions

Do not resolve drift by weakening validation or silently dropping unsupported fields. A canonical change should either round-trip across every supported surface or fail with an explicit validation error. Keep stable IDs and JSON Pointer paths intact when copying, extracting, detaching, or rewriting references.

Before opening a contribution:

```bash
git diff --check
npm run build
npm run test:regression
```
