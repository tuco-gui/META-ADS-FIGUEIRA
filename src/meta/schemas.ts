import { z } from "zod";

export const idParamSchema = z.object({
  adSetId: z.string().min(1)
});

export const campaignQuerySchema = z.object({
  campaignId: z.string().min(1).optional()
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
