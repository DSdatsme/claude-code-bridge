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

export const MALFORMED_LINE = 'not json at all {{{';

export const UNRECOGNIZED_TYPE_LINE = '{"type":"some_future_event","foo":"bar"}';
