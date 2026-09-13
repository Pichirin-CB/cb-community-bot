export class AsyncLock {
  private readonly locks = new Set<string>();

  async run<T>(key: string, action: () => Promise<T>): Promise<T> {
    if (this.locks.has(key)) throw new Error("Operacion concurrente ya en curso.");
    this.locks.add(key);
    try {
      return await action();
    } finally {
      this.locks.delete(key);
    }
  }
}
