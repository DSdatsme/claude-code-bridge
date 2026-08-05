import { describe, it, expect } from 'vitest';
import { parseEvent } from '../../src/core/parseEvent.js';
import {
  SESSION_INIT_LINE,
  TEXT_DELTA_LINES,
  TOOL_USE_LINE,
  TOOL_RESULT_LINE,
  RESULT_LINE,
  ERROR_RESULT_LINE,
  MAX_TURNS_RESULT_LINE,
  MALFORMED_LINE,
  UNRECOGNIZED_TYPE_LINE,
  HOOK_STARTED_LINE,
  IGNORABLE_STREAM_EVENT_LINES,
  ASSISTANT_TEXT_LINE,
  USER_ECHO_LINE,
  SYSTEM_API_ERROR_LINE,
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
      isError: false,
      subtype: 'success',
    });
  });

  it('flags a result carrying is_error: true', () => {
    expect(parseEvent(ERROR_RESULT_LINE)).toMatchObject({
      type: 'result',
      isError: true,
      subtype: 'error_during_execution',
      costUsd: 0.02,
      sessionId: 'sess_abc123',
    });
  });

  it('flags a result whose subtype is not "success" even without is_error', () => {
    expect(parseEvent(MAX_TURNS_RESULT_LINE)).toMatchObject({
      type: 'result',
      isError: true,
      subtype: 'error_max_turns',
    });
  });

  describe('routine output that should not become a warning', () => {
    it('skips a hook_started system message (captured from a real CLI run)', () => {
      expect(parseEvent(HOOK_STARTED_LINE)).toBeUndefined();
    });

    it('skips partial-message plumbing stream events', () => {
      for (const line of IGNORABLE_STREAM_EVENT_LINES) {
        expect(parseEvent(line), line).toBeUndefined();
      }
    });

    it('skips the completed assistant text message that duplicates the deltas', () => {
      expect(parseEvent(ASSISTANT_TEXT_LINE)).toBeUndefined();
    });

    it('skips the echoed user turn', () => {
      expect(parseEvent(USER_ECHO_LINE)).toBeUndefined();
    });

    it('still surfaces a system message that reports a problem', () => {
      const event = parseEvent(SYSTEM_API_ERROR_LINE);
      expect(event?.type).toBe('warning');
      expect(event).toMatchObject({ message: expect.stringContaining('api_error') });
    });

    it('still finds a tool_use block in an assistant message that also has text', () => {
      const line =
        '{"type":"assistant","message":{"content":[{"type":"text","text":"let me look"},{"type":"tool_use","id":"toolu_9","name":"Read","input":{}}]}}';
      expect(parseEvent(line)).toMatchObject({ type: 'tool_use', toolUseId: 'toolu_9' });
    });
  });

  it('turns malformed JSON into a warning instead of throwing', () => {
    const event = parseEvent(MALFORMED_LINE);
    expect(event?.type).toBe('warning');
  });

  it('turns an unrecognized event type into a warning instead of throwing', () => {
    const event = parseEvent(UNRECOGNIZED_TYPE_LINE);
    expect(event?.type).toBe('warning');
  });

  it('handles assistant message where content is a string instead of an array (no throw)', () => {
    const line = '{"type":"assistant","message":{"content":"not an array"}}';
    const event = parseEvent(line);
    expect(event?.type).toBe('warning');
  });

  it('handles content array with null elements (no throw)', () => {
    const line = '{"type":"assistant","message":{"content":[null,{"type":"other_type"}]}}';
    const event = parseEvent(line);
    expect(event?.type).toBe('warning');
  });
});
