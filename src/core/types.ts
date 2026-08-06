export interface TextDeltaEvent {
  type: 'text_delta';
  text: string;
}

export interface ToolUseEvent {
  type: 'tool_use';
  toolUseId: string;
  toolName: string;
  input: unknown;
}

export interface ToolResultEvent {
  type: 'tool_result';
  toolUseId: string;
  content: string;
  isError: boolean;
}

export interface ResultEvent {
  type: 'result';
  sessionId: string;
  costUsd: number;
  text: string;
  /**
   * True when the CLI reported the turn as failed - `is_error: true`, or a
   * terminal subtype other than "success" such as "error_max_turns" or
   * "error_during_execution". Such a result still carries a cost and a session
   * id, so it is only distinguishable by this field.
   */
  isError: boolean;
  /** The CLI's own result subtype, e.g. "success" or "error_max_turns". */
  subtype?: string;
}

export interface SessionInitEvent {
  type: 'session_init';
  sessionId: string;
}

export interface WarningEvent {
  type: 'warning';
  message: string;
  /**
   * The raw line this warning came from, for server-side diagnosis. It can
   * contain arbitrary CLI output, so it is stripped before the event is
   * forwarded to a browser - see the /next route handler.
   */
  raw: string;
}

/**
 * A turn that ended in failure. Produced at the transport boundary (the SSE
 * route handler) so that an error raised inside the process layer reaches a
 * browser as a typed event rather than as a silently truncated stream.
 */
export interface ClaudeErrorEvent {
  type: 'error';
  /** Error class name, e.g. "ClaudeAuthError", so consumers can branch on it. */
  name: string;
  message: string;
}

export type ClaudeEvent =
  | TextDeltaEvent
  | ToolUseEvent
  | ToolResultEvent
  | ResultEvent
  | SessionInitEvent
  | WarningEvent
  | ClaudeErrorEvent;

/**
 * An event stream for one turn that can also be cancelled. Cancelling kills the
 * underlying `claude` process, which matters on a persistent server: an
 * abandoned turn otherwise runs to completion, spending tokens for output nobody
 * will read.
 */
export interface ClaudeEventStream extends AsyncIterable<ClaudeEvent> {
  kill(): void;
}

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

export interface ClaudeCodeOptions {
  /** Path to the claude binary. Defaults to "claude" (resolved via PATH). */
  binaryPath?: string;
  /** Working directory for the spawned process. */
  cwd?: string;
  permissionMode?: PermissionMode;
  allowedTools?: string[];
  disallowedTools?: string[];
  systemPrompt?: string;
  appendSystemPrompt?: string;
  mcpConfigPath?: string;
  model?: string;
}

export interface RunTaskResult {
  text: string;
  sessionId: string;
  costUsd: number;
  toolCalls: ToolUseEvent[];
  /**
   * Whether the CLI flagged the turn as failed. `runTask` rejects with a
   * `ClaudeResultError` in that case, so a resolved result normally has this
   * false; it is carried through so the shape stays honest for callers that
   * inspect a `ResultEvent` directly.
   */
  isError: boolean;
}
