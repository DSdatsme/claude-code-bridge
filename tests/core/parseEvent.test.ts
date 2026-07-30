import { describe, it, expect } from 'vitest';
import { parseEvent } from '../../src/core/parseEvent.js';
import {
  SESSION_INIT_LINE,
  TEXT_DELTA_LINES,
  TOOL_USE_LINE,
  TOOL_RESULT_LINE,
  RESULT_LINE,
  MALFORMED_LINE,
  UNRECOGNIZED_TYPE_LINE,
} from '../fixtures/stream-json-lines.js';

describe('parseEvent', () => {
  it('parses a session init line', () => {
    expect(parseEvent(SESSION_INIT_LINE)).toEqual({
      type: 'session_init',
      sessionId: 'sess_abc123',
    });
  });

  it('parses text delta lines', () => {
    expect(parseEvent(TEXT_DELTA_LINES[0])).toEqual({ type: 'text_delta', text: 'Hello' });
    expect(parseEvent(TEXT_DELTA_LINES[1])).toEqual({ type: 'text_delta', text: ' world' });
  });

  it('parses a tool use line', () => {
    expect(parseEvent(TOOL_USE_LINE)).toEqual({
      type: 'tool_use',
      toolUseId: 'toolu_1',
      toolName: 'Read',
      input: { file_path: 'a.txt' },
    });
  });

  it('parses a tool result line', () => {
    expect(parseEvent(TOOL_RESULT_LINE)).toEqual({
      type: 'tool_result',
      toolUseId: 'toolu_1',
      content: 'file contents',
      isError: false,
    });
  });

  it('parses the final result line', () => {
    expect(parseEvent(RESULT_LINE)).toEqual({
      type: 'result',
      sessionId: 'sess_abc123',
      costUsd: 0.0123,
      text: 'Hello world',
    });
  });

  it('turns malformed JSON into a warning instead of throwing', () => {
    const event = parseEvent(MALFORMED_LINE);
    expect(event.type).toBe('warning');
  });

  it('turns an unrecognized event type into a warning instead of throwing', () => {
    const event = parseEvent(UNRECOGNIZED_TYPE_LINE);
    expect(event.type).toBe('warning');
  });
});
