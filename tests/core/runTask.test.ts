import { describe, it, expect } from 'vitest';
import { runTask } from '../../src/core/runTask.js';
import type { SpawnFn } from '../../src/core/claudeProcess.js';
import { fakeChild as makeFakeChild } from '../fixtures/fakeChild.js';

const fakeChild = (lines: string[]) => makeFakeChild({ lines });

describe('runTask', () => {
  it('resolves text, sessionId, costUsd, and collected tool calls', async () => {
    const spawnFn: SpawnFn = () =>
      fakeChild([
        '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}}',
        '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Read","input":{"file_path":"a.txt"}}]}}',
        '{"type":"result","subtype":"success","session_id":"sess_1","total_cost_usd":0.05,"result":"Hello"}',
      ]);

    const result = await runTask('hello', {}, { spawnFn });

    expect(result).toEqual({
      text: 'Hello',
      sessionId: 'sess_1',
      costUsd: 0.05,
      toolCalls: [{ type: 'tool_use', toolUseId: 'toolu_1', toolName: 'Read', input: { file_path: 'a.txt' } }],
    });
  });

  it('invokes onEvent for every event as it arrives', async () => {
    const spawnFn: SpawnFn = () =>
      fakeChild([
        '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}}',
        '{"type":"result","subtype":"success","session_id":"sess_2","total_cost_usd":0.01,"result":"Hi"}',
      ]);

    const seen: string[] = [];
    await runTask('hello', { onEvent: (event) => seen.push(event.type) }, { spawnFn });

    expect(seen).toEqual(['text_delta', 'result']);
  });
});
