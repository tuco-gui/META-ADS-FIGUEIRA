import { JsonObject, PendingWriteAction } from "../types.js";

const sessions = new Map<string, PendingWriteAction>();

export const CONFIRMATION_PHRASE = "CONFIRMO ALTERAR";

export function setPendingAction(sessionId: string, action: PendingWriteAction): void {
  sessions.set(sessionId, action);
}

export function getPendingAction(sessionId: string): PendingWriteAction | undefined {
  return sessions.get(sessionId);
}

export function clearPendingAction(sessionId: string): void {
  sessions.delete(sessionId);
}

export function confirmationPrompt(plan: JsonObject): JsonObject {
  return {
    requiresConfirmation: true,
    confirmationPhrase: CONFIRMATION_PHRASE,
    prompt: `Confirma executar esta alteração? Responda exatamente: ${CONFIRMATION_PHRASE}`,
    plan
  };
}
