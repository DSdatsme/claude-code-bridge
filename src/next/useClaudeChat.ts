import { useCallback, useState } from 'react';
import type { ClaudeEvent } from '../core/types.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface UseClaudeChatOptions {
  api: string;
}

export interface UseClaudeChatResult {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: Error | null;
  sendMessage: (text: string) => Promise<void>;
}

export function useClaudeChat(options: UseClaudeChatOptions): UseClaudeChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      setError(null);
      setIsStreaming(true);
      setMessages((prev) => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '' }]);

      try {
        const response = await fetch(options.api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text }),
        });

        if (!response.body) {
          throw new Error('Response had no readable body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() ?? '';

          for (const chunk of chunks) {
            const line = chunk.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            const event = JSON.parse(line.slice('data: '.length)) as ClaudeEvent;

            if (event.type === 'text_delta') {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                next[next.length - 1] = { ...last, content: last.content + event.text };
                return next;
              });
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsStreaming(false);
      }
    },
    [options.api]
  );

  return { messages, isStreaming, error, sendMessage };
}
