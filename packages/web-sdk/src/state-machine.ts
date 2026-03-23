import { BYOMInvalidStateTransitionError } from "./errors.js";
import type { ClientState } from "./types.js";

export const STATE_TRANSITIONS: Readonly<Record<ClientState, readonly ClientState[]>> = {
  disconnected: ["connecting"],
  connecting: ["connected", "failed", "disconnected"],
  connected: ["degraded", "failed", "disconnected"],
  degraded: ["reconnecting", "failed", "disconnected"],
  reconnecting: ["connected", "failed", "disconnected"],
  failed: ["reconnecting", "disconnected"],
};

export type StateTransition = Readonly<{
  from: ClientState;
  to: ClientState;
}>;

export class BYOMStateMachine {
  #state: ClientState;
  #history: StateTransition[];

  constructor(initialState: ClientState = "disconnected") {
    this.#state = initialState;
    this.#history = [];
  }

  get state(): ClientState {
    return this.#state;
  }

  get history(): readonly StateTransition[] {
    return this.#history;
  }

  canTransition(to: ClientState): boolean {
    return STATE_TRANSITIONS[this.#state].includes(to);
  }

  transition(to: ClientState): ClientState {
    if (!this.canTransition(to)) {
      throw new BYOMInvalidStateTransitionError(
        `Invalid state transition from "${this.#state}" to "${to}".`,
        {
          details: {
            from: this.#state,
            to,
          },
        },
      );
    }

    const from = this.#state;
    this.#state = to;
    this.#history.push({ from, to });

    return this.#state;
  }
}
