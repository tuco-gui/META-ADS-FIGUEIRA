import { z } from "zod";

const metaObjectIdSchema = z
  .string()
  .min(1)
  .transform((value) => normalizeMetaObjectId(value));

export const idParamSchema = z.object({
  adSetId: metaObjectIdSchema
});

export const campaignQuerySchema = z.object({
  campaignId: metaObjectIdSchema.optional(),
  adAccountId: z.string().min(1).optional()
});

export const adAccountQuerySchema = z.object({
  adAccountId: z.string().min(1).optional()
});

export const businessParamSchema = z.object({
  businessId: metaObjectIdSchema
});

export const datePresetSchema = z
  .string()
  .min(1)
  .default("last_30d");

export const locationConfigSchema = z.object({
  name: z.string().min(1).optional(),
  key: z.string().min(1).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radius: z.number().positive().max(80),
  distance_unit: z.enum(["kilometer", "mile"]).default("kilometer"),
  country: z.string().length(2).optional(),
  location_types: z.array(z.enum(["home", "recent"])).default(["home", "recent"])
});

export const confirmedSchema = z.object({
  confirmation: z.literal("CONFIRMO ALTERAR")
});

export const lockGeoBodySchema = confirmedSchema.extend({
  location: locationConfigSchema
});

export const budgetBodySchema = confirmedSchema.extend({
  dailyBudgetInCents: z.number().int().positive()
});

export const updateTargetingBodySchema = confirmedSchema.extend({
  targetingPatch: z.record(z.unknown())
});

export const updateNameBodySchema = confirmedSchema.extend({
  newName: z.string().min(1).max(255)
});

export const chatBodySchema = z.object({
  sessionId: z.string().min(1).max(128).optional(),
  message: z.string().min(1)
});

function normalizeMetaObjectId(value: string): string {
  const trimmed = value.trim();
  const decoded = decodeURIComponent(trimmed);
  const match = decoded.match(/^(?:ad_set_id|adset_id|campaign_id|business_id|id):(.+)$/i);
  return match ? match[1].trim() : decoded;
}
