import { describe, it, expect } from 'vitest';
import { AsyncEventQueue } from '../../src/core/asyncEventQueue.js';

describe('AsyncEventQueue', () => {
  it('yields values pushed before consumption starts', async () => {
    const queue = new AsyncEventQueue<number>();
    queue.push(1);
    queue.push(2);
    queue.finish();

    const seen: number[] = [];
    for await (const value of queue) {
      seen.push(value);
    }
    expect(seen).toEqual([1, 2]);
  });

  it('yields values pushed after consumption has already started', async () => {
    const queue = new AsyncEventQueue<string>();
    const seen: string[] = [];

    const consume = (async () => {
      for await (const value of queue) {
        seen.push(value);
      }
    })();

    queue.push('a');
    await new Promise((resolve) => setTimeout(resolve, 0));
    queue.push('b');
    queue.finish();
    await consume;

    expect(seen).toEqual(['a', 'b']);
  });

  it('resolves a pending next() call when finish() is called', async () => {
    const queue = new AsyncEventQueue<number>();
    const iterator = queue[Symbol.asyncIterator]();

    // Start a next() call with no prior push - creates a pending waiter
    const nextPromise = iterator.next();

    // Call finish() while the next() is pending
    queue.finish();

    // The pending next() should resolve to done:true
    const result = await nextPromise;
    expect(result).toEqual({ value: undefined, done: true });
  });

  it('resolves multiple concurrent pending next() calls when finish() is called', async () => {
    const queue = new AsyncEventQueue<number>();
    const iterator1 = queue[Symbol.asyncIterator]();
    const iterator2 = queue[Symbol.asyncIterator]();

    // Create two pending next() calls
    const promise1 = iterator1.next();
    const promise2 = iterator2.next();

    // Call finish()
    queue.finish();

    // Both pending calls should resolve to done:true
    const result1 = await promise1;
    const result2 = await promise2;
    expect(result1).toEqual({ value: undefined, done: true });
    expect(result2).toEqual({ value: undefined, done: true });
  });

  it('ignores push() calls after finish()', async () => {
    const queue = new AsyncEventQueue<number>();
    const iterator = queue[Symbol.asyncIterator]();

    // Push a value, start consuming, then finish
    queue.push(1);
    queue.finish();

    // Consume the one buffered value
    const result1 = await iterator.next();
    expect(result1).toEqual({ value: 1, done: false });

    // Try to push after finish - should be a no-op
    queue.push(2);

    // Next call should be done, not yield the pushed value
    const result2 = await iterator.next();
    expect(result2).toEqual({ value: undefined, done: true });
  });
});
