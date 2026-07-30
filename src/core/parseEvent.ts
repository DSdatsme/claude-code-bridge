import type { ClaudeEvent } from './types.js';

export function parseEvent(line: string): ClaudeEvent {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return { type: 'warning', message: 'Received a non-JSON line from Claude Code', raw: line };
  }

  if (typeof raw !== 'object' || raw === null || !('type' in raw)) {
    return { type: 'warning', message: 'Received a JSON line with no "type" field', raw: line };
  }

  const obj = raw as Record<string, unknown>;

  switch (obj.type) {
    case 'system': {
      if (obj.subtype === 'init' && typeof obj.session_id === 'string') {
        return { type: 'session_init', sessionId: obj.session_id };
      }
      return { type: 'warning', message: 'Unrecognized system message shape', raw: line };
    }

    case 'stream_event': {
      const event = obj.event as Record<string, unknown> | undefined;
      const delta = event?.delta as Record<string, unknown> | undefined;
      if (
        event?.type === 'content_block_delta' &&
        delta?.type === 'text_delta' &&
        typeof delta.text === 'string'
      ) {
        return { type: 'text_delta', text: delta.text };
      }
      return { type: 'warning', message: 'Unrecognized stream_event shape', raw: line };
    }

    case 'assistant': {
      const message = obj.message as Record<string, unknown> | undefined;
      const content = message?.content as Array<Record<string, unknown>> | undefined;
      const toolUse = content?.find((block) => block.type === 'tool_use');
      if (toolUse && typeof toolUse.id === 'string' && typeof toolUse.name === 'string') {
        return {
          type: 'tool_use',
          toolUseId: toolUse.id,
          toolName: toolUse.name,
          input: toolUse.input,
        };
      }
      return { type: 'warning', message: 'Unrecognized assistant message shape', raw: line };
    }

    case 'user': {
      const message = obj.message as Record<string, unknown> | undefined;
      const content = message?.content as Array<Record<string, unknown>> | undefined;
      const toolResult = content?.find((block) => block.type === 'tool_result');
      if (toolResult && typeof toolResult.tool_use_id === 'string') {
        return {
          type: 'tool_result',
          toolUseId: toolResult.tool_use_id,
          content: String(toolResult.content ?? ''),
          isError: Boolean(toolResult.is_error),
        };
      }
      return { type: 'warning', message: 'Unrecognized user message shape', raw: line };
    }

    case 'result': {
      if (typeof obj.session_id === 'string' && typeof obj.total_cost_usd === 'number') {
        return {
          type: 'result',
          sessionId: obj.session_id,
          costUsd: obj.total_cost_usd,
          text: typeof obj.result === 'string' ? obj.result : '',
        };
      }
      return { type: 'warning', message: 'Unrecognized result message shape', raw: line };
    }

    default:
      return { type: 'warning', message: `Unrecognized event type "${String(obj.type)}"`, raw: line };
  }
}
