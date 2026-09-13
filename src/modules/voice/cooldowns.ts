export class CooldownStore {
  private readonly expiresAt = new Map<string, number>();

  constructor(private readonly clock: () => number = () => Date.now()) {}

  check(key: string, seconds: number): boolean {
    const now = this.clock();
    const current = this.expiresAt.get(key) ?? 0;
    if (current > now) return false;
    this.expiresAt.set(key, now + seconds * 1000);
    return true;
  }

  remainingSeconds(key: string): number {
    const remaining = (this.expiresAt.get(key) ?? 0) - this.clock();
    return Math.max(0, Math.ceil(remaining / 1000));
  }
}
