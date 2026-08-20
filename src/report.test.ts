import test from "node:test";
import assert from "node:assert/strict";

import { buildScenarioReportMarkdown, classifyLinkType, collectScenarioLinks } from "./report.js";
import { WorkItem, WorkItemRelation } from "./types.js";

test("classifyLinkType maps common Azure DevOps relation names", () => {
  assert.equal(classifyLinkType("System.LinkTypes.Related"), "related");
  assert.equal(classifyLinkType("System.LinkTypes.Hierarchy-Forward"), "child");
  assert.equal(classifyLinkType("System.LinkTypes.Hierarchy-Reverse"), "parent");
  assert.equal(classifyLinkType("Microsoft.VSTS.Common.TestedBy-Forward"), "tested-by-forward");
});

test("collectScenarioLinks finds scenario work item relations for child epics", () => {
  const items: WorkItem[] = [
    {
      id: 101,
      title: "Epic One",
      workItemType: "Epic",
      state: "Active",
      assignedTo: "A",
      areaLevel4: "Editing and Input",
      iterationLevel2: "26-C4",
      risk: "",
      riskAssessment: "",
      parentId: 10,
      url: "https://example.test/_workitems/edit/101",
      relations: [
        { rel: "System.LinkTypes.Related", url: "https://example.test/_apis/wit/workItems/201" },
      ],
    },
    {
      id: 201,
      title: "Scenario Alpha",
      workItemType: "Scenario",
      state: "Active",
      assignedTo: "A",
      areaLevel4: "",
      iterationLevel2: "",
      risk: "",
      riskAssessment: "",
      url: "https://example.test/_workitems/edit/201",
      relations: [],
    },
    {
      id: 102,
      title: "Epic Two",
      workItemType: "Epic",
      state: "Active",
      assignedTo: "B",
      areaLevel4: "Graphics and Storage",
      areaLevel5: "Paint",
      iterationLevel2: "26-C5",
      risk: "",
      riskAssessment: "",
      parentId: 11,
      url: "https://example.test/_workitems/edit/102",
      relations: [
        { rel: "System.LinkTypes.Hierarchy-Forward", url: "https://example.test/_apis/wit/workItems/202" },
      ],
    },
    {
      id: 202,
      title: "Scenario Beta",
      workItemType: "Scenario",
      state: "Active",
      assignedTo: "B",
      areaLevel4: "",
      iterationLevel2: "",
      risk: "",
      riskAssessment: "",
      url: "https://example.test/_workitems/edit/202",
      relations: [],
    },
  ];

  assert.deepEqual(collectScenarioLinks([...items, items[0]]), [
    {
      area: "Editing and Input",
      iteration: "26-C4",
      epicId: 101,
      epicTitle: "Epic One",
      epicState: "Active",
      epicUrl: "https://example.test/_workitems/edit/101",
      scenarios: [
        { id: 201, url: "https://example.test/_workitems/edit/201", linkType: "related" },
      ],
      crBugs: [],
    },
    {
      area: "Graphics and Storage\\Paint",
      iteration: "26-C5",
      epicId: 102,
      epicTitle: "Epic Two",
      epicState: "Active",
      epicUrl: "https://example.test/_workitems/edit/102",
      scenarios: [
        { id: 202, url: "https://example.test/_workitems/edit/202", linkType: "child" },
      ],
      crBugs: [],
    },
  ]);
});

test("buildScenarioReportMarkdown renders linked IDs and multiple links on one row", () => {
  const markdown = buildScenarioReportMarkdown([
    {
      area: "Graphics and Storage\\Paint",
      iteration: "26-C4",
      epicId: 101,
      epicTitle: "Epic One",
      epicState: "Active",
      epicUrl: "https://example.test/_workitems/edit/101",
      scenarios: [
        { id: 201, url: "https://example.test/_workitems/edit/201", linkType: "related" },
        { id: 202, url: "https://example.test/_workitems/edit/202", linkType: "child" },
      ],
      crBugs: [
        { url: "https://issues.chromium.org/issues/123456", linkType: "hyperlink" },
        { url: "https://issues.chromium.org/issues/789012", linkType: "hyperlink" },
      ],
    },
  ]);

  assert.match(markdown, /\| Area \| Iteration \| Epic ID \| Epic Title \| State \| Scenario ID \| CRBug \| Link Type \|/);
  assert.match(markdown, /\| Graphics and Storage\\Paint \| 26-C4 \| \[101\]\(https:\/\/example\.test\/_workitems\/edit\/101\) \| Epic One \| Active \|/);
  assert.match(markdown, /\[201\]\(https:\/\/example\.test\/_workitems\/edit\/201\), \[202\]\(https:\/\/example\.test\/_workitems\/edit\/202\)/);
  assert.match(markdown, /\[123456\]\(https:\/\/issues\.chromium\.org\/issues\/123456\), \[789012\]\(https:\/\/issues\.chromium\.org\/issues\/789012\)/);
  assert.equal(markdown.split("\n").filter((line) => line.includes("| [101]")).length, 1);
});

test("collectScenarioLinks includes Chromium issue hyperlinks and ignores other hyperlinks", () => {
  const items: WorkItem[] = [
    {
      id: 101,
      title: "Epic One",
      workItemType: "Epic",
      state: "Active",
      assignedTo: "A",
      areaLevel4: "",
      iterationLevel2: "",
      risk: "",
      riskAssessment: "",
      url: "https://example.test/_workitems/edit/101",
      relations: [
        { rel: "Hyperlink", url: "https://issues.chromium.org/issues/123456" },
        { rel: "Hyperlink", url: "https://issues.chromium.org/issues/123456" },
        { rel: "Hyperlink", url: "https://example.com/not-a-crbug" },
      ],
    },
  ];

  assert.deepEqual(collectScenarioLinks(items), [
    {
      area: "",
      iteration: "",
      epicId: 101,
      epicTitle: "Epic One",
      epicState: "Active",
      epicUrl: "https://example.test/_workitems/edit/101",
      scenarios: [],
      crBugs: [
        { url: "https://issues.chromium.org/issues/123456", linkType: "hyperlink" },
      ],
    },
  ]);
});

test("parseScenarioIdFromRelation handles Azure DevOps vstfs URLs", () => {
  const items: WorkItem[] = [
    {
      id: 101,
      title: "Epic One",
      workItemType: "Epic",
      state: "Active",
      assignedTo: "A",
      areaLevel4: "",
      iterationLevel2: "",
      risk: "",
      riskAssessment: "",
      url: "https://example.test/_workitems/edit/101",
      relations: [{ rel: "System.LinkTypes.Related", url: "vstfs:///WorkItemTracking/WorkItem/201" }],
    },
    {
      id: 201,
      title: "Scenario Alpha",
      workItemType: "Scenario",
      state: "Active",
      assignedTo: "A",
      areaLevel4: "",
      iterationLevel2: "",
      risk: "",
      riskAssessment: "",
      url: "https://example.test/_workitems/edit/201",
      relations: [],
    },
  ];

  assert.deepEqual(collectScenarioLinks(items), [
    {
      area: "",
      iteration: "",
      epicId: 101,
      epicTitle: "Epic One",
      epicState: "Active",
      epicUrl: "https://example.test/_workitems/edit/101",
      scenarios: [
        { id: 201, url: "https://example.test/_workitems/edit/201", linkType: "related" },
      ],
      crBugs: [],
    },
  ]);
});

test("collectScenarioLinks includes Epics without a Scenario or CRBug", () => {
  const items: WorkItem[] = [
    {
      id: 101,
      title: "Epic One",
      workItemType: "Epic",
      state: "Active",
      assignedTo: "A",
      areaLevel4: "",
      iterationLevel2: "",
      risk: "",
      riskAssessment: "",
      url: "https://example.test/_workitems/edit/101",
      relations: [{ rel: "System.LinkTypes.Related", url: "https://example.test/_apis/wit/workItems/201" }],
    },
  ];

  assert.deepEqual(collectScenarioLinks(items), [
    {
      area: "",
      iteration: "",
      epicId: 101,
      epicTitle: "Epic One",
      epicState: "Active",
      epicUrl: "https://example.test/_workitems/edit/101",
      scenarios: [],
      crBugs: [],
    },
  ]);
});

test("collectScenarioLinks limits rows to selected query child Epics", () => {
  const childEpic: WorkItem = {
    id: 101,
    title: "Query Child Epic",
    workItemType: "Epic",
    state: "Active",
    assignedTo: "A",
    areaLevel4: "",
    iterationLevel2: "",
    risk: "",
    riskAssessment: "",
    parentId: 10,
    url: "https://example.test/_workitems/edit/101",
    relations: [],
  };
  const linkedEpic: WorkItem = {
    ...childEpic,
    id: 999,
    title: "Fetched Epic Outside Query",
    parentId: undefined,
    url: "https://example.test/_workitems/edit/999",
  };

  assert.deepEqual(collectScenarioLinks([childEpic, linkedEpic], undefined, new Set([101])), [
    {
      area: "",
      iteration: "",
      epicId: 101,
      epicTitle: "Query Child Epic",
      epicState: "Active",
      epicUrl: "https://example.test/_workitems/edit/101",
      scenarios: [],
      crBugs: [],
    },
  ]);
});

test("collectScenarioLinks reads the link list from the dedicated relation map", () => {
  const items: WorkItem[] = [
    {
      id: 101,
      title: "Epic One",
      workItemType: "Epic",
      state: "Active",
      assignedTo: "A",
      areaLevel4: "",
      iterationLevel2: "",
      risk: "",
      riskAssessment: "",
      url: "https://example.test/_workitems/edit/101",
      relations: [],
    },
    {
      id: 201,
      title: "Scenario Alpha",
      workItemType: "Scenario",
      state: "Active",
      assignedTo: "A",
      areaLevel4: "",
      iterationLevel2: "",
      risk: "",
      riskAssessment: "",
      url: "https://example.test/_workitems/edit/201",
      relations: [],
    },
  ];

  const relationMap = new Map<number, WorkItemRelation[]>([[101, [{ rel: "System.LinkTypes.Related", url: "https://example.test/_apis/wit/workItems/201" }]]]);

  assert.deepEqual(collectScenarioLinks(items, relationMap), [
    {
      area: "",
      iteration: "",
      epicId: 101,
      epicTitle: "Epic One",
      epicState: "Active",
      epicUrl: "https://example.test/_workitems/edit/101",
      scenarios: [
        { id: 201, url: "https://example.test/_workitems/edit/201", linkType: "related" },
      ],
      crBugs: [],
    },
  ]);
});
