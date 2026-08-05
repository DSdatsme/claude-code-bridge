import type { ClaudeEvent } from '../core/types.js';

export interface SessionLike {
  send(prompt: string): AsyncIterable<ClaudeEvent>;
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
        try {
          for await (const event of events) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'warning', message, raw: '' })}\n\n`)
          );
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
