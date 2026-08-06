import { spawn as defaultSpawn } from 'node:child_process';
import * as readline from 'node:readline';
import { buildClaudeArgs } from './cliArgs.js';
import { parseEvent } from './parseEvent.js';
import { AsyncEventQueue } from './asyncEventQueue.js';
import {
  ClaudeNotFoundError,
  ClaudeAuthError,
  ClaudeProcessError,
  ClaudeResultError,
} from './errors.js';
import type { ClaudeCodeOptions, ClaudeEvent, ResultEvent } from './types.js';

export interface ChildProcessLike {
  stdin: NodeJS.WritableStream | null;
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(event: 'error', listener: (err: NodeJS.ErrnoException) => void): void;
  on(
    event: 'close',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void
  ): void;
  kill(): void;
}

export type SpawnFn = (
  command: string,
  args: string[],
  options: { cwd?: string }
) => ChildProcessLike;

export interface ClaudeProcessHandle {
  events: AsyncIterable<ClaudeEvent>;
  result: Promise<ResultEvent>;
  /**
   * Kills the child and settles the turn as cancelled. Safe to call more than
   * once, and a no-op once the turn has already finished. Without this, an
   * abandoned turn - a browser that disconnected, a consumer that stopped
   * iterating - runs to completion on the server, spending tokens for output
   * nobody reads.
   */
  kill(): void;
  /**
   * The session id as soon as the CLI reports it, which is at the *start* of the
   * turn (its `init` message) rather than only on success. A turn that fails
   * half way still belongs to a real, resumable conversation.
   */
  readonly sessionId: string | undefined;
}

const nodeSpawn: SpawnFn = (command, args, options) =>
  defaultSpawn(command, args, { cwd: options.cwd }) as unknown as ChildProcessLike;

/**
 * Recognises stderr that reports a credential problem, which is a routine and
 * recurring condition rather than a crash: subscription OAuth tokens expire
 * every 8-12 hours on a persistent server.
 *
 * Deliberately specific. A bare /auth/ test matches the substring in "author",
 * "authored" and any path containing it, which reported unrelated crashes as
 * expired credentials and sent the operator off to re-run `claude login`.
 */
function looksLikeAuthFailure(stderr: string): boolean {
  return /\b(?:not logged in|logged out|please (?:run )?(?:re-?)?log ?in|claude login|unauthorized|invalid api key|invalid[ -]?token|authentication (?:failed|error|required)|credentials? (?:expired|invalid|missing)|token (?:expired|invalid)|oauth|401)\b/i.test(
    stderr
  );
}

/** How long to wait for the child's own 'close' after stdout ends. */
const CHILD_CLOSE_GRACE_MS = 50;

export function startClaudeProcess(
  prompt: string,
  options: ClaudeCodeOptions,
  resumeSessionId: string | undefined,
  spawnFn: SpawnFn = nodeSpawn
): ClaudeProcessHandle {
  const binaryPath = options.binaryPath ?? 'claude';
  const args = buildClaudeArgs(options, resumeSessionId);
  const child = spawnFn(binaryPath, args, { cwd: options.cwd });

  // The prompt goes over stdin, never argv (see buildClaudeArgs). Ending stdin
  // immediately is also what keeps the CLI responsive: its input handling waits
  // up to 3s for stdin data whenever stdin is not a TTY - which is always the
  // case for a spawned child - so leaving the pipe open costs ~3s per turn.
  if (child.stdin) {
    // A child that dies before reading stdin makes the write fail with EPIPE.
    // That failure is already reported through 'error'/'close'; don't let it
    // surface as an unhandled stream error.
    child.stdin.on('error', () => {});
    child.stdin.write(prompt);
    child.stdin.end();
  }

  const queue = new AsyncEventQueue<ClaudeEvent>();
  let partialText = '';
  let sessionId: string | undefined;
  const stderrChunks: string[] = [];
  let settled = false;

  let resolveResult!: (event: ResultEvent) => void;
  let rejectResult!: (error: Error) => void;
  const result = new Promise<ResultEvent>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  // Safety net: a caller who only iterates `events` (the shape `SessionLike`
  // models) never attaches a handler to `result`, and an unhandled rejection
  // terminates the host process on Node >= 15. Attaching a no-op handler here
  // does not swallow anything - callers who do await or .catch() the same
  // promise still see the real rejection, because every handler on a promise
  // runs. The error also reaches event consumers via queue.fail() below.
  result.catch(() => {});

  function fail(error: Error): void {
    if (settled) return;
    settled = true;
    rejectResult(error);
    // fail(), not finish(): finishing would complete the iteration normally and
    // the failure would never reach anyone consuming only `events`.
    queue.fail(error);
  }

  let killed = false;
  function kill(): void {
    if (killed || settled) return;
    killed = true;
    try {
      child.kill();
    } catch {
      // The process is already gone; the pending turn still needs settling.
    }
    fail(
      new ClaudeProcessError(
        'Claude process was cancelled before it produced a result',
        partialText
      )
    );
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

  let stdoutEnded = false;
  let childClosed = false;
  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;

  child.on('close', (code, signal) => {
    childClosed = true;
    exitCode = code;
    exitSignal = signal;
    maybeEnd();
  });

  function endOfOutput(): void {
    if (graceTimer !== undefined) {
      clearTimeout(graceTimer);
      graceTimer = undefined;
    }

    const stderr = stderrChunks.join('');
    if (looksLikeAuthFailure(stderr)) {
      fail(new ClaudeAuthError(stderr));
      return;
    }

    const how = exitSignal
      ? `was terminated by ${exitSignal}`
      : exitCode === null
        ? 'exited'
        : `exited with code ${exitCode}`;
    fail(
      new ClaudeProcessError(
        `Claude process ${how} without a result message. stderr: ${stderr}`,
        partialText
      )
    );
  }

  /**
   * Decides the outcome once output is finished. Classification waits for the
   * child's own 'close', which fires only after every stdio stream has closed -
   * stdout closing on its own says nothing about whether stderr has drained, so
   * classifying there could miss the very message that explains the failure.
   * The grace timer keeps a child that never reports its exit from hanging.
   */
  function maybeEnd(): void {
    if (settled) {
      // The turn already produced its result; just end the event stream.
      queue.finish();
      return;
    }
    if (stdoutEnded && childClosed) {
      endOfOutput();
      return;
    }
    if ((stdoutEnded || childClosed) && graceTimer === undefined) {
      graceTimer = setTimeout(endOfOutput, CHILD_CLOSE_GRACE_MS);
      graceTimer.unref?.();
    }
  }

  if (child.stdout) {
    const rl = readline.createInterface({ input: child.stdout });

    rl.on('line', (line: string) => {
      if (!line.trim()) return;
      const event = parseEvent(line);
      // Recognised-but-unmodelled lines (partial-message plumbing, routine
      // system notices) parse to undefined and are simply not forwarded.
      if (!event) return;
      if (event.type === 'text_delta') {
        partialText += event.text;
      }
      if (event.type === 'session_init' || event.type === 'result') {
        sessionId = event.sessionId;
      }
      queue.push(event);
      if (event.type === 'result') {
        if (event.isError) {
          // The turn finished but the CLI flagged it as failed. Push the event
          // first (queue.fail still drains what is buffered) so consumers can
          // see the reported cost and session id, then fail rather than handing
          // back a result that looks successful.
          fail(
            new ClaudeResultError({
              sessionId: event.sessionId,
              costUsd: event.costUsd,
              text: event.text || partialText,
              subtype: event.subtype,
            })
          );
        } else {
          settled = true;
          resolveResult(event);
        }
      }
    });

    rl.on('close', () => {
      stdoutEnded = true;
      maybeEnd();
    });
  } else {
    fail(new ClaudeProcessError('Claude process produced no stdout stream', partialText));
  }

  return {
    events: queue,
    result,
    kill,
    get sessionId(): string | undefined {
      return sessionId;
    },
  };
}
