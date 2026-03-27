import { describe, expect, it } from "vitest";

import { ArlopassInvalidStateTransitionError } from "../errors.js";
import { ArlopassStateMachine } from "../state-machine.js";

describe("ArlopassStateMachine", () => {
  it("supports valid deterministic transitions", () => {
    const machine = new ArlopassStateMachine();

    expect(machine.state).toBe("disconnected");
    machine.transition("connecting");
    machine.transition("connected");
    machine.transition("degraded");
    machine.transition("reconnecting");
    machine.transition("connected");
    machine.transition("disconnected");

    expect(machine.state).toBe("disconnected");
    expect(machine.history).toEqual([
      { from: "disconnected", to: "connecting" },
      { from: "connecting", to: "connected" },
      { from: "connected", to: "degraded" },
      { from: "degraded", to: "reconnecting" },
      { from: "reconnecting", to: "connected" },
      { from: "connected", to: "disconnected" },
    ]);
  });

  it("rejects invalid transitions", () => {
    const machine = new ArlopassStateMachine();

    expect(() => machine.transition("connected")).toThrowError(
      ArlopassInvalidStateTransitionError,
    );

    expect(machine.state).toBe("disconnected");
  });

  it("allows recovery from failed state only through supported edges", () => {
    const machine = new ArlopassStateMachine();

    machine.transition("connecting");
    machine.transition("failed");

    expect(machine.canTransition("connected")).toBe(false);
    expect(machine.canTransition("reconnecting")).toBe(true);

    machine.transition("reconnecting");
    machine.transition("connected");
    expect(machine.state).toBe("connected");
  });
});
