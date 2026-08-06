import { describe, it, expect } from 'vitest';
import { ClaudeSession } from '../../src/core/session.js';
import type { SpawnFn } from '../../src/core/claudeProcess.js';
import { controlledFakeChild, fakeChild as makeFakeChild } from '../fixtures/fakeChild.js';

const fakeChild = (lines: string[]) => makeFakeChild({ lines });

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

  it('keeps the session id after a failed turn, so a retry resumes the conversation', async () => {
    const calls: string[][] = [];
    const spawnFn: SpawnFn = (_command, args) => {
      calls.push(args);
      if (calls.length === 1) {
        // The CLI announced the session, then died - the shape of an expired
        // OAuth token mid-conversation.
        return makeFakeChild({
          lines: ['{"type":"system","subtype":"init","session_id":"sess_77","model":"claude-opus-5"}'],
          stderr: 'Error: not logged in, please run claude login',
        });
      }
      return fakeChild([
        '{"type":"result","subtype":"success","session_id":"sess_77","total_cost_usd":0.01,"result":"resumed"}',
      ]);
    };

    const session = new ClaudeSession({}, { spawnFn });

    await expect(drain(session.send('first prompt'))).rejects.toThrow(/authentication failure/);

    // The conversation exists CLI-side even though the turn failed.
    expect(session.sessionId).toBe('sess_77');

    await drain(session.send('retry after re-login'));
    expect(calls[1]).toContain('--resume');
    expect(calls[1][calls[1].indexOf('--resume') + 1]).toBe('sess_77');
  });

  it('kills the child when a consumer stops iterating early', async () => {
    const child = controlledFakeChild();
    const session = new ClaudeSession({}, { spawnFn: () => child });

    child.pushLine(
      '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"one"}}}'
    );

    for await (const _event of session.send('hello')) {
      break; // consumer loses interest after the first event
    }

    expect(child.killCount()).toBe(1);
  });

  it('exposes kill() so a caller can cancel a turn it is still iterating', async () => {
    const child = controlledFakeChild();
    const session = new ClaudeSession({}, { spawnFn: () => child });

    const stream = session.send('hello');
    stream.kill();

    expect(child.killCount()).toBe(1);
    // The abandoned turn surfaces as a cancellation rather than hanging.
    await expect(
      (async () => {
        for await (const _event of stream) {
          // drain
        }
      })()
    ).rejects.toThrow(/cancelled/);
  });
});
