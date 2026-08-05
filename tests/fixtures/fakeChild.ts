import { EventEmitter } from 'node:events';
import { PassThrough, Readable, Writable } from 'node:stream';
import type { ChildProcessLike } from '../../src/core/claudeProcess.js';

export interface FakeChildOptions {
  /** NDJSON lines the fake writes to stdout (newline is added for you). */
  lines?: string[];
  stderr?: string;
  /** Emit an 'error' event with this `code` (e.g. 'ENOENT') on the next microtask. */
  emitErrorCode?: string;
  /** Exit code reported on the child's own 'close' event. Defaults to 0. */
  exitCode?: number;
  /** Model a child whose exit is never reported, to exercise the close fallback. */
  neverClose?: boolean;
  /** Model a spawn that produced no stdout stream. */
  noStdout?: boolean;
}

export interface FakeChild extends ChildProcessLike {
  /** Everything written to the child's stdin, in order. */
  stdinChunks: string[];
  /** True once stdin has been ended (i.e. the child saw EOF). */
  stdinEnded(): boolean;
  killCount(): number;
}

interface FakeChildInternals {
  emitter: EventEmitter;
  child: FakeChild;
  finishStdio(): void;
}

function baseFakeChild(
  opts: FakeChildOptions,
  stdout: NodeJS.ReadableStream | null
): FakeChildInternals {
  const emitter = new EventEmitter();
  const child = emitter as unknown as FakeChild;

  const stdinChunks: string[] = [];
  let ended = false;
  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      stdinChunks.push(chunk.toString());
      callback();
    },
    final(callback) {
      ended = true;
      callback();
    },
  });

  const stderr = Readable.from(opts.stderr ? [opts.stderr] : [], { objectMode: false });

  let kills = 0;
  Object.assign(child, {
    stdin,
    stdout,
    stderr,
    stdinChunks,
    stdinEnded: () => ended,
    killCount: () => kills,
    kill: () => {
      kills += 1;
      stdout?.destroy?.();
      stderr.destroy();
      if (!opts.neverClose) {
        queueMicrotask(() => emitter.emit('close', null, 'SIGTERM'));
      }
    },
  });

  // A real child emits 'close' only once every stdio stream has closed, which is
  // what makes stderr safe to classify against. Model that ordering faithfully.
  let pendingStreams = stdout ? 2 : 1;
  const streamDone = (): void => {
    pendingStreams -= 1;
    if (pendingStreams === 0 && !opts.neverClose) {
      queueMicrotask(() => emitter.emit('close', opts.exitCode ?? 0, null));
    }
  };
  stdout?.on('end', streamDone);
  stderr.on('end', streamDone);

  if (opts.emitErrorCode) {
    queueMicrotask(() => {
      const err = Object.assign(new Error('spawn failed'), { code: opts.emitErrorCode });
      emitter.emit('error', err);
    });
  }

  return { emitter, child, finishStdio: streamDone };
}

/** A fake child that writes all of its output immediately and then exits. */
export function fakeChild(opts: FakeChildOptions = {}): FakeChild {
  const stdout = opts.noStdout
    ? null
    : Readable.from(opts.lines ? opts.lines.map((l) => l + '\n') : [], { objectMode: false });
  return baseFakeChild(opts, stdout).child;
}

export interface ControlledFakeChild extends FakeChild {
  /** Write one NDJSON line to stdout. */
  pushLine(line: string): void;
  /** End stdout, as a child that finished its output would. */
  endStdout(): void;
}

/**
 * A fake child that stays open until the test drives it, so mid-stream
 * behaviour (client disconnects, cancellation) can be exercised.
 */
export function controlledFakeChild(opts: FakeChildOptions = {}): ControlledFakeChild {
  const stdout = new PassThrough();
  const child = baseFakeChild(opts, stdout).child as ControlledFakeChild;
  Object.assign(child, {
    pushLine: (line: string) => stdout.write(line + '\n'),
    endStdout: () => stdout.end(),
  });
  return child;
}
