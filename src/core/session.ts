import { startClaudeProcess, type SpawnFn } from './claudeProcess.js';
import type { ClaudeCodeOptions, ClaudeEvent, ClaudeEventStream } from './types.js';

export class ClaudeSession {
  private readonly options: ClaudeCodeOptions;
  private readonly spawnFn: SpawnFn | undefined;
  private currentSessionId: string | undefined;

  constructor(options: ClaudeCodeOptions = {}, deps: { spawnFn?: SpawnFn } = {}) {
    this.options = options;
    this.spawnFn = deps.spawnFn;
  }

  get sessionId(): string | undefined {
    return this.currentSessionId;
  }

  send(prompt: string): ClaudeEventStream {
    const handle = startClaudeProcess(prompt, this.options, this.currentSessionId, this.spawnFn);

    handle.result
      .then((result) => {
        this.currentSessionId = result.sessionId;
      })
      .catch(() => {
        // Errors surface to the caller via handle.events/handle.result consumption;
        // nothing further to do with the session's internal state here.
      });

    let drained = false;
    async function* observe(): AsyncGenerator<ClaudeEvent> {
      try {
        for await (const event of handle.events) {
          yield event;
        }
        drained = true;
      } finally {
        // Reached either because the turn ended or because the consumer stopped
        // early (`break`, or an error thrown in the loop body). In the latter
        // case the child is still running and nobody is reading it, so kill it.
        // kill() is a no-op once the turn has settled.
        if (!drained) handle.kill();
      }
    }

    return Object.assign(observe(), { kill: () => handle.kill() });
  }
}
