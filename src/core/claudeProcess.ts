import { spawn as defaultSpawn } from 'node:child_process';
import * as readline from 'node:readline';
import { buildClaudeArgs } from './cliArgs.js';
import { parseEvent } from './parseEvent.js';
import { AsyncEventQueue } from './asyncEventQueue.js';
import { ClaudeNotFoundError, ClaudeAuthError, ClaudeProcessError } from './errors.js';
import type { ClaudeCodeOptions, ClaudeEvent, ResultEvent } from './types.js';

export interface ChildProcessLike {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(event: 'error', listener: (err: NodeJS.ErrnoException) => void): void;
}

export type SpawnFn = (
  command: string,
  args: string[],
  options: { cwd?: string }
) => ChildProcessLike;

export interface ClaudeProcessHandle {
  events: AsyncIterable<ClaudeEvent>;
  result: Promise<ResultEvent>;
}

const nodeSpawn: SpawnFn = (command, args, options) =>
  defaultSpawn(command, args, { cwd: options.cwd }) as unknown as ChildProcessLike;

export function startClaudeProcess(
  prompt: string,
  options: ClaudeCodeOptions,
  resumeSessionId: string | undefined,
  spawnFn: SpawnFn = nodeSpawn
): ClaudeProcessHandle {
  const binaryPath = options.binaryPath ?? 'claude';
  const args = buildClaudeArgs(prompt, options, resumeSessionId);
  const child = spawnFn(binaryPath, args, { cwd: options.cwd });

  const queue = new AsyncEventQueue<ClaudeEvent>();
  let partialText = '';
  const stderrChunks: string[] = [];
  let settled = false;

  let resolveResult!: (event: ResultEvent) => void;
  let rejectResult!: (error: Error) => void;
  const result = new Promise<ResultEvent>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  function fail(error: Error): void {
    if (settled) return;
    settled = true;
    rejectResult(error);
    queue.finish();
  }

  child.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') {
      fail(new ClaudeNotFoundError(binaryPath));
    } else {
      fail(new ClaudeProcessError(`Failed to start "${binaryPath}": ${err.message}`, partialText));
    }
  });

  child.stderr?.on('data', (chunk: Buffer | string) => {
    stderrChunks.push(chunk.toString());
  });

  if (child.stdout) {
    const rl = readline.createInterface({ input: child.stdout });

    rl.on('line', (line: string) => {
      if (!line.trim()) return;
      const event = parseEvent(line);
      if (event.type === 'text_delta') {
        partialText += event.text;
      }
      queue.push(event);
      if (event.type === 'result') {
        settled = true;
        resolveResult(event);
      }
    });

    rl.on('close', () => {
      if (!settled) {
        const stderr = stderrChunks.join('');
        if (/auth|unauthorized|login/i.test(stderr)) {
          fail(new ClaudeAuthError(stderr));
        } else {
          fail(
            new ClaudeProcessError(
              `Claude process exited without a result message. stderr: ${stderr}`,
              partialText
            )
          );
        }
      } else {
        queue.finish();
      }
    });
  } else {
    fail(new ClaudeProcessError('Claude process produced no stdout stream', partialText));
  }

  return { events: queue, result };
}
