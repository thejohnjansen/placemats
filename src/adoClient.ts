import { exec } from "node:child_process";
import { promisify } from "node:util";
import { QueryLocation, WorkItem } from "./types.js";

const execAsync = promisify(exec);

/** Well-known Azure DevOps resource id used to request an AAD access token. */
const ADO_RESOURCE = "499b84ac-1321-427f-aa17-267ca6975798";

const API_VERSION = "7.1";

const FIELDS = [
  "System.Title",
  "System.WorkItemType",
  "System.State",
  "System.AssignedTo",
  "System.AreaPath",
  "System.IterationPath",
  "OSG.RiskAssessment",
  "OSG.RiskAssessmentComment",
  "System.Parent",
];

/** Fields object as returned by the work items API. */
interface RawFields {
  "System.Title"?: string;
  "System.WorkItemType"?: string;
  "System.State"?: string;
  "System.AreaPath"?: string;
  "System.IterationPath"?: string;
  "OSG.RiskAssessment"?: string;
  "OSG.RiskAssessmentComment"?: string;
  "System.Parent"?: number;
  "System.AssignedTo"?: { displayName?: string };
}

interface RawWorkItem {
  id: number;
  fields?: RawFields;
  _links?: { html?: { href?: string } };
  relations?: Array<{
    rel?: string;
    url?: string;
    attributes?: { name?: string; [key: string]: unknown };
  }>;
}

function linkedWorkItemId(url: string | undefined): number | undefined {
  if (!url) return undefined;
  const match = url.match(/(?:\/workitems\/|\/workitem\/)(\d+)(?:$|[/?#])/i);
  return match ? Number(match[1]) : undefined;
}

/** Return the segment of a tree path (Area/Iteration) at the given 0-based index (split on '/' or '\'). */
function pathSegment(path: string | undefined, index: number): string {
  if (!path) return "";
  const segments = path.split("\\").flatMap((s) => s.split("/"));
  return segments[index]?.trim() ?? "";
}

/** Strip HTML tags and collapse whitespace from a rich-text field value. */
function stripHtml(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Acquire an Azure DevOps access token via the Azure CLI. */
export async function getAccessToken(): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `az account get-access-token --resource ${ADO_RESOURCE} --query accessToken --output tsv`
    );
    const token = stdout.trim();
    if (!token) {
      throw new Error("Azure CLI returned an empty access token.");
    }
    return token;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to get an access token from the Azure CLI. ` +
        `Make sure the Azure CLI is installed and you have run "az login".\n${message}`
    );
  }
}

export class AdoClient {
  constructor(
    private readonly location: QueryLocation,
    private readonly token: string
  ) {}

  private get projectSegment(): string {
    return this.location.project
      ? `/${encodeURIComponent(this.location.project)}`
      : "";
  }

  private async get<T>(path: string): Promise<T> {
    const url = `${this.location.baseUrl}${path}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Azure DevOps request failed (${res.status} ${res.statusText}) for ${url}\n${body}`
      );
    }
    return (await res.json()) as T;
  }

  /** Run the stored query and return all referenced work item ids. */
  async runQuery(): Promise<number[]> {
    const path = `${this.projectSegment}/_apis/wit/wiql/${this.location.queryId}?api-version=${API_VERSION}`;
    const result = await this.get<{
      workItems?: { id: number }[];
      workItemRelations?: { target?: { id: number }; source?: { id: number } | null }[];
    }>(path);

    const ids = new Set<number>();
    for (const wi of result.workItems ?? []) {
      ids.add(wi.id);
    }
    for (const rel of result.workItemRelations ?? []) {
      if (rel.target?.id) ids.add(rel.target.id);
      if (rel.source?.id) ids.add(rel.source.id);
    }
    return [...ids];
  }

  /** Fetch full work item details for the given ids (batched by 200). */
  async getWorkItems(ids: number[], includeRelations = false): Promise<WorkItem[]> {
    const items: WorkItem[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200);
      const path =
        `${this.projectSegment}/_apis/wit/workitems` +
        `?ids=${batch.join(",")}` +
        `&fields=${FIELDS.map(encodeURIComponent).join(",")}` +
        `${includeRelations ? "&expand=Relations" : ""}` +
        `&api-version=${API_VERSION}`;
      const result = await this.get<{ value: RawWorkItem[] }>(path);
      for (const raw of result.value) {
        items.push(this.toWorkItem(raw));
      }
    }
    return items;
  }

  /**
   * Fetch each queried Epic's link collection, then fetch the linked work item
   * details so the report can identify which targets are Scenarios.
   */
  async getWorkItemsForReport(ids: number[]): Promise<WorkItem[]> {
    const queryItems = await this.getWorkItems(ids);
    const reportItems = new Map(queryItems.map((item) => [item.id, item]));
    const linkedIds = new Set<number>();

    const epics = queryItems.filter(
      (item) => item.workItemType.toLowerCase() === "epic"
    );
    for (const epic of epics) {
      const path = `${this.projectSegment}/_apis/wit/workitems/${epic.id}?$expand=Relations&api-version=${API_VERSION}`;
      const expanded = await this.get<RawWorkItem>(path);
      const relations = expanded.relations ?? [];
      reportItems.set(epic.id, { ...epic, relations });

      for (const relation of relations) {
        const linkedId = linkedWorkItemId(relation.url);
        if (linkedId !== undefined && !reportItems.has(linkedId)) {
          linkedIds.add(linkedId);
        }
      }
    }

    if (linkedIds.size > 0) {
      const linkedItems = await this.getWorkItems([...linkedIds]);
      for (const linkedItem of linkedItems) {
        if (!reportItems.has(linkedItem.id)) {
          reportItems.set(linkedItem.id, linkedItem);
        }
      }
    }

    return [...reportItems.values()];
  }

  private toWorkItem(raw: RawWorkItem): WorkItem {
    const f = raw.fields ?? {};
    const htmlHref = raw._links?.html?.href;
    const url =
      htmlHref ??
      `${this.location.webOrigin}/${this.location.organization}${this.projectSegment}/_workitems/edit/${raw.id}`;
    return {
      id: raw.id,
      title: f["System.Title"] ?? `Work item ${raw.id}`,
      workItemType: f["System.WorkItemType"] ?? "",
      state: f["System.State"] ?? "",
      assignedTo: f["System.AssignedTo"]?.displayName ?? "Unassigned",
      areaLevel4: pathSegment(f["System.AreaPath"], 3),
      areaLevel5: pathSegment(f["System.AreaPath"], 4),
      iterationLevel2: pathSegment(f["System.IterationPath"], 1),
      risk: (f["OSG.RiskAssessment"] ?? "").trim(),
      riskAssessment: stripHtml(f["OSG.RiskAssessmentComment"]),
      parentId: f["System.Parent"],
      url,
      relations: raw.relations,
    };
  }
}
