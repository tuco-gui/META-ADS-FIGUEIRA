import { Router } from "express";
import { login, logout, me, requireAuth } from "../auth/auth.js";
import { env } from "../config/env.js";
import { chatService } from "../openai/chatService.js";
import { campaignAnalysisService } from "../meta/campaignAnalysisService.js";
import { metaAdsService } from "../meta/metaAdsService.js";
import {
  budgetBodySchema,
  adAccountQuerySchema,
  businessParamSchema,
  campaignQuerySchema,
  chatBodySchema,
  datePresetSchema,
  idParamSchema,
  lockGeoBodySchema
} from "../meta/schemas.js";
import { asyncHandler } from "./asyncHandler.js";

export const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

router.post("/auth/login", login);
router.post("/auth/logout", logout);
router.get("/auth/me", me);

router.use(requireAuth);

router.get("/config/validate", (_req, res) => {
  res.json({
    ok: true,
    openai: {
      apiKeyPresent: Boolean(env.OPENAI_API_KEY),
      model: env.OPENAI_MODEL
    },
    meta: {
      accessTokenPresent: Boolean(env.META_ACCESS_TOKEN),
      appIdPresent: Boolean(env.META_APP_ID),
      appSecretPresent: Boolean(env.META_APP_SECRET),
      defaultBusinessIdPresent: Boolean(env.META_BUSINESS_ID),
      adAccountId: maskMiddle(env.META_AD_ACCOUNT_ID),
      apiVersion: env.META_API_VERSION,
      geoFallbackWithoutAutomation: env.META_ALLOW_GEO_FALLBACK_WITHOUT_AUTOMATION
    },
    server: {
      port: env.PORT,
      corsOrigin: env.CORS_ORIGIN,
      auditLogPath: env.AUDIT_LOG_PATH,
      rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
      rateLimitMax: env.RATE_LIMIT_MAX
    }
  });
});

router.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const parsed = chatBodySchema.parse(req.body);
    const result = await chatService.handleMessage(parsed.message, parsed.sessionId);
    res.json(result);
  })
);

function maskMiddle(value?: string): string | null {
  if (!value) return null;
  if (value.length <= 10) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

router.get(
  "/meta/businesses",
  asyncHandler(async (_req, res) => {
    res.json({ data: await metaAdsService.listBusinesses() });
  })
);

router.get(
  "/meta/ad-accounts",
  asyncHandler(async (_req, res) => {
    res.json({ data: await metaAdsService.listAdAccounts() });
  })
);

router.get(
  "/meta/businesses/:businessId/ad-accounts",
  asyncHandler(async (req, res) => {
    const parsed = businessParamSchema.parse(req.params);
    res.json(await metaAdsService.listBusinessAdAccounts(parsed.businessId));
  })
);

router.get(
  "/meta/ad-account",
  asyncHandler(async (req, res) => {
    const parsed = adAccountQuerySchema.parse(req.query);
    res.json(await metaAdsService.getAdAccount(parsed.adAccountId));
  })
);

router.get(
  "/meta/campaigns",
  asyncHandler(async (req, res) => {
    const parsed = adAccountQuerySchema.parse(req.query);
    res.json({ data: await metaAdsService.listCampaigns(parsed.adAccountId) });
  })
);

router.get(
  "/meta/adsets",
  asyncHandler(async (req, res) => {
    const parsed = campaignQuerySchema.parse(req.query);
    res.json({ data: await metaAdsService.listAdSets(parsed.campaignId, parsed.adAccountId) });
  })
);

router.get(
  "/meta/campaigns/:campaignId/analyze",
  asyncHandler(async (req, res) => {
    const params = idParamSchema.parse({ adSetId: req.params.campaignId });
    const datePreset = datePresetSchema.parse(req.query.datePreset);
    res.json(await campaignAnalysisService.analyzeCampaign(params.adSetId, datePreset));
  })
);

router.get(
  "/meta/adsets/:adSetId",
  asyncHandler(async (req, res) => {
    const parsed = idParamSchema.parse(req.params);
    res.json(await metaAdsService.getAdSet(parsed.adSetId));
  })
);

router.get(
  "/meta/adsets/:adSetId/targeting",
  asyncHandler(async (req, res) => {
    const parsed = idParamSchema.parse(req.params);
    res.json(await metaAdsService.getAdSetTargeting(parsed.adSetId));
  })
);

router.get(
  "/meta/adsets/:adSetId/diagnose",
  asyncHandler(async (req, res) => {
    const parsed = idParamSchema.parse(req.params);
    res.json(await metaAdsService.diagnoseAdSetTargeting(parsed.adSetId));
  })
);

router.get(
  "/meta/adsets/:adSetId/insights",
  asyncHandler(async (req, res) => {
    const params = idParamSchema.parse(req.params);
    const datePreset = datePresetSchema.parse(req.query.datePreset);
    res.json({ data: await metaAdsService.getAdSetInsights(params.adSetId, datePreset) });
  })
);

router.get(
  "/meta/campaigns/:campaignId/insights",
  asyncHandler(async (req, res) => {
    const campaignId = String(req.params.campaignId ?? "");
    const datePreset = datePresetSchema.parse(req.query.datePreset);
    res.json({ data: await metaAdsService.getCampaignInsights(campaignId, datePreset) });
  })
);

router.post(
  "/meta/adsets/:adSetId/lock-geo",
  asyncHandler(async (req, res) => {
    const params = idParamSchema.parse(req.params);
    const body = lockGeoBodySchema.parse(req.body);
    res.json(
      await metaAdsService.lockAdSetGeoTargeting(params.adSetId, body.location, {
        sessionId: "rest"
      })
    );
  })
);

router.post(
  "/meta/adsets/:adSetId/pause",
  asyncHandler(async (req, res) => {
    const params = idParamSchema.parse(req.params);
    lockGeoBodySchema.pick({ confirmation: true }).parse(req.body);
    res.json(await metaAdsService.pauseAdSet(params.adSetId, { sessionId: "rest" }));
  })
);

router.post(
  "/meta/adsets/:adSetId/activate",
  asyncHandler(async (req, res) => {
    const params = idParamSchema.parse(req.params);
    lockGeoBodySchema.pick({ confirmation: true }).parse(req.body);
    res.json(await metaAdsService.activateAdSet(params.adSetId, { sessionId: "rest" }));
  })
);

router.post(
  "/meta/adsets/:adSetId/budget",
  asyncHandler(async (req, res) => {
    const params = idParamSchema.parse(req.params);
    const body = budgetBodySchema.parse(req.body);
    res.json(
      await metaAdsService.updateAdSetDailyBudget(
        params.adSetId,
        body.dailyBudgetInCents,
        { sessionId: "rest" }
      )
    );
  })
);
