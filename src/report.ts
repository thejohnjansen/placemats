import { WorkItem, WorkItemRelation } from "./types.js";

export interface ScenarioLinkReportRow {
  area: string;
  iteration: string;
  epicId: number;
  epicTitle: string;
  epicState: string;
  epicUrl: string;
  scenarios: Array<{ id: number; url: string; linkType: string }>;
  crBugs: Array<{ url: string; linkType: string }>;
}

export function classifyLinkType(rel: string | undefined): string {
  if (!rel) return "unknown";

  const normalized = rel.trim();
  const lowered = normalized.toLowerCase();

  switch (lowered) {
    case "system.linktypes.related":
      return "related";
    case "system.linktypes.hierarchy-forward":
      return "child";
    case "system.linktypes.hierarchy-reverse":
      return "parent";
    default:
      break;
  }

  if (/testedby/i.test(normalized)) {
    return /-forward$/i.test(normalized) ? "tested-by-forward" : "tested-by";
  }

  return normalized
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[_.\s]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function parseScenarioIdFromRelation(relationUrl?: string): number | undefined {
  if (!relationUrl) return undefined;

  const match = relationUrl.match(/(?:\/workItems\/|\/workitems\/|\/WorkItem\/|WorkItem\/|id=|workitem\/)(\d+)/i)
    ?? relationUrl.match(/(\d+)(?!.*\d)/);

  return match ? Number(match[1]) : undefined;
}

function isChromiumIssueHyperlink(relation: WorkItemRelation): boolean {
  if (relation.rel?.toLowerCase() !== "hyperlink" || !relation.url) {
    return false;
  }

  try {
    return new URL(relation.url).hostname.toLowerCase() === "issues.chromium.org";
  } catch {
    return false;
  }
}

export function collectScenarioLinks(
  items: WorkItem[],
  relationMap?: Map<number, WorkItemRelation[]>,
  reportEpicIds?: ReadonlySet<number>
): ScenarioLinkReportRow[] {
  const rows = new Map<number, ScenarioLinkReportRow>();
  const itemLookup = new Map(items.map((item) => [item.id, item]));

  for (const item of items) {
    const itemType = item.workItemType?.toLowerCase() ?? "";
    if (itemType !== "epic" && itemType !== "") continue;
    if (reportEpicIds && !reportEpicIds.has(item.id)) continue;

    const relations = relationMap?.get(item.id) ?? item.relations ?? [];
    const row = rows.get(item.id) ?? {
      area: [item.areaLevel4, item.areaLevel5].filter(Boolean).join("\\"),
      iteration: item.iterationLevel2,
      epicId: item.id,
      epicTitle: item.title,
      epicState: item.state,
      epicUrl: item.url,
      scenarios: [],
      crBugs: [],
    };

    for (const relation of relations) {
      const relationType = classifyLinkType(relation.rel);

      if (isChromiumIssueHyperlink(relation)) {
        if (!row.crBugs.some((crBug) => crBug.url === relation.url)) {
          row.crBugs.push({ url: relation.url!, linkType: relationType });
        }
        continue;
      }

      const scenarioId = parseScenarioIdFromRelation(relation.url);
      if (scenarioId === undefined) continue;

      const linkedItem = itemLookup.get(scenarioId);
      if (linkedItem?.workItemType.toLowerCase() !== "scenario") continue;

      const existingScenario = row.scenarios.find((scenario) => scenario.id === scenarioId);
      if (existingScenario) {
        const linkTypes = new Set(existingScenario.linkType.split(" / "));
        linkTypes.add(relationType);
        existingScenario.linkType = [...linkTypes].join(" / ");
      } else {
        row.scenarios.push({
          id: scenarioId,
          url: linkedItem.url,
          linkType: relationType,
        });
      }
    }

    row.scenarios.sort((a, b) => a.id - b.id);
    row.crBugs.sort((a, b) => a.url.localeCompare(b.url));
    rows.set(item.id, row);
  }

  return [...rows.values()].sort((a, b) => a.epicId - b.epicId);
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function crBugLabel(url: string): string {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).pop() ?? url;
  } catch {
    return url;
  }
}

export function buildScenarioReportMarkdown(rows: ScenarioLinkReportRow[]): string {
  const header = "| Area | Iteration | Epic ID | Epic Title | State | Scenario ID | CRBug | Link Type |";
  const separator = "| --- | --- | --- | --- | --- | --- | --- | --- |";

  if (rows.length === 0) {
    return [
      "# Epic Link Report",
      "",
      header,
      separator,
      "| - | - | - | - | - | - | - | - |",
      "",
      "No Epic links to Scenarios or CRBugs were found.",
    ].join("\n");
  }

  const body = rows
    .map((row) => {
      const epicId = `[${row.epicId}](${row.epicUrl})`;
      const scenarios = row.scenarios
        .map((scenario) => `[${scenario.id}](${scenario.url})`)
        .join(", ");
      const crBugs = row.crBugs
        .map((crBug) => `[${escapeTableCell(crBugLabel(crBug.url))}](${crBug.url})`)
        .join(", ");
      const linkTypes = [...row.scenarios, ...row.crBugs]
        .map((link) => link.linkType)
        .join(", ");

      return `| ${escapeTableCell(row.area)} | ${escapeTableCell(row.iteration)} | ${epicId} | ${escapeTableCell(row.epicTitle)} | ${escapeTableCell(row.epicState)} | ${scenarios} | ${crBugs} | ${linkTypes} |`;
    })
    .join("\n");

  return ["# Epic Link Report", "", header, separator, body].join("\n");
}
