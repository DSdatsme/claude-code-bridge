import type { ClaudeErrorEvent, ClaudeEvent } from '../core/types.js';

export interface SessionLike {
  send(prompt: string): AsyncIterable<ClaudeEvent>;
}

interface Cancellable {
  kill(): void;
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

    // `SessionLike` only promises an AsyncIterable, so that a plain async
    // generator still satisfies it. A ClaudeSession additionally returns a
    // cancellable stream; use that when it is there.
    const cancel = (events as Partial<Cancellable>).kill;
    const cancelTurn = (): void => {
      if (typeof cancel === 'function') cancel.call(events);
    };

    // A disconnected client must not leave `claude` running on the server.
    let writable = true;
    const onAbort = (): void => {
      writable = false;
      cancelTurn();
    };
    req.signal?.addEventListener('abort', onAbort, { once: true });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: unknown): void => {
          if (!writable) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            // The consumer went away between events; stop writing to a stream
            // that is no longer accepting data.
            writable = false;
          }
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
          req.signal?.removeEventListener('abort', onAbort);
          // Always attempt to close: anything still reading needs to see the end
          // of the stream. Throws only if the consumer already tore it down.
          try {
            controller.close();
          } catch {
            // already closed or cancelled by the consumer
          }
        }
      },
      cancel() {
        // The browser closed the connection.
        writable = false;
        cancelTurn();
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
