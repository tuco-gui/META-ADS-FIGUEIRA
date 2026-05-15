import { z } from "zod";
import { CONFIRMATION_PHRASE, clearPendingAction, confirmationPrompt, getPendingAction, setPendingAction } from "../confirmation/sessionStore.js";
import { env, requireEnv } from "../config/env.js";
import { campaignAnalysisService } from "../meta/campaignAnalysisService.js";
import { metaAdsService } from "../meta/metaAdsService.js";
import { locationConfigSchema } from "../meta/schemas.js";
import { JsonObject, PendingWriteAction } from "../types.js";
import { openAiTools } from "./toolSchemas.js";

let openAiClient: any;

async function getOpenAiClient(): Promise<any> {
  if (!openAiClient) {
    const { default: OpenAI } = await import("openai");
    openAiClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY
    });
  }
  return openAiClient;
}

const sessions = new Map<string, { previousResponseId?: string; activeAdAccountId?: string }>();

const stringIdSchema = z.object({ adSetId: z.string().min(1) });
const adAccountToolSchema = z.object({ adAccountId: z.string().min(1).optional() });
const setActiveAdAccountSchema = z.object({ adAccountId: z.string().min(1) });
const findAdAccountsSchema = z.object({ query: z.string().min(1) });
const listAdSetsSchema = z.object({
  campaignId: z.string().min(1).optional(),
  adAccountId: z.string().min(1).optional()
});
const adSetInsightsSchema = z.object({
  adSetId: z.string().min(1),
  datePreset: z.string().min(1).default("last_30d")
});
const campaignInsightsSchema = z.object({
  campaignId: z.string().min(1),
  datePreset: z.string().min(1).default("last_30d")
});
const analyzeCampaignSchema = z.object({
  campaignId: z.string().min(1),
  datePreset: z.string().min(1).default("last_30d")
});
const lockGeoToolSchema = z.object({
  adSetId: z.string().min(1),
  location: locationConfigSchema
});
const budgetToolSchema = z.object({
  adSetId: z.string().min(1),
  dailyBudgetInCents: z.number().int().positive()
});
const targetingToolSchema = z.object({
  adSetId: z.string().min(1),
  targetingPatch: z.record(z.unknown())
});
const nameToolSchema = z.object({
  adSetId: z.string().min(1),
  newName: z.string().min(1).max(255)
});

export class ChatService {
  async handleMessage(message: string, sessionId = "default"): Promise<JsonObject> {
    requireEnv("OPENAI_API_KEY");
    const client = await getOpenAiClient();

    const pending = getPendingAction(sessionId);
    if (pending && message.trim() === CONFIRMATION_PHRASE) {
      const result = await this.executePending(pending, sessionId);
      clearPendingAction(sessionId);
      return {
        sessionId,
        message: "Alteracao executada com sucesso.",
        result
      };
    }

    const state = sessions.get(sessionId) ?? {};
    const pendingNotice = pending
      ? `\n\nHa uma alteracao pendente nesta sessao. So execute se o usuario responder exatamente ${CONFIRMATION_PHRASE}.`
      : "";

    let response = await client.responses.create({
      model: env.OPENAI_MODEL,
      instructions: systemInstructions + pendingNotice,
      input: [{ role: "user", content: message }],
      previous_response_id: state.previousResponseId,
      tools: openAiTools,
      parallel_tool_calls: false,
      reasoning: { effort: "low" },
      text: { verbosity: "low" }
    } as any);

    for (let i = 0; i < 8; i += 1) {
      const calls = ((response.output ?? []) as any[]).filter(
        (item: any) => item.type === "function_call"
      );
      if (calls.length === 0) {
        sessions.set(sessionId, { ...(sessions.get(sessionId) ?? state), previousResponseId: response.id });
        return {
          sessionId,
          message: response.output_text ?? "",
          responseId: response.id
        };
      }

      const toolOutputs = [];
      for (const call of calls) {
        const output = await this.handleToolCall(call.name, call.arguments, sessionId);
        toolOutputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(output)
        });
      }

      response = await client.responses.create({
        model: env.OPENAI_MODEL,
        instructions: systemInstructions + pendingNotice,
        previous_response_id: response.id,
        input: toolOutputs,
        tools: openAiTools,
        parallel_tool_calls: false,
        reasoning: { effort: "low" },
        text: { verbosity: "low" }
      } as any);
    }

    sessions.set(sessionId, { ...(sessions.get(sessionId) ?? state), previousResponseId: response.id });
    return {
      sessionId,
      message:
        response.output_text ??
        "Nao consegui concluir o ciclo de ferramentas dentro do limite interno.",
      responseId: response.id
    };
  }

  private async handleToolCall(
    name: string,
    rawArguments: string,
    sessionId: string
  ): Promise<unknown> {
    const args = parseArguments(rawArguments);
    const context = { sessionId };
    const state = sessions.get(sessionId) ?? {};

    switch (name) {
      case "listBusinesses":
        return metaAdsService.listBusinesses();
      case "listAdAccounts":
        return metaAdsService.listAdAccounts();
      case "findAdAccounts": {
        const parsed = findAdAccountsSchema.parse(args);
        const accounts = await metaAdsService.listAdAccounts();
        const matches = findAccounts(accounts, parsed.query);
        if (matches.length === 1) {
          const id = String(matches[0].id ?? "");
          sessions.set(sessionId, { ...state, activeAdAccountId: id });
          return { matches, selected: matches[0], activeAdAccountId: id };
        }
        return { matches, needsSelection: matches.length !== 1 };
      }
      case "setActiveAdAccount": {
        const parsed = setActiveAdAccountSchema.parse(args);
        sessions.set(sessionId, { ...state, activeAdAccountId: parsed.adAccountId });
        return { ok: true, activeAdAccountId: parsed.adAccountId };
      }
      case "getAdAccount":
        return metaAdsService.getAdAccount(resolveToolAdAccount(args, state.activeAdAccountId));
      case "listCampaigns":
        return metaAdsService.listCampaigns(resolveToolAdAccount(args, state.activeAdAccountId));
      case "analyzeCampaign": {
        const parsed = analyzeCampaignSchema.parse(args);
        return campaignAnalysisService.analyzeCampaign(cleanId(parsed.campaignId), parsed.datePreset);
      }
      case "listAdSets": {
        const parsed = listAdSetsSchema.parse(args);
        return metaAdsService.listAdSets(
          parsed.campaignId ? cleanId(parsed.campaignId) : undefined,
          parsed.adAccountId ?? state.activeAdAccountId
        );
      }
      case "getAdSet": {
        const parsed = stringIdSchema.parse(args);
        return metaAdsService.getAdSet(cleanId(parsed.adSetId));
      }
      case "getAdSetTargeting": {
        const parsed = stringIdSchema.parse(args);
        return metaAdsService.getAdSetTargeting(cleanId(parsed.adSetId));
      }
      case "getAdSetInsights": {
        const parsed = adSetInsightsSchema.parse(args);
        return metaAdsService.getAdSetInsights(cleanId(parsed.adSetId), parsed.datePreset);
      }
      case "getCampaignInsights": {
        const parsed = campaignInsightsSchema.parse(args);
        return metaAdsService.getCampaignInsights(cleanId(parsed.campaignId), parsed.datePreset);
      }
      case "diagnoseAdSetTargeting": {
        const parsed = stringIdSchema.parse(args);
        return metaAdsService.diagnoseAdSetTargeting(cleanId(parsed.adSetId));
      }
      case "lockAdSetGeoTargeting": {
        const parsed = lockGeoToolSchema.parse(args);
        const plan = await metaAdsService.planLockAdSetGeoTargeting(
          cleanId(parsed.adSetId),
          parsed.location,
          context
        );
        return this.storePending(sessionId, {
          action: "lockAdSetGeoTargeting",
          args: { ...(parsed as unknown as JsonObject), adSetId: cleanId(parsed.adSetId) },
          plan,
          createdAt: new Date().toISOString()
        });
      }
      case "pauseAdSet": {
        const parsed = stringIdSchema.parse(args);
        const adSetId = cleanId(parsed.adSetId);
        const plan = await metaAdsService.planSimpleWrite(
          "pauseAdSet",
          adSetId,
          { status: "PAUSED" },
          context
        );
        return this.storePending(sessionId, {
          action: "pauseAdSet",
          args: { adSetId },
          plan,
          createdAt: new Date().toISOString()
        });
      }
      case "activateAdSet": {
        const parsed = stringIdSchema.parse(args);
        const adSetId = cleanId(parsed.adSetId);
        const plan = await metaAdsService.planSimpleWrite(
          "activateAdSet",
          adSetId,
          { status: "ACTIVE" },
          context
        );
        return this.storePending(sessionId, {
          action: "activateAdSet",
          args: { adSetId },
          plan,
          createdAt: new Date().toISOString()
        });
      }
      case "updateAdSetDailyBudget": {
        const parsed = budgetToolSchema.parse(args);
        const adSetId = cleanId(parsed.adSetId);
        const plan = await metaAdsService.planSimpleWrite(
          "updateAdSetDailyBudget",
          adSetId,
          { daily_budget: String(parsed.dailyBudgetInCents) },
          context
        );
        return this.storePending(sessionId, {
          action: "updateAdSetDailyBudget",
          args: { ...(parsed as unknown as JsonObject), adSetId },
          plan,
          createdAt: new Date().toISOString()
        });
      }
      case "updateAdSetTargeting": {
        const parsed = targetingToolSchema.parse(args);
        const adSetId = cleanId(parsed.adSetId);
        const plan = await metaAdsService.planSimpleWrite(
          "updateAdSetTargeting",
          adSetId,
          { targetingPatch: parsed.targetingPatch as JsonObject },
          context
        );
        return this.storePending(sessionId, {
          action: "updateAdSetTargeting",
          args: { ...(parsed as unknown as JsonObject), adSetId },
          plan,
          createdAt: new Date().toISOString()
        });
      }
      case "updateAdSetName": {
        const parsed = nameToolSchema.parse(args);
        const adSetId = cleanId(parsed.adSetId);
        const plan = await metaAdsService.planSimpleWrite(
          "updateAdSetName",
          adSetId,
          { name: parsed.newName },
          context
        );
        return this.storePending(sessionId, {
          action: "updateAdSetName",
          args: { ...parsed, adSetId },
          plan,
          createdAt: new Date().toISOString()
        });
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  private storePending(sessionId: string, pending: PendingWriteAction): JsonObject {
    setPendingAction(sessionId, pending);
    return confirmationPrompt(pending.plan);
  }

  private async executePending(
    pending: PendingWriteAction,
    sessionId: string
  ): Promise<unknown> {
    const context = { sessionId };
    switch (pending.action) {
      case "lockAdSetGeoTargeting": {
        const parsed = lockGeoToolSchema.parse(pending.args);
        return metaAdsService.lockAdSetGeoTargeting(cleanId(parsed.adSetId), parsed.location, context);
      }
      case "pauseAdSet": {
        const parsed = stringIdSchema.parse(pending.args);
        return metaAdsService.pauseAdSet(cleanId(parsed.adSetId), context);
      }
      case "activateAdSet": {
        const parsed = stringIdSchema.parse(pending.args);
        return metaAdsService.activateAdSet(cleanId(parsed.adSetId), context);
      }
      case "updateAdSetDailyBudget": {
        const parsed = budgetToolSchema.parse(pending.args);
        return metaAdsService.updateAdSetDailyBudget(
          cleanId(parsed.adSetId),
          parsed.dailyBudgetInCents,
          context
        );
      }
      case "updateAdSetTargeting": {
        const parsed = targetingToolSchema.parse(pending.args);
        return metaAdsService.updateAdSetTargeting(
          cleanId(parsed.adSetId),
          parsed.targetingPatch as JsonObject,
          context
        );
      }
      case "updateAdSetName": {
        const parsed = nameToolSchema.parse(pending.args);
        return metaAdsService.updateAdSetName(cleanId(parsed.adSetId), parsed.newName, context);
      }
    }
  }
}

function parseArguments(rawArguments: string): unknown {
  try {
    return rawArguments ? JSON.parse(rawArguments) : {};
  } catch {
    return {};
  }
}

function resolveToolAdAccount(args: unknown, activeAdAccountId?: string): string | undefined {
  const parsed = adAccountToolSchema.parse(args);
  return parsed.adAccountId ?? activeAdAccountId;
}

function cleanId(value: string): string {
  const text = value.trim();
  const colonIndex = text.indexOf(":");
  return colonIndex >= 0 ? text.slice(colonIndex + 1).trim() : text;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function findAccounts(accounts: JsonObject[], query: string): JsonObject[] {
  const normalizedQuery = normalizeText(query).replace(/[^a-z0-9]+/g, " ").trim();
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  return accounts
    .map((account) => {
      const haystack = normalizeText(`${account.name ?? ""} ${account.id ?? ""} ${account.account_id ?? ""}`);
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { account, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((item) => item.account);
}

const systemInstructions = `
Voce e um operador de Meta Ads em formato chat para campanhas de imoveis, WhatsApp e leads.
A interface principal e conversa: o usuario pode dizer a conta pelo nome, pedir campanhas ativas, analisar uma campanha, analisar todas as campanhas ou pedir recomendacoes.
Sempre use ferramentas de leitura para consultar dados reais antes de responder sobre contas, campanhas, conjuntos, anuncios, targeting ou performance.
Se o usuario citar nome de conta, use findAdAccounts. Se houver uma unica correspondencia, use essa conta como ativa. Se houver varias, mostre as opcoes e peca para escolher.
Se o usuario pedir campanhas da conta ativa, use listCampaigns.
Se o usuario informar ID de campanha ou pedir analise de campanha, use analyzeCampaign, nao use ferramentas de targeting de ad set.
Na analise, responda como gestor de trafego: o que esta bom, o que esta ruim, riscos, hipoteses, proximos testes e acoes recomendadas. Separe leitura/diagnostico de execucao.
Ferramentas de escrita nunca executam a alteracao imediatamente: elas geram um plano, riscos e a frase de confirmacao.
Quando uma ferramenta retornar requiresConfirmation, mostre o plano de forma clara e pergunte:
"Confirma executar esta alteracao? Responda exatamente: CONFIRMO ALTERAR"
Nao diga que uma alteracao foi executada se a ferramenta informou apenas plano/confirmacao.
Se houver erro da Meta, explique em linguagem simples e inclua error_user_msg/fbtrace_id quando existirem.
`.trim();

export const chatService = new ChatService();
