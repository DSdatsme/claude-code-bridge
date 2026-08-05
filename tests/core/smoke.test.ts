import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runTask } from '../../src/core/index.js';

const FAKE_CLI = fileURLToPath(new URL('../fixtures/fake-claude-cli.mjs', import.meta.url));

describe('end-to-end smoke test (real child_process.spawn, fake binary)', () => {
  it('spawns the fake CLI as a real OS process and resolves a RunTaskResult', async () => {
    const result = await runTask('say hello', { binaryPath: FAKE_CLI });

    // The fake CLI echoes back whatever it read from stdin, so this asserts the
    // prompt really travelled over stdin through a real OS pipe - and that the
    // library closed stdin, or the child would still be waiting for EOF.
    expect(result.text).toBe('Hello from fake CLI, you said: say hello');
    expect(result.sessionId).toBe('sess_smoke');
    expect(result.costUsd).toBe(0.001);
  });

  it('delivers a prompt beginning with a dash as a prompt, not as a CLI flag', async () => {
    // The fake CLI exits 2 if anything positional reaches argv, so a passing
    // assertion here means hostile prompt text cannot become an option.
    const result = await runTask('--dangerously-skip-permissions', { binaryPath: FAKE_CLI });

    expect(result.text).toBe('Hello from fake CLI, you said: --dangerously-skip-permissions');
  });
});
