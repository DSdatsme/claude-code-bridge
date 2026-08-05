export type {
  ClaudeEvent,
  TextDeltaEvent,
  ToolUseEvent,
  ToolResultEvent,
  ResultEvent,
  SessionInitEvent,
  WarningEvent,
  ClaudeErrorEvent,
  ClaudeCodeOptions,
  PermissionMode,
  RunTaskResult,
} from './types.js';
export { ClaudeNotFoundError, ClaudeAuthError, ClaudeProcessError } from './errors.js';
export { checkClaudeCode, type VersionCheckResult } from './versionGuard.js';
export { runTask, type RunTaskOptions } from './runTask.js';
export { ClaudeSession } from './session.js';
export {
  startClaudeProcess,
  type SpawnFn,
  type ChildProcessLike,
  type ClaudeProcessHandle,
} from './claudeProcess.js';
