#!/usr/bin/env node
import { parseQueryUrl } from "./queryUrl.js";
import { AdoClient, getAccessToken } from "./adoClient.js";
import { groupEpics } from "./hierarchy.js";
import { buildPresentation } from "./placemat.js";
import { buildScenarioReportMarkdown, collectScenarioLinks } from "./report.js";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "./cliArgs.js";

function printUsage(): void {
  console.log(
    [
      "Generate a placemat PowerPoint from an Azure DevOps query URL.",
      "",
      "Usage:",
      '  placemat "<ADO query URL>" [--out <file.pptx>]',
      '  placemat "<ADO query URL>" --report [--out <file.md>]',
      "",
      "Options:",
      "  -o, --out <file>   Output path (default: placemat.pptx or scenario-links.md)",
      "  --report, --md     Generate a markdown epic-to-scenario link report instead of a PPTX",
      "  --one-slide-per-parent  Combine all teams onto one slide per parent Epic",
      "  -h, --help         Show this help",
      "",
      "Authentication uses the Azure CLI. Run 'az login' first.",
    ].join("\n")
  );
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);
  if (!parsed) {
    printUsage();
    process.exit(1);
  }

  const location = parseQueryUrl(parsed.queryUrl);
  console.log(
    `Query ${location.queryId} in ${location.organization}` +
      (location.project ? `/${location.project}` : "")
  );

  console.log("Acquiring Azure DevOps access token via Azure CLI...");
  const token = await getAccessToken();
  const client = new AdoClient(location, token);

  console.log("Running query...");
  const ids = await client.runQuery();
  console.log(`Query returned ${ids.length} work item(s).`);

  if (ids.length === 0) {
    console.warn("No work items returned by the query. Nothing to generate.");
    return;
  }

  if (parsed.reportOnly) {
    console.log("Running the relationship query for each Epic...");
    const items = await client.getWorkItemsForReport(ids);
    const queryIds = new Set(ids);
    const queryItems = items.filter((item) => queryIds.has(item.id));
    const reportEpicIds = new Set(
      groupEpics(queryItems).flatMap((group) =>
        group.children.map((child) => child.id)
      )
    );
    console.log(`Found ${reportEpicIds.size} child Epic(s) for the report.`);
    for (const item of queryItems) {
      if (!reportEpicIds.has(item.id)) continue;
      const relations = item.relations ?? [];
      console.log(
        `Epic ${item.id} (${item.title}) links: ${relations.length === 0 ? "none" : relations.map((r) => `${r.rel ?? "unknown"}:${r.url ?? ""}`).join(" | ")}`
      );
    }
    const rows = collectScenarioLinks(items, undefined, reportEpicIds);
    const markdown = buildScenarioReportMarkdown(rows);
    await writeFile(parsed.out, markdown, "utf8");
    console.log(`Wrote report to ${parsed.out}`);
    return;
  }

  const items = await client.getWorkItems(ids);

  const groups = groupEpics(items);
  console.log(
    `Found ${groups.length} parent Epic(s) with child Epics.`
  );

  const pptx = buildPresentation(groups, {
    oneSlidePerParent: parsed.oneSlidePerParent,
  });
  const fileName = await pptx.writeFile({ fileName: parsed.out });
  console.log(`Wrote ${fileName}`);
}

main().catch((err) => {
  console.error("\nError:", err instanceof Error ? err.message : err);
  process.exit(1);
});
