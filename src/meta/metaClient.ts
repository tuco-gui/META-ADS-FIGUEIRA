import crypto from "node:crypto";
import { env, requireEnv } from "../config/env.js";
import { JsonObject, MetaPaging } from "../types.js";
import { MetaApiError } from "./metaError.js";

type HttpMethod = "GET" | "POST";

export class MetaClient {
  private get baseUrl(): string {
    return `https://graph.facebook.com/${env.META_API_VERSION}`;
  }

  get adAccountId(): string {
    return this.resolveAdAccountId();
  }

  resolveAdAccountId(adAccountId?: string): string {
    const resolved = normalizeAdAccountId(adAccountId ?? env.META_AD_ACCOUNT_ID);
    if (!resolved) {
      throw new Error(
        "Nenhuma conta de anúncios foi selecionada. Informe adAccountId na query/body ou selecione uma conta no frontend."
      );
    }
    return resolved;
  }

  async get<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
    return this.request<T>("GET", path, params);
  }

  async post<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
    return this.request<T>("POST", path, params);
  }

  async getAll<T>(path: string, params: Record<string, unknown> = {}): Promise<T[]> {
    const all: T[] = [];
    let after: string | undefined;

    for (let page = 0; page < 20; page += 1) {
      const response = await this.get<MetaPaging<T>>(path, {
        ...params,
        after
      });
      all.push(...(response.data ?? []));
      after = response.paging?.cursors?.after;
      if (!after || (response.data ?? []).length === 0) break;
    }

    return all;
  }

  async request<T>(
    method: HttpMethod,
    path: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    const token = requireEnv("META_ACCESS_TOKEN");
    const url = new URL(`${this.baseUrl}/${path.replace(/^\//, "")}`);
    const bodyParams = new URLSearchParams();
    const targetParams = method === "GET" ? url.searchParams : bodyParams;

    targetParams.set("access_token", token);
    const appSecretProof = this.buildAppSecretProof(token);
    if (appSecretProof) {
      targetParams.set("appsecret_proof", appSecretProof);
    }

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      targetParams.set(key, this.formatParam(value));
    }

    const response = await fetch(url, {
      method,
      headers:
        method === "POST"
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : undefined,
      body: method === "POST" ? bodyParams : undefined
    });

    const text = await response.text();
    const parsed = text.length > 0 ? safeJson(text) : {};
    if (!response.ok) {
      throw new MetaApiError(response.status, parsed);
    }
    return parsed as T;
  }

  private buildAppSecretProof(token: string): string | undefined {
    if (!env.META_APP_SECRET) return undefined;
    return crypto.createHmac("sha256", env.META_APP_SECRET).update(token).digest("hex");
  }

  private formatParam(value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value);
  }
}

function safeJson(text: string): JsonObject {
  try {
    return JSON.parse(text) as JsonObject;
  } catch {
    return { raw: text };
  }
}

export const metaClient = new MetaClient();

function normalizeAdAccountId(value?: string): string | undefined {
  if (!value) return undefined;
  return value.startsWith("act_") ? value : `act_${value}`;
}
