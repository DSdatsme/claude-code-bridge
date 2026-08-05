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
}
