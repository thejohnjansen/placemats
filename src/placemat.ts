import pptxgen from "pptxgenjs";
import { EpicGroup } from "./types.js";

const HEADER_FILL = "404040";
const HEADER_COLOR = "FFFFFF";
const LINK_COLOR = "000000";
const BORDER_COLOR = "000000";
const FONT_FACE = "Segoe UI";

const TEAM_ORDER = [
  "DOM",
  "Layout",
  "Editing and Input",
  "Graphics and Storage",
];

/** Colors for highlighting the State cell based on its value. */
const CUT_FILL = "F4CCCC"; // light red
const CUT_TEXT = "990000"; // dark red
const PROPOSED_FILL = "FFF2CC"; // light yellow
const PROPOSED_TEXT = "BF8F00"; // dark yellow
const RISK_RED_FILL = "F4CCCC";
const RISK_RED_TEXT = "990000";
const RISK_YELLOW_FILL = "FFF2CC";
const RISK_YELLOW_TEXT = "7F6000";
const RISK_GREEN_FILL = "D9EAD3";
const RISK_GREEN_TEXT = "274E13";

/**
 * Return background fill and text color for the State cell based on its value.
 * Falls back to no fill and black text for other states.
 */
function stateCellColors(state: string): { fill?: string; color: string } {
  switch (state.toLowerCase()) {
    case "cut":
      return { fill: CUT_FILL, color: CUT_TEXT };
    case "proposed":
      return { fill: PROPOSED_FILL, color: PROPOSED_TEXT };
    default:
      return { color: "000000" };
  }
}

function riskCellColors(risk: string): { fill?: string; color: string } {
  switch (risk.trim().toLowerCase()) {
    case "on track":
      return { fill: RISK_GREEN_FILL, color: RISK_GREEN_TEXT };
    case "at risk":
      return { fill: RISK_YELLOW_FILL, color: RISK_YELLOW_TEXT };
    case "not on track":
      return { fill: RISK_RED_FILL, color: RISK_RED_TEXT };
    default:
      return { color: "000000" };
  }
}

/**
 * Determine how many child Epic rows to show per slide based on the total count:
 * - more than 8 items  -> 6 rows per slide
 * - exactly 8 items    -> 4 rows per slide
 * - fewer than 8 items -> all on one slide
 */
function rowsPerPage(count: number): number {
  if (count > 8) return 6;
  if (count === 8) return 4;
  return count;
}

const COLUMNS = [
  "Iteration",
  "Area",
  "Title",
  "Assigned To",
  "State",
  "Risk",
  "Risk Assessment",
];
const COL_WIDTHS = [1, 1.25, 3.2, 1.8, 1.3, 0.9, 3.5];

export interface PresentationOptions {
  oneSlidePerParent?: boolean;
}

/**
 * Build a placemat presentation with team-specific slides for each parent Epic.
 */
export function buildPresentation(
  groups: EpicGroup[],
  options: PresentationOptions = {}
): pptxgen {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "ADO Placemat";
  pptx.title = "Epic Placemat";

  if (groups.length === 0) {
    const slide = pptx.addSlide();
    slide.addText("No parent Epics with child Epics were found in the query.", {
      x: 0.5,
      y: 0.5,
      w: 12.33,
      h: 1,
      fontSize: 20,
      fontFace: FONT_FACE,
      color: "000000",
    });
    return pptx;
  }

  const presentationGroups = options.oneSlidePerParent
    ? groups
    : splitGroupsByTeam(groups);

  for (const group of presentationGroups) {
    const pages = options.oneSlidePerParent
      ? [group.children]
      : chunk(group.children, rowsPerPage(group.children.length));
    // Ensure a parent with no children still produces a single (empty) slide.
    const effectivePages = pages.length > 0 ? pages : [[]];
    effectivePages.forEach((children, index) => {
      addEpicSlide(
        pptx,
        group,
        children,
        index,
        effectivePages.length,
        options.oneSlidePerParent ?? false
      );
    });
  }
  return pptx;
}

function splitGroupsByTeam(groups: EpicGroup[]): EpicGroup[] {
  const teamRanks = new Map(
    TEAM_ORDER.map((team, index) => [team.toLowerCase(), index])
  );
  const splitGroups: EpicGroup[] = [];

  for (const group of groups) {
    const childrenByTeam = new Map<string, EpicGroup["children"]>();
    for (const child of group.children) {
      const team = child.areaLevel4.trim().toLowerCase();
      const children = childrenByTeam.get(team) ?? [];
      children.push(child);
      childrenByTeam.set(team, children);
    }

    if (childrenByTeam.size === 0) {
      splitGroups.push(group);
    }
    for (const children of childrenByTeam.values()) {
      splitGroups.push({ parent: group.parent, children });
    }
  }

  return splitGroups.sort((a, b) => {
    const aTeam = a.children[0]?.areaLevel4.trim() ?? "";
    const bTeam = b.children[0]?.areaLevel4.trim() ?? "";
    const aRank = teamRanks.get(aTeam.toLowerCase()) ?? TEAM_ORDER.length;
    const bRank = teamRanks.get(bTeam.toLowerCase()) ?? TEAM_ORDER.length;
    if (aRank !== bRank) return aRank - bRank;

    const byTeam = aTeam.localeCompare(bTeam, undefined, { sensitivity: "base" });
    if (byTeam !== 0) return byTeam;

    return a.parent.title.localeCompare(b.parent.title);
  });
}

/** Split an array into consecutive chunks of at most `size` items. */
function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function addEpicSlide(
  pptx: pptxgen,
  group: EpicGroup,
  children: EpicGroup["children"],
  pageIndex: number,
  pageCount: number,
  fitOnSingleSlide: boolean
): void {
  const slide = pptx.addSlide();

  const titleSuffix = pageCount > 1 ? ` (${pageIndex + 1} of ${pageCount})` : "";

  slide.addText(
    [
      { text: `${group.parent.title}${titleSuffix}` },
    ],
    {
      x: 0.4,
      y: 0.25,
      w: 12.53,
      h: 0.8,
      fontSize: 20,
      fontFace: FONT_FACE,
      bold: true,
      color: "000000",
      valign: "middle",
    }
  );

  const headerRow: pptxgen.TableRow = COLUMNS.map((label) => ({
    text: label,
    options: {
      bold: true,
      color: HEADER_COLOR,
      fill: { color: HEADER_FILL },
      valign: "middle",
      align: "center",
    },
  }));

  const bodyRows: pptxgen.TableRow[] = children.map((child) => {
    const stateColors = stateCellColors(child.state);
    const riskColors = riskCellColors(child.risk);
    return [
      { text: child.iterationLevel2, options: { valign: "middle" } },
      { text: child.areaLevel4, options: { valign: "middle" } },
      {
        text: [
          {
            text: child.title,
            options: {
              hyperlink: { url: child.url },
              color: LINK_COLOR,
              underline: { style: "sng", color: LINK_COLOR },
            },
          },
        ],
        options: { valign: "middle" },
      },
      { text: child.assignedTo, options: { valign: "middle" } },
      {
        text: child.state,
        options: {
          valign: "middle",
          color: stateColors.color,
          ...(stateColors.fill ? { fill: { color: stateColors.fill } } : {}),
        },
      },
      {
        text: child.risk,
        options: {
          valign: "middle",
          align: "center",
          bold: true,
          color: riskColors.color,
          ...(riskColors.fill ? { fill: { color: riskColors.fill } } : {}),
        },
      },
      { text: child.riskAssessment, options: { valign: "middle" } },
    ];
  });

  const rowHeight = fitOnSingleSlide
    ? Math.min(0.5, 5.5 / Math.max(children.length + 1, 1))
    : 0.5;
  const fontSize = fitOnSingleSlide
    ? Math.max(6, Math.min(12, rowHeight * 24))
    : 12;

  slide.addTable([headerRow, ...bodyRows], {
    x: 0.2,
    y: 1.5,
    w: 12.53,
    colW: COL_WIDTHS,
    rowH: rowHeight,
    border: { type: "solid", color: BORDER_COLOR, pt: 1 },
    fontSize,
    fontFace: FONT_FACE,
    color: "000000",
    valign: "middle",
  });
}
