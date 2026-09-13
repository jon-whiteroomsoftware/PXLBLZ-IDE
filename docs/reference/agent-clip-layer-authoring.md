# Agent Clip and Layer authoring

The versioned Clip/Layer authoring vocabulary is generated from
[`bulkAuthoring.ts`](../../src/engine/showCommands/bulkAuthoring.ts). Runtime
validation, production and diagnostic MCP schemas, built-in function schemas,
and reference material therefore share one field definition.

Connected agents can read the complete generated resources at:

- `pxlblz://schemas/clip-layer-authoring/v1` for JSON Schema 2020-12;
- `pxlblz://docs/clip-layer-authoring/v1` for semantics, defaults, clearing
  rules, ownership, result details, and executable examples.

The production server introduction names both resources. Each bulk tool also
publishes its nested input shape independently because an MCP client decides
whether server instructions or resources enter model context. These resources
describe visible authoring inputs; persisted Show records continue to use the
separate Show data model and export schemas.
