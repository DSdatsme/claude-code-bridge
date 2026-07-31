import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runTask } from '../../src/core/index.js';

const FAKE_CLI = fileURLToPath(new URL('../fixtures/fake-claude-cli.mjs', import.meta.url));

describe('end-to-end smoke test (real child_process.spawn, fake binary)', () => {
  it('spawns the fake CLI as a real OS process and resolves a RunTaskResult', async () => {
    const result = await runTask('say hello', { binaryPath: FAKE_CLI });

    expect(result.text).toBe('Hello from fake CLI');
    expect(result.sessionId).toBe('sess_smoke');
    expect(result.costUsd).toBe(0.001);
  });
});
