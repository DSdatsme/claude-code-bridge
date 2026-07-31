import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { startClaudeProcess, type ChildProcessLike, type SpawnFn } from '../../src/core/claudeProcess.js';

function fakeChild(opts: {
  lines?: string[];
  stderr?: string;
  emitErrorCode?: string;
}): ChildProcessLike {
  const emitter = new EventEmitter() as unknown as ChildProcessLike;
  const stdout = Readable.from(opts.lines ? opts.lines.map((l) => l + '\n') : [], { objectMode: false });
  const stderr = Readable.from(opts.stderr ? [opts.stderr] : [], { objectMode: false });

  Object.assign(emitter, { stdout, stderr });

  if (opts.emitErrorCode) {
    queueMicrotask(() => {
      const err = Object.assign(new Error('spawn failed'), { code: opts.emitErrorCode });
      (emitter as unknown as EventEmitter).emit('error', err);
    });
  }

  return emitter;
}

describe('startClaudeProcess', () => {
  it('streams parsed events and resolves the result', async () => {
    const spawnFn: SpawnFn = () =>
      fakeChild({
        lines: [
          '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}}',
          '{"type":"result","subtype":"success","session_id":"sess_1","total_cost_usd":0.01,"result":"hi"}',
        ],
      });

    const handle = startClaudeProcess('hello', {}, undefined, spawnFn);

    const events = [];
    for await (const event of handle.events) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'text_delta', text: 'hi' },
      { type: 'result', sessionId: 'sess_1', costUsd: 0.01, text: 'hi' },
    ]);
    await expect(handle.result).resolves.toEqual({
      type: 'result',
      sessionId: 'sess_1',
      costUsd: 0.01,
      text: 'hi',
    });
  });

  it('resolves `result` even if the caller never iterates `events`', async () => {
    const spawnFn: SpawnFn = () =>
      fakeChild({
        lines: [
          '{"type":"result","subtype":"success","session_id":"sess_2","total_cost_usd":0.02,"result":"done"}',
        ],
      });

    const handle = startClaudeProcess('hello', {}, undefined, spawnFn);
    await expect(handle.result).resolves.toEqual({
      type: 'result',
      sessionId: 'sess_2',
      costUsd: 0.02,
      text: 'done',
    });
  });

  it('rejects with ClaudeNotFoundError when the binary is missing', async () => {
    const spawnFn: SpawnFn = () => fakeChild({ emitErrorCode: 'ENOENT' });
    const handle = startClaudeProcess('hello', {}, undefined, spawnFn);
    await expect(handle.result).rejects.toThrow(/Could not find/);
  });

  it('rejects with a ClaudeAuthError when stderr looks auth-related and no result arrives', async () => {
    const spawnFn: SpawnFn = () =>
      fakeChild({ lines: [], stderr: 'Error: not logged in, please run claude login' });
    const handle = startClaudeProcess('hello', {}, undefined, spawnFn);
    await expect(handle.result).rejects.toThrow(/authentication failure/);
  });

  it('rejects with the collected partial text when the process ends without a result', async () => {
    const spawnFn: SpawnFn = () =>
      fakeChild({
        lines: [
          '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}}',
        ],
        stderr: 'unexpected crash',
      });
    const handle = startClaudeProcess('hello', {}, undefined, spawnFn);
    await expect(handle.result).rejects.toMatchObject({ partialText: 'partial' });
  });
});
