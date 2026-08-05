export const SESSION_INIT_LINE =
  '{"type":"system","subtype":"init","session_id":"sess_abc123","model":"claude-opus-5"}';

export const TEXT_DELTA_LINES = [
  '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}}',
  '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}}',
];

export const TOOL_USE_LINE =
  '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Read","input":{"file_path":"a.txt"}}]}}';

export const TOOL_RESULT_LINE =
  '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"file contents","is_error":false}]}}';

export const RESULT_LINE =
  '{"type":"result","subtype":"success","session_id":"sess_abc123","total_cost_usd":0.0123,"result":"Hello world"}';

/**
 * Routine, expected output that carries nothing this library models. These are
 * shapes the real CLI emits constantly: before, each one produced a `warning`
 * event carrying the full raw line, all the way to the browser.
 *
 * HOOK_STARTED_LINE was captured verbatim from a real `claude -p
 * --output-format stream-json --verbose` run (Claude Code 2.1.222); the rest
 * follow the documented Messages-API partial-message shapes.
 */
export const HOOK_STARTED_LINE =
  '{"type":"system","subtype":"hook_started","hook_id":"506ad4b5-32a3-4147-a5a6-3d8fc790e957","hook_name":"SessionStart:startup","hook_event":"SessionStart","uuid":"87cb92b5-29b2-44a4-a7ad-ca73a85b1af0"}';

export const IGNORABLE_STREAM_EVENT_LINES = [
  '{"type":"stream_event","event":{"type":"message_start","message":{"role":"assistant"}}}',
  '{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}}',
  '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{\\"a\\":"}}}',
  '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hmm"}}}',
  '{"type":"stream_event","event":{"type":"content_block_stop","index":0}}',
  '{"type":"stream_event","event":{"type":"message_stop"}}',
];

/** The completed assistant text message that accompanies the text deltas. */
export const ASSISTANT_TEXT_LINE =
  '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello world"}]}}';

/** The CLI echoing the user's own turn back. */
export const USER_ECHO_LINE =
  '{"type":"user","message":{"content":[{"type":"text","text":"say hello"}]}}';

/** A system message that does report a problem, and so should be surfaced. */
export const SYSTEM_API_ERROR_LINE =
  '{"type":"system","subtype":"api_error","message":"overloaded"}';

/**
 * A failed turn. Note it carries the same `session_id` / `total_cost_usd` as a
 * successful one - only `is_error` and the subtype distinguish it.
 */
export const ERROR_RESULT_LINE =
  '{"type":"result","subtype":"error_during_execution","session_id":"sess_abc123","total_cost_usd":0.02,"is_error":true,"result":"tool execution failed"}';

/** A failed turn signalled by subtype alone, with is_error absent. */
export const MAX_TURNS_RESULT_LINE =
  '{"type":"result","subtype":"error_max_turns","session_id":"sess_abc123","total_cost_usd":0.05,"result":""}';

export const MALFORMED_LINE = 'not json at all {{{';

export const UNRECOGNIZED_TYPE_LINE = '{"type":"some_future_event","foo":"bar"}';
