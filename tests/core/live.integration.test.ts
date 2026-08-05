import { describe, it, expect } from 'vitest';
import { runTask, ClaudeSession } from '../../src/core/index.js';

const RUN_LIVE_TESTS = process.env.CLAUDE_CODE_BRIDGE_LIVE_TESTS === '1';

describe.skipIf(!RUN_LIVE_TESTS)('live integration tests (spawns the real claude CLI)', () => {
  it('runs a real prompt end-to-end and gets a real result', async () => {
    const result = await runTask('Reply with exactly the word: pong');
    expect(result.text.toLowerCase()).toContain('pong');
    expect(result.sessionId).toBeTruthy();
    expect(result.costUsd).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it('resumes a session across two turns via ClaudeSession', async () => {
    const session = new ClaudeSession();

    for await (const _ of session.send('Remember the number 42. Reply with just: ok')) {
      // drain the first turn
    }
    const firstSessionId = session.sessionId;
    expect(firstSessionId).toBeTruthy();

    let text = '';
    for await (const event of session.send(
      'What number did I ask you to remember? Reply with just the number.'
    )) {
      if (event.type === 'text_delta') text += event.text;
    }

    expect(session.sessionId).toBe(firstSessionId);
    expect(text).toContain('42');
  }, 30_000);
});
