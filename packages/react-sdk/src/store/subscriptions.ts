type Listener = () => void;

export class Subscriptions {
  #listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  notify(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }

  clear(): void {
    this.#listeners.clear();
  }
}
