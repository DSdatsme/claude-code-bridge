import { startClaudeProcess, type SpawnFn } from './claudeProcess.js';
import type { ClaudeCodeOptions, ClaudeEvent } from './types.js';

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

  send(prompt: string): AsyncIterable<ClaudeEvent> {
    const handle = startClaudeProcess(prompt, this.options, this.currentSessionId, this.spawnFn);

    handle.result
      .then((result) => {
        this.currentSessionId = result.sessionId;
      })
      .catch(() => {
        // Errors surface to the caller via handle.events/handle.result consumption;
        // nothing further to do with the session's internal state here.
      });

    return handle.events;
  }
}
