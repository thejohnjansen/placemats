# ADO Placemat

Generate a "placemat" Keynote presentation from an Azure DevOps (ADO) work item query.

Each slide represents a **parent Epic and team** and contains a table of its
**child Epics** for that team:

| Title (linked to the Epic) | Assigned To | State | Risk | Risk Assessment |
| -------------------------- | ----------- | ----- | ---- | --------------- |

The slide title is the parent Epic's title, so the same title can appear on
multiple team-specific slides. The Title column links to each child Epic's work
item. Slides are grouped in this team order: DOM, Layout, Editing and Input,
then Graphics and Storage. Other teams follow alphabetically. Risk cells are
color-coded green for On Track, yellow for At Risk, and red for Not On Track.

## Prerequisites

- **Node.js 18+**
- **Azure CLI** — authentication uses your `az login` session. Sign in first:
  ```powershell
  az login
  ```
- A saved Azure DevOps query. The query should return Epics that are linked to
  each other via **Parent/Child** relations (both parent and child items are Epics).

## Install

```powershell
npm install
```

## Usage

Run directly with the TypeScript runner:

```powershell
npm run placemat -- "<ADO query URL>" --out placemat.pptx
```

Or build once and run the compiled CLI:

```powershell
npm run build
node dist/index.js "<ADO query URL>" --out placemat.pptx
```

### Options

| Flag            | Description                                                       | Default         |
| --------------- | ----------------------------------------------------------------- | --------------- |
| `-o`, `--out`   | Output `.pptx` or `.md` file path                                 | `placemat.pptx` |
| `--report`, `--md` | Generate a markdown epic-to-scenario link table instead of a PPTX |                 |
| `-h`, `--help`  | Show help                                                         |                 |

### One-off scenario link report

To generate a separate markdown report that checks each child Epic for a direct
link to a Scenario and records the link type, run:

```powershell
npm run placemat -- "<ADO query URL>" --report --out scenario-links.md
```

This writes a table like:

| Epic ID | Epic Title | Scenario ID | Link Type |
| ------- | ---------- | ----------- | --------- |
| 12345   | Epic A     | 54321       | related   |
| 12346   | Epic B     | 54322       | child     |

### Query URL

Open your query in Azure DevOps and copy the full URL from the browser. Both
modern and legacy formats are supported, for example:

```
https://dev.azure.com/{org}/{project}/_queries/query/{queryId}/
https://{org}.visualstudio.com/{project}/_queries/query-edit/{queryId}
```

The tool extracts the organization, project, and query id automatically.

## How it works

1. Parses the query URL for the organization, project, and query id.
2. Gets an access token from the Azure CLI (`az account get-access-token`).
3. Runs the stored query (WIQL) to get the work item ids.
4. Fetches Title, Assigned To, State, and Parent for each item.
5. Groups items into parent Epics with their child Epics (via `System.Parent`).
6. Splits each parent's children into team-specific tables and builds the slides
  in team order. Long tables flow onto additional slides automatically,
  repeating the header row.

## Notes

- Only items with type `Epic` (or an unknown type) are included. Adjust the query
  to control which Epics appear.
- A parent Epic only gets a slide if at least one of its child Epics is returned
  by the query.
- **Risk** comes from `OSG.RiskAssessment`; **Risk Assessment** comes from the
  plain-text contents of `OSG.RiskAssessmentComment`.
