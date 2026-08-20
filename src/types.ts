/** Parsed pieces of an Azure DevOps query URL. */
export interface QueryLocation {
  /** Base URL for REST calls, e.g. https://dev.azure.com/{org} */
  baseUrl: string;
  /** Organization name. */
  organization: string;
  /** Project name or id (may be undefined for org-scoped query URLs). */
  project?: string;
  /** The stored query id (GUID). */
  queryId: string;
  /** Host origin used to build work item web links. */
  webOrigin: string;
}

/** A relation attached to an Azure DevOps work item. */
export interface WorkItemRelation {
  rel?: string;
  url?: string;
  attributes?: {
    name?: string;
    [key: string]: unknown;
  };
}

/** A minimal representation of an Azure DevOps work item. */
export interface WorkItem {
  id: number;
  title: string;
  workItemType: string;
  state: string;
  assignedTo: string;
  /** The 4th segment of the Area Path (0-based index 3), if present. */
  areaLevel4: string;
  /** The 5th segment of the Area Path (0-based index 4), if present. */
  areaLevel5?: string;
  /** The 2nd segment of the Iteration Path (0-based index 1), if present. */
  iterationLevel2: string;
  /** Risk level from the ADO Risk Assessment field. */
  risk: string;
  /** Plain-text details from the ADO Risk Assessment Comment field. */
  riskAssessment: string;
  /** Parent work item id, if any. */
  parentId?: number;
  /** Web URL for the work item (edit view). */
  url: string;
  /** Linked work items associated with this item, when expanded. */
  relations?: WorkItemRelation[];
}

/** A parent epic together with its child epics. */
export interface EpicGroup {
  parent: WorkItem;
  children: WorkItem[];
}
