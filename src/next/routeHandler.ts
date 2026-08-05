import type { ClaudeErrorEvent, ClaudeEvent } from '../core/types.js';

export interface SessionLike {
  send(prompt: string): AsyncIterable<ClaudeEvent>;
}

/**
 * Prepares an event for the wire. `warning.raw` carries the raw CLI line it came
 * from, which can contain anything the subprocess printed - including file
 * contents surfaced by tool use - so it is dropped here rather than shipped to
 * a browser. The message itself is kept.
 */
function toWireEvent(event: ClaudeEvent): unknown {
  if (event.type === 'warning') {
    return { type: 'warning', message: event.message };
  }
  return event;
}

export function createClaudeRouteHandler(
  getSession: (req: Request) => Promise<SessionLike> | SessionLike
) {
  return async function handler(req: Request): Promise<Response> {
    const body = (await req.json().catch(() => null)) as { prompt?: unknown } | null;
    if (!body || typeof body.prompt !== 'string' || body.prompt.length === 0) {
      return new Response(JSON.stringify({ error: 'Request body must include a string "prompt"' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const session = await getSession(req);
    const events = session.send(body.prompt);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: unknown): void => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        try {
          for await (const event of events) {
            send(toWireEvent(event));
          }
        } catch (error) {
          // The process layer signals failure by making the event iteration
          // throw, so this is the path that carries ClaudeAuthError,
          // ClaudeNotFoundError and mid-stream crashes to the browser.
          send({
            type: 'error',
            name: error instanceof Error ? error.name : 'Error',
            message: error instanceof Error ? error.message : String(error),
          } satisfies ClaudeErrorEvent);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  };
}
