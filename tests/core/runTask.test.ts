import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { runTask } from '../../src/core/runTask.js';
import type { ChildProcessLike, SpawnFn } from '../../src/core/claudeProcess.js';

function fakeChild(lines: string[]): ChildProcessLike {
  const emitter = new EventEmitter() as unknown as ChildProcessLike;
  Object.assign(emitter, {
    stdout: Readable.from(lines.map((l) => l + '\n')),
    stderr: Readable.from([]),
  });
  return emitter;
}

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
