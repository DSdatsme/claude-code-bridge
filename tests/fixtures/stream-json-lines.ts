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
