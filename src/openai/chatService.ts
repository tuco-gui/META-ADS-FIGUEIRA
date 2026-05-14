import { z } from "zod";
import { CONFIRMATION_PHRASE, clearPendingAction, confirmationPrompt, getPendingAction, setPendingAction } from "../confirmation/sessionStore.js";
import { env, requireEnv } from "../config/env.js";
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

const sessions = new Map<string, { previousResponseId?: string }>();

const stringIdSchema = z.object({ adSetId: z.string().min(1) });
const listAdSetsSchema = z.object({ campaignId: z.string().min(1).optional() });
const adSetInsightsSchema = z.object({
  adSetId: z.string().min(1),
  datePreset: z.string().min(1).default("last_30d")
});
const campaignInsightsSchema = z.object({
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
        message: "Alteração executada com sucesso.",
        result
      };
    }

    const state = sessions.get(sessionId) ?? {};
    const pendingNotice = pending
      ? `\n\nHá uma alteração pendente nesta sessão. Só execute se o usuário responder exatamente ${CONFIRMATION_PHRASE}.`
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

    for (let i = 0; i < 6; i += 1) {
      const calls = ((response.output ?? []) as any[]).filter(
        (item: any) => item.type === "function_call"
      );
      if (calls.length === 0) {
        sessions.set(sessionId, { previousResponseId: response.id });
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

    sessions.set(sessionId, { previousResponseId: response.id });
    return {
      sessionId,
      message:
        response.output_text ??
        "Não consegui concluir o ciclo de ferramentas dentro do limite interno.",
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

    switch (name) {
      case "getAdAccount":
        return metaAdsService.getAdAccount();
      case "listCampaigns":
        return metaAdsService.listCampaigns();
      case "listAdSets": {
        const parsed = listAdSetsSchema.parse(args);
        return metaAdsService.listAdSets(parsed.campaignId);
      }
      case "getAdSet": {
        const parsed = stringIdSchema.parse(args);
        return metaAdsService.getAdSet(parsed.adSetId);
      }
      case "getAdSetTargeting": {
        const parsed = stringIdSchema.parse(args);
        return metaAdsService.getAdSetTargeting(parsed.adSetId);
      }
      case "getAdSetInsights": {
        const parsed = adSetInsightsSchema.parse(args);
        return metaAdsService.getAdSetInsights(parsed.adSetId, parsed.datePreset);
      }
      case "getCampaignInsights": {
        const parsed = campaignInsightsSchema.parse(args);
        return metaAdsService.getCampaignInsights(parsed.campaignId, parsed.datePreset);
      }
      case "diagnoseAdSetTargeting": {
        const parsed = stringIdSchema.parse(args);
        return metaAdsService.diagnoseAdSetTargeting(parsed.adSetId);
      }
      case "lockAdSetGeoTargeting": {
        const parsed = lockGeoToolSchema.parse(args);
        const plan = await metaAdsService.planLockAdSetGeoTargeting(
          parsed.adSetId,
          parsed.location,
          context
        );
        return this.storePending(sessionId, {
          action: "lockAdSetGeoTargeting",
          args: parsed as unknown as JsonObject,
          plan,
          createdAt: new Date().toISOString()
        });
      }
      case "pauseAdSet": {
        const parsed = stringIdSchema.parse(args);
        const plan = await metaAdsService.planSimpleWrite(
          "pauseAdSet",
          parsed.adSetId,
          { status: "PAUSED" },
          context
        );
        return this.storePending(sessionId, {
          action: "pauseAdSet",
          args: parsed,
          plan,
          createdAt: new Date().toISOString()
        });
      }
      case "activateAdSet": {
        const parsed = stringIdSchema.parse(args);
        const plan = await metaAdsService.planSimpleWrite(
          "activateAdSet",
          parsed.adSetId,
          { status: "ACTIVE" },
          context
        );
        return this.storePending(sessionId, {
          action: "activateAdSet",
          args: parsed,
          plan,
          createdAt: new Date().toISOString()
        });
      }
      case "updateAdSetDailyBudget": {
        const parsed = budgetToolSchema.parse(args);
        const plan = await metaAdsService.planSimpleWrite(
          "updateAdSetDailyBudget",
          parsed.adSetId,
          { daily_budget: String(parsed.dailyBudgetInCents) },
          context
        );
        return this.storePending(sessionId, {
          action: "updateAdSetDailyBudget",
          args: parsed as unknown as JsonObject,
          plan,
          createdAt: new Date().toISOString()
        });
      }
      case "updateAdSetTargeting": {
        const parsed = targetingToolSchema.parse(args);
        const plan = await metaAdsService.planSimpleWrite(
          "updateAdSetTargeting",
          parsed.adSetId,
          { targetingPatch: parsed.targetingPatch as JsonObject },
          context
        );
        return this.storePending(sessionId, {
          action: "updateAdSetTargeting",
          args: parsed as unknown as JsonObject,
          plan,
          createdAt: new Date().toISOString()
        });
      }
      case "updateAdSetName": {
        const parsed = nameToolSchema.parse(args);
        const plan = await metaAdsService.planSimpleWrite(
          "updateAdSetName",
          parsed.adSetId,
          { name: parsed.newName },
          context
        );
        return this.storePending(sessionId, {
          action: "updateAdSetName",
          args: parsed,
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
        return metaAdsService.lockAdSetGeoTargeting(parsed.adSetId, parsed.location, context);
      }
      case "pauseAdSet": {
        const parsed = stringIdSchema.parse(pending.args);
        return metaAdsService.pauseAdSet(parsed.adSetId, context);
      }
      case "activateAdSet": {
        const parsed = stringIdSchema.parse(pending.args);
        return metaAdsService.activateAdSet(parsed.adSetId, context);
      }
      case "updateAdSetDailyBudget": {
        const parsed = budgetToolSchema.parse(pending.args);
        return metaAdsService.updateAdSetDailyBudget(
          parsed.adSetId,
          parsed.dailyBudgetInCents,
          context
        );
      }
      case "updateAdSetTargeting": {
        const parsed = targetingToolSchema.parse(pending.args);
        return metaAdsService.updateAdSetTargeting(
          parsed.adSetId,
          parsed.targetingPatch as JsonObject,
          context
        );
      }
      case "updateAdSetName": {
        const parsed = nameToolSchema.parse(pending.args);
        return metaAdsService.updateAdSetName(parsed.adSetId, parsed.newName, context);
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

const systemInstructions = `
Voce e um assistente operacional de Meta Ads para campanhas de imoveis, WhatsApp e leads.
Use ferramentas de leitura para consultar dados reais antes de responder sobre contas, campanhas, ad sets, targeting ou performance.
Ferramentas de escrita nunca executam a alteracao imediatamente: elas geram um plano, riscos e a frase de confirmacao.
Quando uma ferramenta retornar requiresConfirmation, mostre o plano de forma clara e pergunte:
"Confirma executar esta alteracao? Responda exatamente: CONFIRMO ALTERAR"
Nao diga que uma alteracao foi executada se a ferramenta informou apenas plano/confirmacao.
Se houver erro da Meta, explique em linguagem simples e inclua error_user_msg/fbtrace_id quando existirem.
`.trim();

export const chatService = new ChatService();
