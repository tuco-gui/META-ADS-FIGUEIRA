export class MetaApiError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly subcode?: number;
  readonly type?: string;
  readonly userTitle?: string;
  readonly userMessage?: string;
  readonly fbtraceId?: string;
  readonly raw: unknown;

  constructor(status: number, body: unknown) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
    const message =
      typeof error?.message === "string" ? error.message : `Meta API error (${status})`;
    super(message);
    this.name = "MetaApiError";
    this.status = status;
    this.code = typeof error?.code === "number" ? error.code : undefined;
    this.subcode = typeof error?.error_subcode === "number" ? error.error_subcode : undefined;
    this.type = typeof error?.type === "string" ? error.type : undefined;
    this.userTitle =
      typeof error?.error_user_title === "string" ? error.error_user_title : undefined;
    this.userMessage =
      typeof error?.error_user_msg === "string" ? error.error_user_msg : undefined;
    this.fbtraceId = typeof error?.fbtrace_id === "string" ? error.fbtrace_id : undefined;
    this.raw = body;
  }

  friendlyMessage(): string {
    if (this.code === 190) {
      return "O token da Meta parece estar expirado ou inválido. Renove o META_ACCESS_TOKEN e tente novamente.";
    }
    if (this.code === 200 || this.status === 403) {
      return "A Meta recusou por permissão insuficiente. Verifique ads_read/ads_management, acesso à conta de anúncios e app review.";
    }
    return this.userMessage ?? this.message;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
