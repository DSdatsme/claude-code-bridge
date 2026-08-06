/**
 * The header `useClaudeChat` sends its `conversationId` in, and which a route
 * handler reads to decide which `ClaudeSession` a request belongs to.
 *
 * Shared by both halves on purpose: the client hook and the server handler have
 * to agree on it, and previously the hook sent no such header at all, so the
 * documented per-conversation pattern could never work.
 */
export const CONVERSATION_ID_HEADER = 'x-conversation-id';

/** Reads the conversation id a client sent, if any. */
export function conversationIdFrom(req: Request): string | undefined {
  return req.headers.get(CONVERSATION_ID_HEADER) ?? undefined;
}
