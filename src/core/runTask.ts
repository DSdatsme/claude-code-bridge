import { startClaudeProcess, type SpawnFn } from './claudeProcess.js';
import type { ClaudeCodeOptions, ClaudeEvent, RunTaskResult, ToolUseEvent } from './types.js';

export interface RunTaskOptions extends ClaudeCodeOptions {
  onEvent?: (event: ClaudeEvent) => void;
}

export async function runTask(
  prompt: string,
  options: RunTaskOptions = {},
  deps: { spawnFn?: SpawnFn } = {}
): Promise<RunTaskResult> {
  const { onEvent, ...processOptions } = options;
  const handle = startClaudeProcess(prompt, processOptions, undefined, deps.spawnFn);

  const toolCalls: ToolUseEvent[] = [];
  for await (const event of handle.events) {
    onEvent?.(event);
    if (event.type === 'tool_use') {
      toolCalls.push(event);
    }
  }

  const result = await handle.result;
  return {
    text: result.text,
    sessionId: result.sessionId,
    costUsd: result.costUsd,
    toolCalls,
  };
}
