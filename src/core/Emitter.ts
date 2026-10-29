type Handler<T> = (payload: T) => void;

/** Emissor de eventos tipado e minimalista. */
export class Emitter<Events extends Record<string, unknown>> {
  private handlers: { [K in keyof Events]?: Handler<Events[K]>[] } = {};

  on<K extends keyof Events>(type: K, fn: Handler<Events[K]>): () => void {
    (this.handlers[type] ??= []).push(fn);
    return () => {
      const list = this.handlers[type];
      if (list) this.handlers[type] = list.filter((h) => h !== fn);
    };
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const list = this.handlers[type];
    if (list) for (const h of list) h(payload);
  }

  clear(): void {
    this.handlers = {};
  }
}
