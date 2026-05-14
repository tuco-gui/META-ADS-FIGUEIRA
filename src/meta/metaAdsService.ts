import { auditLogger } from "../audit/auditLogger.js";
import { env } from "../config/env.js";
import { AuditContext, JsonObject, LocationConfig, MetaAdSet } from "../types.js";
import { MetaApiError } from "./metaError.js";
import { metaClient } from "./metaClient.js";

const AD_SET_FIELDS = [
  "id",
  "name",
  "status",
  "effective_status",
  "configured_status",
  "account_id",
  "campaign_id",
  "campaign{id,name,objective,status}",
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

const INSIGHT_FIELDS = [
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
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

export class MetaAdsService {
  async listBusinesses(): Promise<JsonObject[]> {
    return metaClient.getAll<JsonObject>("me/businesses", {
      fields: "id,name,verification_status,created_time",
      limit: 100
    });
  }

  async listAdAccounts(): Promise<JsonObject[]> {
    return metaClient.getAll<JsonObject>("me/adaccounts", {
      fields: "id,account_id,name,account_status,currency,timezone_name,business,amount_spent,balance",
      limit: 100
    });
  }

  async listBusinessAdAccounts(businessId: string): Promise<JsonObject> {
    const fields = "id,account_id,name,account_status,currency,timezone_name,business,amount_spent,balance";
    const [owned, client] = await Promise.all([
      metaClient.getAll<JsonObject>(`${businessId}/owned_ad_accounts`, { fields, limit: 100 }),
      metaClient.getAll<JsonObject>(`${businessId}/client_ad_accounts`, { fields, limit: 100 })
    ]);
    return {
      owned,
      client,
      data: dedupeById([...owned, ...client])
    };
  }

  async getAdAccount(adAccountId?: string): Promise<JsonObject> {
    return metaClient.get<JsonObject>(metaClient.resolveAdAccountId(adAccountId), {
      fields: "id,name,account_status,currency,timezone_name,business,amount_spent,balance"
    });
  }

  async listCampaigns(adAccountId?: string): Promise<JsonObject[]> {
    return metaClient.getAll<JsonObject>(`${metaClient.resolveAdAccountId(adAccountId)}/campaigns`, {
      fields: CAMPAIGN_FIELDS,
      limit: 100
    });
  }

  async listAdSets(campaignId?: string, adAccountId?: string): Promise<JsonObject[]> {
    const path = campaignId ? `${campaignId}/adsets` : `${metaClient.resolveAdAccountId(adAccountId)}/adsets`;
    return metaClient.getAll<JsonObject>(path, {
      fields: AD_SET_FIELDS,
      limit: 100
    });
  }

  async getAdSet(adSetId: string): Promise<MetaAdSet> {
    return metaClient.get<MetaAdSet>(adSetId, { fields: AD_SET_FIELDS });
  }

  async getAdSetTargeting(adSetId: string): Promise<JsonObject> {
    const adSet = await this.getAdSet(adSetId);
    return (adSet.targeting ?? {}) as JsonObject;
  }

  async getAdSetInsights(adSetId: string, datePreset = "last_30d"): Promise<JsonObject[]> {
    return metaClient.getAll<JsonObject>(`${adSetId}/insights`, {
      fields: INSIGHT_FIELDS,
      date_preset: datePreset
    });
  }

  async getCampaignInsights(campaignId: string, datePreset = "last_30d"): Promise<JsonObject[]> {
    return metaClient.getAll<JsonObject>(`${campaignId}/insights`, {
      fields: INSIGHT_FIELDS,
      date_preset: datePreset
    });
  }

  async diagnoseAdSetTargeting(adSetId: string): Promise<JsonObject> {
    const adSet = await this.getAdSet(adSetId);
    const targeting = (adSet.targeting ?? {}) as JsonObject;
    const geo = readObject(targeting.geo_locations);
    const targetingAutomation = readObject(targeting.targeting_automation);
    const individualSetting = readObject(targetingAutomation.individual_setting);
    const advantageAudience = targetingAutomation.advantage_audience === 1;
    const geoSetting = individualSetting.geo;
    const geoLocked = geoSetting === 0;
    const geoExpandable = advantageAudience && !geoLocked;
    const locations = summarizeLocations(geo);
    const radius = summarizeRadius(geo);
    const risks: string[] = [];

    if (advantageAudience && geoExpandable) {
      risks.push("Advantage Audience está ativo e a geolocalização não aparece travada em individual_setting.geo.");
    }
    if (!geo.location_types) {
      risks.push("location_types não está explícito; a Meta pode aplicar comportamento padrão da conta/objetivo.");
    }
    if (Array.isArray(geo.location_types) && geo.location_types.includes("recent")) {
      risks.push("location_types inclui recent; pessoas recentemente na região podem ser alcançadas.");
    }
    if (Object.keys(geo).length === 0) {
      risks.push("Nenhuma geo_locations foi encontrada no targeting retornado pela API.");
    }

    const diagnostic = buildDiagnosticText({
      adSet,
      locations,
      radius,
      locationTypes: geo.location_types,
      advantageAudience,
      geoLocked,
      geoExpandable
    });

    return {
      adSetName: adSet.name,
      adSetId: adSet.id,
      status: adSet.effective_status ?? adSet.status,
      campaign: adSet.campaign ?? { id: adSet.campaign_id },
      locations,
      radius,
      location_types: geo.location_types ?? null,
      targeting_automation: targetingAutomation,
      advantageAudienceActive: advantageAudience,
      geoLocked,
      geoExpandable,
      diagnostic,
      risks,
      recommendation: geoExpandable
        ? "Trave a expansão geográfica com targeting_automation.individual_setting.geo = 0, preservando Advantage Audience para outros sinais se ele já estiver ativo."
        : "A geolocalização parece travada ou sem expansão explícita. Ainda assim, valide os leads reais por localização e mantenha auditoria após alterações.",
      rawTargeting: targeting
    };
  }

  async planLockAdSetGeoTargeting(
    adSetId: string,
    location: LocationConfig,
    context: AuditContext = {}
  ): Promise<JsonObject> {
    const adSet = await this.getAdSet(adSetId);
    const beforeTargeting = (adSet.targeting ?? {}) as JsonObject;
    const nextTargeting = await this.buildLockedGeoTargeting(beforeTargeting, location);
    const plan = {
      action: "lockAdSetGeoTargeting",
      adSet: {
        id: adSet.id,
        name: adSet.name,
        status: adSet.effective_status ?? adSet.status,
        campaign: adSet.campaign ?? { id: adSet.campaign_id }
      },
      current: {
        geo_locations: beforeTargeting.geo_locations ?? null,
        targeting_automation: beforeTargeting.targeting_automation ?? null
      },
      next: {
        geo_locations: nextTargeting.geo_locations ?? null,
        targeting_automation: nextTargeting.targeting_automation ?? null
      },
      risks: [
        "A Meta pode recusar targeting_automation.individual_setting.geo se a versão/objetivo da campanha não aceitar esse controle.",
        "Editar targeting substitui o objeto targeting completo; este app preserva os demais campos retornados antes da alteração."
      ],
      confirmationRequired: "CONFIRMO ALTERAR"
    };

    await auditLogger.write({
      action: "planLockAdSetGeoTargeting",
      adAccountId: getAuditAdAccountId(adSet),
      campaignId: adSet.campaign_id,
      adSetId,
      before: beforeTargeting,
      after: nextTargeting,
      context,
      result: "planned"
    });

    return plan;
  }

  async lockAdSetGeoTargeting(
    adSetId: string,
    location: LocationConfig,
    context: AuditContext = {}
  ): Promise<JsonObject> {
    const adSet = await this.getAdSet(adSetId);
    const beforeTargeting = (adSet.targeting ?? {}) as JsonObject;
    const nextTargeting = await this.buildLockedGeoTargeting(beforeTargeting, location);
    const before = { adSet, targeting: beforeTargeting };

    try {
      await this.validateTargetingUpdate(adSetId, nextTargeting);
      await this.updateAdSet(adSetId, { targeting: nextTargeting });
      const after = await this.getAdSet(adSetId);
      await auditLogger.write({
        action: "lockAdSetGeoTargeting",
        adAccountId: getAuditAdAccountId(adSet),
        campaignId: adSet.campaign_id,
        adSetId,
        before,
        after,
        context,
        result: "success"
      });
      return { before, after };
    } catch (error) {
      const canTryGeoOnly =
        env.META_ALLOW_GEO_FALLBACK_WITHOUT_AUTOMATION &&
        isTargetingAutomationRejection(error);

      if (canTryGeoOnly) {
        const fallbackTargeting = removeGeoAutomation(nextTargeting);
        await this.validateTargetingUpdate(adSetId, fallbackTargeting);
        await this.updateAdSet(adSetId, { targeting: fallbackTargeting });
        const after = await this.getAdSet(adSetId);
        await auditLogger.write({
          action: "lockAdSetGeoTargetingFallbackGeoOnly",
          adAccountId: getAuditAdAccountId(adSet),
          campaignId: adSet.campaign_id,
          adSetId,
          before,
          after,
          context,
          result: "success"
        });
        return {
          before,
          after,
          warning:
            "Fallback aplicado: a Meta recusou targeting_automation.individual_setting.geo; somente geo_locations/location_types foi atualizado."
        };
      }

      await auditLogger.write({
        action: "lockAdSetGeoTargeting",
        adAccountId: getAuditAdAccountId(adSet),
        campaignId: adSet.campaign_id,
        adSetId,
        before,
        after: nextTargeting,
        context,
        result: "error",
        error
      });
      throw error;
    }
  }

  async pauseAdSet(adSetId: string, context: AuditContext = {}): Promise<JsonObject> {
    return this.updateAdSetWithAudit("pauseAdSet", adSetId, { status: "PAUSED" }, context);
  }

  async activateAdSet(adSetId: string, context: AuditContext = {}): Promise<JsonObject> {
    return this.updateAdSetWithAudit("activateAdSet", adSetId, { status: "ACTIVE" }, context);
  }

  async updateAdSetDailyBudget(
    adSetId: string,
    dailyBudgetInCents: number,
    context: AuditContext = {}
  ): Promise<JsonObject> {
    return this.updateAdSetWithAudit(
      "updateAdSetDailyBudget",
      adSetId,
      { daily_budget: String(dailyBudgetInCents) },
      context
    );
  }

  async updateAdSetTargeting(
    adSetId: string,
    targetingPatch: JsonObject,
    context: AuditContext = {}
  ): Promise<JsonObject> {
    const adSet = await this.getAdSet(adSetId);
    const beforeTargeting = (adSet.targeting ?? {}) as JsonObject;
    const nextTargeting = deepMerge(beforeTargeting, targetingPatch);
    await this.validateTargetingUpdate(adSetId, nextTargeting);
    return this.updateAdSetWithAudit(
      "updateAdSetTargeting",
      adSetId,
      { targeting: nextTargeting },
      context,
      { adSet, targeting: beforeTargeting }
    );
  }

  async updateAdSetName(
    adSetId: string,
    newName: string,
    context: AuditContext = {}
  ): Promise<JsonObject> {
    return this.updateAdSetWithAudit("updateAdSetName", adSetId, { name: newName }, context);
  }

  async planSimpleWrite(
    action: string,
    adSetId: string,
    next: JsonObject,
    context: AuditContext = {}
  ): Promise<JsonObject> {
    const adSet = await this.getAdSet(adSetId);
    const plan = {
      action,
      adSet: {
        id: adSet.id,
        name: adSet.name,
        status: adSet.effective_status ?? adSet.status,
        campaign: adSet.campaign ?? { id: adSet.campaign_id }
      },
      current: summarizeAdSetForPlan(adSet),
      next,
      risks: ["Esta ação altera um conjunto de anúncios real na Meta."],
      confirmationRequired: "CONFIRMO ALTERAR"
    };
    await auditLogger.write({
      action: `plan:${action}`,
      adAccountId: getAuditAdAccountId(adSet),
      campaignId: adSet.campaign_id,
      adSetId,
      before: summarizeAdSetForPlan(adSet),
      after: next,
      context,
      result: "planned"
    });
    return plan;
  }

  private async buildLockedGeoTargeting(
    beforeTargeting: JsonObject,
    location: LocationConfig
  ): Promise<JsonObject> {
    const geoLocations = await this.buildGeoLocations(location);
    const currentAutomation = readObject(beforeTargeting.targeting_automation);
    const currentIndividual = readObject(currentAutomation.individual_setting);
    const nextAutomation: JsonObject = {
      ...currentAutomation,
      individual_setting: {
        ...currentIndividual,
        geo: 0
      }
    };

    if (currentAutomation.advantage_audience === 1 || currentAutomation.advantage_audience === 0) {
      nextAutomation.advantage_audience = currentAutomation.advantage_audience;
    }

    return {
      ...beforeTargeting,
      geo_locations: geoLocations,
      targeting_automation: nextAutomation
    };
  }

  private async buildGeoLocations(location: LocationConfig): Promise<JsonObject> {
    const locationTypes = location.location_types ?? ["home", "recent"];
    if (location.key) {
      return {
        cities: [
          {
            key: location.key,
            radius: location.radius,
            distance_unit: location.distance_unit
          }
        ],
        location_types: locationTypes
      };
    }

    if (location.name) {
      const found = await this.findCity(location.name, location.country);
      if (found?.key) {
        return {
          cities: [
            {
              key: found.key,
              radius: location.radius,
              distance_unit: location.distance_unit
            }
          ],
          location_types: locationTypes
        };
      }
    }

    if (typeof location.latitude === "number" && typeof location.longitude === "number") {
      return {
        custom_locations: [
          {
            latitude: location.latitude,
            longitude: location.longitude,
            radius: location.radius,
            distance_unit: location.distance_unit
          }
        ],
        location_types: locationTypes
      };
    }

    throw new Error(
      "Não foi possível resolver a localização. Informe location.key da Meta ou latitude/longitude."
    );
  }

  private async findCity(
    name: string,
    country?: string
  ): Promise<{ key?: string; name?: string } | undefined> {
    const result = await metaClient.get<{ data?: { key?: string; name?: string }[] }>("search", {
      type: "adgeolocation",
      location_types: ["city"],
      q: name,
      country_code: country,
      limit: 10
    });
    return result.data?.[0];
  }

  private async validateTargetingUpdate(adSetId: string, targeting: JsonObject): Promise<void> {
    await this.updateAdSet(adSetId, {
      targeting,
      execution_options: ["validate_only"]
    });
  }

  private async updateAdSetWithAudit(
    action: string,
    adSetId: string,
    params: JsonObject,
    context: AuditContext,
    knownBefore?: JsonObject
  ): Promise<JsonObject> {
    const before = knownBefore ?? (await this.getAdSet(adSetId));
    try {
      await this.updateAdSet(adSetId, params);
      const after = await this.getAdSet(adSetId);
      await auditLogger.write({
        action,
        adAccountId: getAuditAdAccountId(after),
        campaignId: typeof after.campaign_id === "string" ? after.campaign_id : undefined,
        adSetId,
        before,
        after,
        context,
        result: "success"
      });
      return { before, after };
    } catch (error) {
      await auditLogger.write({
        action,
        adAccountId: getAuditAdAccountId(before),
        campaignId:
          typeof before.campaign_id === "string" ? (before.campaign_id as string) : undefined,
        adSetId,
        before,
        after: params,
        context,
        result: "error",
        error
      });
      throw error;
    }
  }

  private async updateAdSet(adSetId: string, params: JsonObject): Promise<JsonObject> {
    return metaClient.post<JsonObject>(adSetId, params);
  }
}

function readObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function dedupeById(items: JsonObject[]): JsonObject[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = typeof item.id === "string" ? item.id : "";
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function getAuditAdAccountId(value: JsonObject | MetaAdSet): string | undefined {
  if (typeof value.account_id === "string") {
    return value.account_id.startsWith("act_") ? value.account_id : `act_${value.account_id}`;
  }
  if (env.META_AD_ACCOUNT_ID) return env.META_AD_ACCOUNT_ID;
  return undefined;
}

function summarizeLocations(geo: JsonObject): JsonObject {
  return {
    countries: geo.countries ?? null,
    regions: geo.regions ?? null,
    cities: geo.cities ?? null,
    custom_locations: geo.custom_locations ?? null,
    zips: geo.zips ?? null,
    location_types: geo.location_types ?? null
  };
}

function summarizeRadius(geo: JsonObject): JsonObject | null {
  const cities = Array.isArray(geo.cities) ? geo.cities : [];
  const customLocations = Array.isArray(geo.custom_locations) ? geo.custom_locations : [];
  const first = [...cities, ...customLocations].find(
    (item) => item && typeof item === "object" && "radius" in item
  );
  return first && typeof first === "object"
    ? {
        radius: (first as Record<string, unknown>).radius ?? null,
        distance_unit: (first as Record<string, unknown>).distance_unit ?? null
      }
    : null;
}

function buildDiagnosticText(input: {
  adSet: MetaAdSet;
  locations: JsonObject;
  radius: JsonObject | null;
  locationTypes: unknown;
  advantageAudience: boolean;
  geoLocked: boolean;
  geoExpandable: boolean;
}): string {
  const locationSummary = JSON.stringify(input.locations);
  const radiusSummary = input.radius ? `${input.radius.radius} ${input.radius.distance_unit}` : "sem raio explícito";

  if (input.geoExpandable) {
    return `Este conjunto está com ${locationSummary} e ${radiusSummary} configurado, porém Advantage Audience está ativo e a automação de geolocalização não aparece travada. Isso pode permitir expansão além da localização desejada. Recomenda-se travar a expansão geográfica mantendo Advantage ativo para demais sinais, se esse era o comportamento atual.`;
  }

  if (input.advantageAudience && input.geoLocked) {
    return `Este conjunto está com Advantage Audience ativo, mas a geolocalização aparece travada por individual_setting.geo = 0. A configuração tende a preservar a área definida enquanto mantém automação em outros sinais.`;
  }

  return `Este conjunto não mostra Advantage Audience ativo no targeting_automation retornado, ou a API não expôs esse campo. Revise location_types e delivery por região antes de alterar.`;
}

function removeGeoAutomation(targeting: JsonObject): JsonObject {
  const clone = deepMerge({} as JsonObject, targeting);
  const automation = readObject(clone.targeting_automation);
  const individual = readObject(automation.individual_setting);
  delete individual.geo;
  if (Object.keys(individual).length === 0) {
    delete automation.individual_setting;
  } else {
    automation.individual_setting = individual;
  }
  if (Object.keys(automation).length === 0) {
    delete clone.targeting_automation;
  } else {
    clone.targeting_automation = automation;
  }
  return clone;
}

function isTargetingAutomationRejection(error: unknown): boolean {
  if (!(error instanceof MetaApiError)) return false;
  const raw = JSON.stringify(error.raw).toLowerCase();
  return (
    raw.includes("targeting_automation") ||
    raw.includes("individual_setting") ||
    raw.includes("geo")
  );
}

function summarizeAdSetForPlan(adSet: MetaAdSet): JsonObject {
  return {
    id: adSet.id,
    name: adSet.name,
    status: adSet.status,
    effective_status: adSet.effective_status,
    daily_budget: adSet.daily_budget,
    targeting: adSet.targeting ?? null
  };
}

function deepMerge<T extends JsonObject>(base: T, patch: JsonObject): T {
  const output: JsonObject = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = deepMerge(output[key] as JsonObject, value as JsonObject);
    } else {
      output[key] = value as JsonObject[string];
    }
  }
  return output as T;
}

function isPlainObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export const metaAdsService = new MetaAdsService();
