import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { ClaudeSession } from '../../src/core/session.js';
import type { ChildProcessLike, SpawnFn } from '../../src/core/claudeProcess.js';

function fakeChild(lines: string[]): ChildProcessLike {
  const emitter = new EventEmitter() as unknown as ChildProcessLike;
  Object.assign(emitter, {
    stdout: Readable.from(lines.map((l) => l + '\n')),
    stderr: Readable.from([]),
  });
  return emitter;
}

async function drain(events: AsyncIterable<unknown>): Promise<void> {
  for await (const _ of events) {
    // drain
  }
}

describe('ClaudeSession', () => {
  it('has no sessionId before the first turn completes', () => {
    const session = new ClaudeSession({}, { spawnFn: () => fakeChild([]) });
    expect(session.sessionId).toBeUndefined();
  });

  it('captures the sessionId after the first turn and resumes on the second', async () => {
    const calls: string[][] = [];
    const spawnFn: SpawnFn = (_command, args) => {
      calls.push(args);
      const turn = calls.length;
      if (turn === 1) {
        return fakeChild([
          '{"type":"result","subtype":"success","session_id":"sess_42","total_cost_usd":0.01,"result":"first"}',
        ]);
      }
      return fakeChild([
        '{"type":"result","subtype":"success","session_id":"sess_42","total_cost_usd":0.02,"result":"second"}',
      ]);
    };

    const session = new ClaudeSession({}, { spawnFn });

    await drain(session.send('first prompt'));
    expect(session.sessionId).toBe('sess_42');

    await drain(session.send('second prompt'));
    expect(calls[1]).toContain('--resume');
    expect(calls[1][calls[1].indexOf('--resume') + 1]).toBe('sess_42');
  });
});
