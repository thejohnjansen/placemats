import test from "node:test";
import assert from "node:assert/strict";

import { buildPresentation } from "./placemat.js";
import { EpicGroup, WorkItem } from "./types.js";

function workItem(id: number, title: string, areaLevel4: string): WorkItem {
  return {
    id,
    title,
    workItemType: "Epic",
    state: "Committed",
    assignedTo: "Owner",
    areaLevel4,
    iterationLevel2: "26-C4",
    risk: "On Track",
    riskAssessment: "",
    url: `https://example.test/_workitems/edit/${id}`,
  };
}

function slideCount(presentation: ReturnType<typeof buildPresentation>): number {
  return (presentation as unknown as { _slides: unknown[] })._slides.length;
}

const groups: EpicGroup[] = [
  {
    parent: workItem(1, "Parent Epic", ""),
    children: [
      workItem(2, "DOM child", "DOM"),
      workItem(3, "Layout child", "Layout"),
    ],
  },
];

test("buildPresentation creates team-specific slides by default", () => {
  assert.equal(slideCount(buildPresentation(groups)), 2);
});

test("buildPresentation can create exactly one slide per parent", () => {
  assert.equal(
    slideCount(buildPresentation(groups, { oneSlidePerParent: true })),
    1
  );
});