import { appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { env } from "../config/env.js";
import { AuditContext, JsonValue } from "../types.js";
import { redactSecrets } from "../utils/redact.js";

export interface AuditEntry {
  timestamp?: string;
  action: string;
  adAccountId?: string;
  campaignId?: string;
  adSetId?: string;
  before?: JsonValue;
  after?: JsonValue;
  context?: AuditContext;
  result: "success" | "error" | "planned" | "blocked";
  error?: unknown;
}

export class AuditLogger {
  private readonly logPath = resolve(env.AUDIT_LOG_PATH);

  async write(entry: AuditEntry): Promise<void> {
    await mkdir(dirname(this.logPath), { recursive: true });
    const safeEntry = redactSecrets({
      timestamp: entry.timestamp ?? new Date().toISOString(),
      ...entry
    });
    await appendFile(this.logPath, `${JSON.stringify(safeEntry)}\n`, "utf8");
  }
}

export const auditLogger = new AuditLogger();
