# Screen Blueprint Studio product roadmap

[日本語](../ja/ROADMAP.md) · [Product overview](../../README.md) · [User guide](./USER_GUIDE.md) · [Portable specification](./PORTABLE_SPEC.md)

Last updated: September 1, 2026

Screen Blueprint Studio helps product managers, designers, engineers, and QA teams agree on how web screens should look and behave before and during implementation. Teams can build a visual screen blueprint and keep layouts, states, reusable UI, data-driven lists, user actions, and API results together, reducing drift between wireframes and written specifications.

## Available in this release

- **Design multi-screen flows and states.** Create and connect multiple screens, then show how each one looks in states such as default, loading, empty, saving, success, or error. This makes review scenarios visible without maintaining a separate wireframe for every state.

- **Manage shared UI and variants in one place.** Define recurring interface sections as Shared Components, choose which properties users may customize, and provide variants for approved alternatives. A team can update a common header or form section once instead of fixing copies on every screen.

- **Describe data-driven lists with Collections.** Define a row or card once and show how it repeats for a set of items rather than duplicating each entry by hand. This keeps list screens compact and makes it clear which values come from the current item.

- **Record user actions and API behavior.** Attach events to controls, order the resulting actions, connect form or current Collection item values to API requests and navigation parameters, and show the screen state for success or failure. Designers, engineers, and QA can review what a Save button or list action is expected to do from the same screen specification.

- **Create specifications that resemble the intended interface.** Add images and safe links, arrange content with vertical, horizontal, or grid layouts, and place overlays or frame-fixed elements with constrained settings. Teams can communicate realistic structure and navigation without relying on pixel-perfect free drawing.

- **Give people and AI one shared workspace.** People arrange and inspect the whole screen visually, while an AI agent uses named, typed WebMCP operations to read the same live screen and selection or propose structured changes. The proposal appears as an application change set that a person can preview and apply or discard.

## Planned enhancements

### Project files for sharing and version control

Projects currently live in browser storage, which makes them harder to move between environments, reuse in another project, or review alongside code changes.

JSON and YAML import and export will make a complete project available as a file. The application will validate imported files and preserve the information needed to continue editing.

For example, a team could export a checkout flow, commit it to Git to review the exact changes, import it on another computer, or reuse it as the starting point for a related product.

### Describe any interface behavior

The current editor provides guided choices for the components, triggers, actions, and API results it already understands. Product-specific controls or less common behavior may not fit those choices, and a screen specification should not lose important details simply because the editor does not yet provide a dedicated field.

Common cases will continue to have structured choices, reference checks, validation, and WebMCP support. When a component, trigger, action, condition, or data source has no built-in type, users will still be able to record its name, description, conditions, inputs, expected results, examples, and implementation notes. The studio will keep and display that information when the project is saved, reopened, imported, or exported instead of rejecting it as an unknown type. These entries describe intended behavior; they do not run arbitrary HTML or JavaScript.

Examples include loading data when a screen opens, searching again when a Select value changes, passing the current list row ID to an API, using a URL parameter in displayed content, going back, opening an external page, downloading a file, scrolling to a section, or showing different states for 403 and 404 responses. These are guided examples, not a limit on what teams can document.

### Review interactions without editing

The canvas is optimized for editing, so reviewing a multi-step interaction currently requires people to interpret separate states and behavior settings while taking care not to change the specification.

A separate review mode will let people follow interactions with mock data while editing controls remain unavailable. It will present the recorded path through screens, overlays, actions, and API outcomes without connecting to a real backend or running arbitrary JavaScript.

For example, a reviewer could press a Delete button, inspect the confirmation modal, and follow both the successful API result and the error result. Product, engineering, and QA teams could then discuss the same interaction without changing the blueprint.
