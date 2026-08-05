import type { ClaudeEvent } from './types.js';

/**
 * Content block types that carry no information this library models, but which
 * are entirely expected in real output. Assistant messages made up only of
 * these are skipped rather than reported: with --include-partial-messages the
 * text has already been delivered as `text_delta` events, so re-emitting the
 * completed message would double it.
 */
const IGNORABLE_BLOCK_TYPES = new Set(['text', 'thinking', 'redacted_thinking']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Parses one NDJSON line of `--output-format stream-json` output.
 *
 * Returns `undefined` for lines that are recognised but carry nothing this
 * library models - the CLI emits a great deal of such plumbing (partial-message
 * bookkeeping, hook notifications, echoed user turns). Those used to be reported
 * as warnings, which meant a normal turn produced a stream of spurious warning
 * events, each carrying the full raw line. Genuinely unrecognised or malformed
 * input still produces a warning: it is never silently swallowed.
 */
export function parseEvent(line: string): ClaudeEvent | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return { type: 'warning', message: 'Received a non-JSON line from Claude Code', raw: line };
  }

  if (!isRecord(raw) || !('type' in raw)) {
    return { type: 'warning', message: 'Received a JSON line with no "type" field', raw: line };
  }

  const obj = raw;

  switch (obj.type) {
    case 'system': {
      if (obj.subtype === 'init' && typeof obj.session_id === 'string') {
        return { type: 'session_init', sessionId: obj.session_id };
      }
      // The CLI has many system subtypes (hook_started, api_retry,
      // compact_boundary, background_tasks, ...). Only the ones that report a
      // problem are worth surfacing; the rest are routine chatter.
      const subtype = typeof obj.subtype === 'string' ? obj.subtype : undefined;
      if (subtype && /error|fail|denied/i.test(subtype)) {
        return {
          type: 'warning',
          message: `Claude Code reported a problem (system/${subtype})`,
          raw: line,
        };
      }
      return undefined;
    }

    case 'stream_event': {
      const event = isRecord(obj.event) ? obj.event : undefined;
      const delta = isRecord(event?.delta) ? event.delta : undefined;
      if (
        event?.type === 'content_block_delta' &&
        delta?.type === 'text_delta' &&
        typeof delta.text === 'string'
      ) {
        return { type: 'text_delta', text: delta.text };
      }
      // message_start/stop, content_block_start/stop, input_json_delta,
      // thinking_delta and friends: expected partial-message plumbing.
      return undefined;
    }

    case 'assistant': {
      const message = isRecord(obj.message) ? obj.message : undefined;
      const content = message?.content;
      if (!Array.isArray(content)) {
        return { type: 'warning', message: 'Unrecognized assistant message shape', raw: line };
      }

      const toolUse = content.find((block) => isRecord(block) && block.type === 'tool_use');
      if (isRecord(toolUse) && typeof toolUse.id === 'string' && typeof toolUse.name === 'string') {
        return {
          type: 'tool_use',
          toolUseId: toolUse.id,
          toolName: toolUse.name,
          input: toolUse.input,
        };
      }

      if (
        content.length > 0 &&
        content.every(
          (block) => isRecord(block) && typeof block.type === 'string' && IGNORABLE_BLOCK_TYPES.has(block.type)
        )
      ) {
        return undefined;
      }

      return { type: 'warning', message: 'Unrecognized assistant message shape', raw: line };
    }

    case 'user': {
      const message = isRecord(obj.message) ? obj.message : undefined;
      const content = message?.content;
      if (!Array.isArray(content)) {
        return { type: 'warning', message: 'Unrecognized user message shape', raw: line };
      }

      const toolResult = content.find((block) => isRecord(block) && block.type === 'tool_result');
      if (isRecord(toolResult) && typeof toolResult.tool_use_id === 'string') {
        return {
          type: 'tool_result',
          toolUseId: toolResult.tool_use_id,
          content: String(toolResult.content ?? ''),
          isError: Boolean(toolResult.is_error),
        };
      }

      // The CLI echoes the user's own turn back; nothing to report.
      if (
        content.length > 0 &&
        content.every(
          (block) => isRecord(block) && typeof block.type === 'string' && IGNORABLE_BLOCK_TYPES.has(block.type)
        )
      ) {
        return undefined;
      }

      return { type: 'warning', message: 'Unrecognized user message shape', raw: line };
    }

    case 'result': {
      if (typeof obj.session_id === 'string' && typeof obj.total_cost_usd === 'number') {
        const subtype = typeof obj.subtype === 'string' ? obj.subtype : undefined;
        // An errored turn is reported with the same shape as a successful one -
        // it still carries a session id and a cost - so `is_error` and a
        // non-"success" subtype are the only things that distinguish it.
        const isError = obj.is_error === true || (subtype !== undefined && subtype !== 'success');
        return {
          type: 'result',
          sessionId: obj.session_id,
          costUsd: obj.total_cost_usd,
          text: typeof obj.result === 'string' ? obj.result : '',
          isError,
          ...(subtype === undefined ? {} : { subtype }),
        };
      }
      return { type: 'warning', message: 'Unrecognized result message shape', raw: line };
    }

    default:
      return { type: 'warning', message: `Unrecognized event type "${String(obj.type)}"`, raw: line };
  }
}
