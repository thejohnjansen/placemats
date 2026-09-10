import test from "node:test";
import assert from "node:assert/strict";

import { parseArgs } from "./cliArgs.js";

const queryUrl = "https://dev.azure.com/example/project/_queries/query/query-id/";

test("parseArgs defaults report output to a Markdown file", () => {
  const parsed = parseArgs(["node", "placemat", queryUrl, "--report"]);

  assert.equal(parsed?.reportOnly, true);
  assert.equal(parsed?.out, "scenario-links.md");
});

test("parseArgs preserves an explicit report output path", () => {
  const parsed = parseArgs([
    "node",
    "placemat",
    queryUrl,
    "--report",
    "--out",
    "custom.md",
  ]);

  assert.equal(parsed?.out, "custom.md");
});

test("parseArgs rejects unknown options", () => {
  assert.throws(
    () => parseArgs(["node", "placemat", queryUrl, "--report", "--scenario-links.md"]),
    /Unknown option: --scenario-links\.md/
  );
});