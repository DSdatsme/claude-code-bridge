export class AsyncEventQueue<T> implements AsyncIterable<T> {
  private buffered: T[] = [];
  private waiting: Array<(result: IteratorResult<T>) => void> = [];
  private finished = false;

  push(value: T): void {
    const waiter = this.waiting.shift();
    if (waiter) {
      waiter({ value, done: false });
    } else {
      this.buffered.push(value);
    }
  }

  finish(): void {
    this.finished = true;
    while (this.waiting.length > 0) {
      const waiter = this.waiting.shift();
      waiter?.({ value: undefined as unknown as T, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.buffered.length > 0) {
          return Promise.resolve({ value: this.buffered.shift() as T, done: false });
        }
        if (this.finished) {
          return Promise.resolve({ value: undefined as unknown as T, done: true });
        }
        return new Promise((resolve) => {
          this.waiting.push(resolve);
        });
      },
    };
  }
}
