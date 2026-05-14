const SECRET_KEYS = [
  "access_token",
  "META_ACCESS_TOKEN",
  "OPENAI_API_KEY",
  "app_secret",
  "META_APP_SECRET",
  "Authorization"
];

export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item)) as T;
  }

  if (value && typeof value === "object") {
    const copy: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      copy[key] = SECRET_KEYS.includes(key) ? "[REDACTED]" : redactSecrets(nestedValue);
    }
    return copy as T;
  }

  return value;
}
