export type JsonValue = unknown;
export type JsonObject = Record<string, unknown>;

export interface AuditContext {
  sessionId?: string;
  userId?: string;
}

export interface MetaPaging<T> {
  data: T[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
  };
}

export interface MetaAdSet {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  configured_status?: string;
  campaign_id?: string;
  account_id?: string;
  campaign?: {
    id?: string;
    name?: string;
    objective?: string;
    status?: string;
  };
  daily_budget?: string;
  lifetime_budget?: string;
  targeting?: JsonObject;
  [key: string]: unknown;
}

export interface LocationConfig {
  name?: string;
  key?: string;
  latitude?: number;
  longitude?: number;
  radius: number;
  distance_unit: "kilometer" | "mile";
  country?: string;
  location_types?: ("home" | "recent")[];
}

export interface PendingWriteAction {
  action:
    | "lockAdSetGeoTargeting"
    | "pauseAdSet"
    | "activateAdSet"
    | "updateAdSetDailyBudget"
    | "updateAdSetTargeting"
    | "updateAdSetName";
  args: JsonObject;
  plan: JsonObject;
  createdAt: string;
}
