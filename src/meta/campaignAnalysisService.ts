import { JsonObject } from "../types.js";
import { metaClient } from "./metaClient.js";

const CAMPAIGN_FIELDS = [
  "id",
  "name",
  "status",
  "effective_status",
  "configured_status",
  "objective",
  "buying_type",
  "special_ad_categories",
  "daily_budget",
  "lifetime_budget",
  "created_time",
  "updated_time"
].join(",");

const AD_SET_FIELDS = [
  "id",
  "name",
  "status",
  "effective_status",
  "configured_status",
  "account_id",
  "campaign_id",
  "daily_budget",
  "lifetime_budget",
  "targeting",
  "optimization_goal",
  "billing_event",
  "destination_type",
  "promoted_object",
  "created_time",
  "updated_time"
].join(",");

const AD_FIELDS = [
  "id",
  "name",
  "status",
  "effective_status",
  "configured_status",
  "campaign_id",
  "adset_id",
  "creative{id,name,object_story_spec,effective_object_story_id}",
  "created_time",
  "updated_time"
].join(",");

const INSIGHT_FIELDS = [
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "spend",
  "impressions",
  "reach",
  "frequency",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "actions",
  "cost_per_action_type",
  "date_start",
  "date_stop"
].join(",");

type Level = "campaign" | "adset" | "ad";

export class CampaignAnalysisService {
  async analyzeCampaign(campaignId: string, datePreset = "last_30d"): Promise<JsonObject> {
    const [campaign, campaignInsights, adSets, ads] = await Promise.all([
      metaClient.get<JsonObject>(campaignId, { fields: CAMPAIGN_FIELDS }),
      this.getInsights(campaignId, "campaign", datePreset),
      metaClient.getAll<JsonObject>(`${campaignId}/adsets`, { fields: AD_SET_FIELDS, limit: 100 }),
      metaClient.getAll<JsonObject>(`${campaignId}/ads`, { fields: AD_FIELDS, limit: 100 })
    ]);

    const [adSetInsightsRows, adInsightsRows] = await Promise.all([
      this.getInsights(campaignId, "adset", datePreset),
      this.getInsights(campaignId, "ad", datePreset)
    ]);

    const adSetInsightsById = groupById(adSetInsightsRows, "adset_id");
    const adInsightsById = groupById(adInsightsRows, "ad_id");
    const adsByAdSetId = groupItemsById(ads, "adset_id");

    const adSetsWithChildren = adSets.map((adSet) => {
      const adSetId = String(adSet.id ?? "");
      const childAds = adsByAdSetId.get(adSetId) ?? [];
      return {
        ...adSet,
        insights: adSetInsightsById.get(adSetId) ?? [],
        ads: childAds.map((ad) => {
          const adId = String(ad.id ?? "");
          return {
            ...ad,
            insights: adInsightsById.get(adId) ?? []
          };
        })
      };
    });

    const diagnostics = buildDiagnostics({
      campaign,
      campaignInsights,
      adSets: adSetsWithChildren,
      datePreset
    });

    return {
      objectType: "campaign_analysis",
      datePreset,
      campaign,
      campaignInsights,
      adSets: adSetsWithChildren,
      ads,
      totals: {
        adSetCount: adSets.length,
        activeAdSetCount: adSets.filter((item) => item.effective_status === "ACTIVE").length,
        adCount: ads.length,
        activeAdCount: ads.filter((item) => item.effective_status === "ACTIVE").length
      },
      diagnostics
    };
  }

  private async getInsights(objectId: string, level: Level, datePreset: string): Promise<JsonObject[]> {
    return metaClient.getAll<JsonObject>(`${objectId}/insights`, {
      fields: INSIGHT_FIELDS,
      level,
      date_preset: datePreset,
      limit: 500
    });
  }
}

function groupById(items: JsonObject[], key: string): Map<string, JsonObject[]> {
  const map = new Map<string, JsonObject[]>();
  for (const item of items) {
    const id = String(item[key] ?? "");
    if (!id) continue;
    const current = map.get(id) ?? [];
    current.push(item);
    map.set(id, current);
  }
  return map;
}

function groupItemsById(items: JsonObject[], key: string): Map<string, JsonObject[]> {
  return groupById(items, key);
}

function numberField(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstInsight(items: JsonObject[]): JsonObject {
  return items[0] ?? {};
}

function findActionValue(actions: unknown, names: string[]): number {
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const action of actions) {
    if (!action || typeof action !== "object") continue;
    const record = action as Record<string, unknown>;
    const type = String(record.action_type ?? "");
    if (names.includes(type)) total += numberField(record.value);
  }
  return total;
}

function summarizeMetrics(insight: JsonObject): JsonObject {
  const spend = numberField(insight.spend);
  const clicks = numberField(insight.clicks);
  const impressions = numberField(insight.impressions);
  const leads = findActionValue(insight.actions, ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "onsite_conversion.messaging_conversation_started_7d"]);
  return {
    spend,
    impressions,
    clicks,
    ctr: numberField(insight.ctr),
    cpc: numberField(insight.cpc),
    cpm: numberField(insight.cpm),
    leads,
    costPerLead: leads > 0 ? spend / leads : null
  };
}

function buildDiagnostics(input: {
  campaign: JsonObject;
  campaignInsights: JsonObject[];
  adSets: JsonObject[];
  datePreset: string;
}): JsonObject {
  const campaignMetrics = summarizeMetrics(firstInsight(input.campaignInsights));
  const adSetSummaries = input.adSets.map((adSet) => {
    const insights = Array.isArray(adSet.insights) ? adSet.insights as JsonObject[] : [];
    const ads = Array.isArray(adSet.ads) ? adSet.ads as JsonObject[] : [];
    const metrics = summarizeMetrics(firstInsight(insights));
    return {
      id: adSet.id,
      name: adSet.name,
      status: adSet.effective_status ?? adSet.status,
      budget: adSet.daily_budget ?? adSet.lifetime_budget ?? null,
      optimizationGoal: adSet.optimization_goal ?? null,
      destinationType: adSet.destination_type ?? null,
      metrics,
      ads: ads.map((ad) => ({
        id: ad.id,
        name: ad.name,
        status: ad.effective_status ?? ad.status,
        metrics: summarizeMetrics(firstInsight(Array.isArray(ad.insights) ? ad.insights as JsonObject[] : []))
      }))
    };
  });

  const activeAdSets = adSetSummaries.filter((item) => item.status === "ACTIVE");
  const warnings: string[] = [];
  const suggestions: string[] = [];

  if (activeAdSets.length === 0) {
    warnings.push("Não há conjuntos ativos nesta campanha.");
  }
  if (numberField(campaignMetrics.spend) > 0 && numberField(campaignMetrics.clicks) === 0) {
    warnings.push("A campanha tem gasto, mas não teve cliques no período analisado.");
  }
  if (numberField(campaignMetrics.spend) > 0 && campaignMetrics.costPerLead === null) {
    warnings.push("A campanha teve gasto, mas nenhum lead/conversa foi detectado nos actions retornados.");
  }
  if (activeAdSets.length === 1) {
    suggestions.push("Existe apenas um conjunto ativo; considere testar uma variação controlada de público/criativo antes de escalar orçamento.");
  }
  if (activeAdSets.length > 1) {
    suggestions.push("Compare os conjuntos pelo custo por lead e volume antes de realocar orçamento. Não pausar automaticamente sem confirmar estabilidade de dados.");
  }
  suggestions.push("Antes de qualquer alteração, valide período, orçamento, status, eventos de conversão e qualidade dos leads no WhatsApp/CRM.");

  return {
    summary: `Análise de campanha no período ${input.datePreset}: ${input.adSets.length} conjuntos e ${adSetSummaries.reduce((sum, item) => sum + (Array.isArray(item.ads) ? item.ads.length : 0), 0)} anúncios encontrados.`,
    campaignMetrics,
    adSetSummaries,
    warnings,
    suggestions,
    nextStep: "Use estas informações para escolher uma ação; alterações de orçamento, status ou targeting continuam exigindo confirmação explícita."
  };
}

export const campaignAnalysisService = new CampaignAnalysisService();
