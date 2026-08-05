#!/usr/bin/env node
// A stand-in for the real `claude` binary used only in tests: it reads the
// prompt from stdin (as the real CLI does in non-interactive mode) and prints a
// valid stream-json transcript, so the real child_process.spawn path can be
// exercised without a real installation or credentials.
//
// Reading stdin is load-bearing for the test: it proves the prompt is delivered
// over stdin rather than argv, and that the library closes stdin - otherwise
// this script, like the real CLI, would wait for EOF forever.
let prompt = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) {
  prompt += chunk;
}

// Fail loudly if the prompt leaked into argv instead of arriving over stdin.
const positional = process.argv
  .slice(2)
  .find((arg) => !arg.startsWith('-') && arg !== 'stream-json');
if (positional) {
  process.stderr.write(`fake CLI: unexpected positional argument in argv: ${positional}\n`);
  process.exit(2);
}

const reply = `Hello from fake CLI, you said: ${prompt}`;
const lines = [
  '{"type":"system","subtype":"init","session_id":"sess_smoke","model":"claude-opus-5"}',
  JSON.stringify({
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text: reply } },
  }),
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    session_id: 'sess_smoke',
    total_cost_usd: 0.001,
    is_error: false,
    result: reply,
  }),
];
for (const line of lines) {
  process.stdout.write(line + '\n');
}
