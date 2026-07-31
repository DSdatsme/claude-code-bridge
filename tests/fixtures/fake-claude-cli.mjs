#!/usr/bin/env node
// A stand-in for the real `claude` binary used only in tests: it ignores
// its arguments and prints a fixed, valid stream-json transcript so the
// real child_process.spawn path can be exercised without a real
// installation or credentials.
const lines = [
  '{"type":"system","subtype":"init","session_id":"sess_smoke","model":"claude-opus-5"}',
  '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello from fake CLI"}}}',
  '{"type":"result","subtype":"success","session_id":"sess_smoke","total_cost_usd":0.001,"result":"Hello from fake CLI"}',
];
for (const line of lines) {
  process.stdout.write(line + '\n');
}
