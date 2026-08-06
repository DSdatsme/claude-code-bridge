import { describe, it, expect } from 'vitest';
import { startClaudeProcess, type SpawnFn } from '../../src/core/claudeProcess.js';
import { controlledFakeChild, fakeChild } from '../fixtures/fakeChild.js';

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
      { type: 'result', sessionId: 'sess_1', costUsd: 0.01, text: 'hi', isError: false, subtype: 'success' },
    ]);
    await expect(handle.result).resolves.toEqual({
      type: 'result',
      sessionId: 'sess_1',
      costUsd: 0.01,
      text: 'hi',
      isError: false,
      subtype: 'success',
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
      isError: false,
      subtype: 'success',
    });
  });

  it('writes the prompt to stdin and ends it, instead of putting it in argv', async () => {
    const children: ReturnType<typeof fakeChild>[] = [];
    const argvs: string[][] = [];
    const spawnFn: SpawnFn = (_command, args) => {
      argvs.push(args);
      const child = fakeChild({
        lines: [
          '{"type":"result","subtype":"success","session_id":"sess_3","total_cost_usd":0,"result":"ok"}',
        ],
      });
      children.push(child);
      return child;
    };

    const handle = startClaudeProcess('summarize the README', {}, undefined, spawnFn);
    await handle.result;

    expect(children[0].stdinChunks.join('')).toBe('summarize the README');
    expect(children[0].stdinEnded()).toBe(true);
    expect(argvs[0]).not.toContain('summarize the README');
    expect(argvs[0]).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
    ]);
  });

  it('keeps a prompt that begins with a dash out of argv so the CLI cannot parse it as a flag', async () => {
    const argvs: string[][] = [];
    const children: ReturnType<typeof fakeChild>[] = [];
    const spawnFn: SpawnFn = (_command, args) => {
      argvs.push(args);
      const child = fakeChild({
        lines: [
          '{"type":"result","subtype":"success","session_id":"sess_4","total_cost_usd":0,"result":"ok"}',
        ],
      });
      children.push(child);
      return child;
    };

    for (const hostilePrompt of [
      '--dangerously-skip-permissions',
      '--bare',
      '--permission-mode=bypassPermissions',
    ]) {
      const handle = startClaudeProcess(hostilePrompt, {}, undefined, spawnFn);
      await handle.result;
    }

    for (const argv of argvs) {
      expect(argv).not.toContain('--dangerously-skip-permissions');
      expect(argv).not.toContain('--bare');
      expect(argv).not.toContain('--permission-mode=bypassPermissions');
    }
    // The hostile text still reaches Claude - as a prompt, over stdin, where it
    // is data rather than argv.
    expect(children.map((c) => c.stdinChunks.join(''))).toEqual([
      '--dangerously-skip-permissions',
      '--bare',
      '--permission-mode=bypassPermissions',
    ]);
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

  it('rejects promptly with ClaudeProcessError when stdout is null (no hang)', async () => {
    const spawnFn: SpawnFn = () => fakeChild({ noStdout: true });

    const handle = startClaudeProcess('hello', {}, undefined, spawnFn);
    await expect(handle.result).rejects.toThrow(/no stdout stream/);
  });

  it('fails the turn when the CLI reports an errored result, but still emits the event', async () => {
    const spawnFn: SpawnFn = () =>
      fakeChild({
        lines: [
          '{"type":"result","subtype":"error_during_execution","session_id":"sess_e","total_cost_usd":0.03,"is_error":true,"result":"it broke"}',
        ],
      });
    const handle = startClaudeProcess('hello', {}, undefined, spawnFn);

    await expect(handle.result).rejects.toMatchObject({
      name: 'ClaudeResultError',
      sessionId: 'sess_e',
      costUsd: 0.03,
      subtype: 'error_during_execution',
    });

    // The event itself is still delivered, so a UI can show the reported cost
    // and the CLI's own message before the error lands.
    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const event of handle.events) {
          seen.push(event.type);
        }
      })()
    ).rejects.toThrow(/failed turn/);
    expect(seen).toEqual(['result']);
  });

  it('surfaces a failure through `events`, not only through `result`', async () => {
    // Without this, a consumer of `events` alone - which is exactly what
    // ClaudeSession.send() hands to the SSE route handler - sees the iteration
    // complete normally and never learns that anything went wrong.
    const spawnFn: SpawnFn = () => fakeChild({ emitErrorCode: 'ENOENT' });
    const handle = startClaudeProcess('hello', {}, undefined, spawnFn);

    await expect(
      (async () => {
        for await (const _ of handle.events) {
          // drain
        }
      })()
    ).rejects.toThrow(/Could not find/);
  });

  it('delivers partial events before surfacing a mid-stream failure through `events`', async () => {
    const spawnFn: SpawnFn = () =>
      fakeChild({
        lines: [
          '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}}',
        ],
        stderr: 'unexpected crash',
      });
    const handle = startClaudeProcess('hello', {}, undefined, spawnFn);

    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const event of handle.events) {
          seen.push(event.type);
        }
      })()
    ).rejects.toThrow(/without a result/);
    expect(seen).toEqual(['text_delta']);
  });

  it('reports the exit code when the process ends without a result', async () => {
    const spawnFn: SpawnFn = () => fakeChild({ lines: [], stderr: 'boom', exitCode: 3 });
    const handle = startClaudeProcess('hello', {}, undefined, spawnFn);

    await expect(handle.result).rejects.toThrow(/exited with code 3/);
  });

  it('does not mistake stderr merely containing "author" for an auth failure', async () => {
    // The old /auth|unauthorized|login/i test matched the substring in "author",
    // so unrelated crashes told the operator to re-run `claude login`.
    const spawnFn: SpawnFn = () =>
      fakeChild({ lines: [], stderr: 'Error: file authored by another process; aborting', exitCode: 1 });
    const handle = startClaudeProcess('hello', {}, undefined, spawnFn);

    await expect(handle.result).rejects.toMatchObject({ name: 'ClaudeProcessError' });
  });

  it('still classifies a genuine auth failure', async () => {
    const spawnFn: SpawnFn = () =>
      fakeChild({ lines: [], stderr: 'OAuth token expired. Please run `claude login`.', exitCode: 1 });
    const handle = startClaudeProcess('hello', {}, undefined, spawnFn);

    await expect(handle.result).rejects.toMatchObject({ name: 'ClaudeAuthError' });
  });

  it('classifies using stderr that only arrives after stdout has closed', async () => {
    // stdout closing says nothing about whether stderr has drained. Classifying
    // at that moment could miss the very message explaining the failure, so the
    // decision waits for the child's own 'close'.
    const child = controlledFakeChild({ exitCode: 1 });
    const handle = startClaudeProcess('hello', {}, undefined, () => child);

    child.endStdout();
    await new Promise((resolve) => setTimeout(resolve, 5));
    child.pushStderr('Invalid API key. Please run `claude login`.');
    child.endStderr();

    await expect(handle.result).rejects.toMatchObject({ name: 'ClaudeAuthError' });
  });

  it('does not hang when a child never reports its exit', async () => {
    const child = controlledFakeChild({ neverClose: true });
    const handle = startClaudeProcess('hello', {}, undefined, () => child);

    child.pushStderr('something went wrong');
    child.endStderr();
    child.endStdout();

    await expect(handle.result).rejects.toMatchObject({ name: 'ClaudeProcessError' });
  });

  it('kill() kills the child and settles the pending turn as cancelled', async () => {
    const child = controlledFakeChild();
    const handle = startClaudeProcess('hello', {}, undefined, () => child);

    child.pushLine(
      '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"thinking"}}}'
    );
    // Let the line be read before cancelling.
    await new Promise((resolve) => setTimeout(resolve, 5));

    handle.kill();

    expect(child.killCount()).toBe(1);
    await expect(handle.result).rejects.toMatchObject({
      name: 'ClaudeProcessError',
      partialText: 'thinking',
    });
  });

  it('kill() is idempotent and a no-op once the turn already finished', async () => {
    const child = fakeChild({
      lines: [
        '{"type":"result","subtype":"success","session_id":"sess_k","total_cost_usd":0,"result":"done"}',
      ],
    });
    const handle = startClaudeProcess('hello', {}, undefined, () => child);
    await handle.result;

    handle.kill();
    handle.kill();

    expect(child.killCount()).toBe(0);
    await expect(handle.result).resolves.toMatchObject({ text: 'done' });
  });

  it('does not produce an unhandled rejection when only `events` is consumed', async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown): void => void unhandled.push(reason);
    process.on('unhandledRejection', listener);

    try {
      const spawnFn: SpawnFn = () => fakeChild({ emitErrorCode: 'ENOENT' });
      const handle = startClaudeProcess('hello', {}, undefined, spawnFn);

      // Consume `events` and swallow its error, never touching `result`.
      await (async () => {
        try {
          for await (const _ of handle.events) {
            // drain
          }
        } catch {
          // caller handled the stream error and does not care about `result`
        }
      })();

      // Give the microtask queue and one macrotask turn a chance to report an
      // unhandled rejection on `result`, which is what used to kill the process.
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', listener);
    }
  });
});
