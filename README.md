# JSON to Sankey

A Figma plugin that generates Sankey flow diagrams from JSON data.

## What it does

Paste a JSON structure describing nodes and weighted links, and the plugin creates a fully-rendered Sankey diagram directly on your Figma canvas — with proportional ribbons, labels, values, percentages, and chevron indicators for non-leaf nodes.

## Installation

1. In Figma, go to **Plugins → Development → Import plugin from manifest…**
2. Select the `manifest.json` file from this repository.

## Usage

1. Open the plugin from **Plugins → JSON to Sankey**.
2. Paste your JSON into the input field.
3. Click **Generate Diagram** (or press `Cmd+Enter` / `Ctrl+Enter`).

The diagram is created as a frame on the current page, centered in the viewport.

## JSON format

```json
{
  "nodes": [
    { "id": "A", "label": "Source A" },
    { "id": "B", "label": "Source B" },
    { "id": "X", "label": "Middle X" },
    { "id": "Z", "label": "End Z" }
  ],
  "links": [
    { "source": "A", "target": "X", "value": 50 },
    { "source": "B", "target": "X", "value": 20 },
    { "source": "X", "target": "Z", "value": 70 }
  ]
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `nodes` | array | yes | List of all nodes in the diagram |
| `nodes[].id` | string | yes | Unique identifier for the node |
| `nodes[].label` | string | no | Display name (falls back to `id` if omitted) |
| `links` | array | yes | List of all connections between nodes |
| `links[].source` | string | yes | `id` of the source node |
| `links[].target` | string | yes | `id` of the target node |
| `links[].value` | number | yes | Flow magnitude (determines ribbon thickness) |

### Rules

- Node `id` values must be unique.
- Every `source` and `target` in links must reference an existing node `id`.
- `value` must be a positive number.
- Cycles are not supported — the graph must be a DAG (directed acyclic graph).

## Examples

### Simple conversion funnel

```json
{
  "nodes": [
    { "id": "visitors", "label": "Visitors" },
    { "id": "signups", "label": "Sign Ups" },
    { "id": "paid", "label": "Paid Users" }
  ],
  "links": [
    { "source": "visitors", "target": "signups", "value": 100 },
    { "source": "visitors", "target": "paid", "value": 20 },
    { "source": "signups", "target": "paid", "value": 30 }
  ]
}
```

### Energy flow

```json
{
  "nodes": [
    { "id": "solar", "label": "Solar" },
    { "id": "wind", "label": "Wind" },
    { "id": "grid", "label": "Power Grid" },
    { "id": "residential", "label": "Residential" },
    { "id": "commercial", "label": "Commercial" }
  ],
  "links": [
    { "source": "solar", "target": "grid", "value": 150 },
    { "source": "wind", "target": "grid", "value": 200 },
    { "source": "grid", "target": "residential", "value": 180 },
    { "source": "grid", "target": "commercial", "value": 170 }
  ]
}
```

## Development

**Requirements:** Node.js

```bash
# Install dependencies
npm install

# Compile TypeScript once
npm run build

# Watch for changes
npm run watch
```

The plugin entry point is `code.ts`, compiled to `code.js`. The UI is defined in `ui.html`.

## Project structure

```
├── manifest.json   # Figma plugin manifest
├── code.ts         # Plugin logic (TypeScript source)
├── code.js         # Compiled plugin (loaded by Figma)
├── ui.html         # Plugin UI (HTML/CSS/JS)
├── package.json
└── tsconfig.json
```

## License

MIT
