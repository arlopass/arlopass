/**
 * Chaos test: bridge-restart
 *
 * Simulates the chaos scenario where the bridge process is killed and
 * restarted, verifying that:
 *   1. In-flight requests fail deterministically when the bridge is down.
 *   2. New requests succeed after the bridge restarts.
 *   3. Telemetry tracks failure and recovery events correctly.
 *
 * No external processes are spawned; all I/O is mocked.
 */
import { describe, it, expect, beforeEach } from "vitest";

import {
  TelemetryMetrics,
  TELEMETRY_METRIC_NAMES,
  type MetricPoint,
} from "@arlopass/telemetry";

// ---------------------------------------------------------------------------
// Minimal mock bridge transport (no network, no process)
// ---------------------------------------------------------------------------

type BridgeMessage = { type: string;[k: string]: unknown };
type HandleFn = (msg: BridgeMessage) => BridgeMessage;

class MockBridgeProcess {
  #alive = true;
  #requestsHandled = 0;
  readonly #handler: HandleFn;

  constructor(handler: HandleFn) {
    this.#handler = handler;
  }

  get isAlive(): boolean {
    return this.#alive;
  }

  get requestsHandled(): number {
    return this.#requestsHandled;
  }

  handle(msg: BridgeMessage): BridgeMessage {
    if (!this.#alive) {
      throw new Error("Bridge is unavailable (process not running)");
    }
    this.#requestsHandled += 1;
    return this.#handler(msg);
  }

  kill(): void {
    this.#alive = false;
  }

  restart(): void {
    this.#alive = true;
    this.#requestsHandled = 0;
  }
}

// ---------------------------------------------------------------------------
// Client-side bridge proxy that records telemetry
// ---------------------------------------------------------------------------

class BridgeClient {
  readonly #metrics: TelemetryMetrics;
  #bridge: MockBridgeProcess | undefined;

  constructor(metrics: TelemetryMetrics) {
    this.#metrics = metrics;
  }

  connect(bridge: MockBridgeProcess): void {
    this.#bridge = bridge;
  }

  disconnect(): void {
    this.#bridge = undefined;
  }

  send(msg: BridgeMessage): BridgeMessage {
    const startMs = Date.now();
    const meta = {
      correlationId: `bridge.${msg.type}`,
      origin: "https://app.arlopass.local",
      providerId: "bridge",
      messageType: msg.type,
    };

    if (this.#bridge === undefined || !this.#bridge.isAlive) {
      this.#metrics.emit({
        name: TELEMETRY_METRIC_NAMES.REQUEST_FAILURE_TOTAL,
        value: 1,
        metadata: meta,
      });
      throw new Error("Bridge is unavailable");
    }

    try {
      const result = this.#bridge.handle(msg);
      this.#metrics.emit({
        name: TELEMETRY_METRIC_NAMES.REQUEST_TOTAL,
        value: 1,
        metadata: meta,
      });
      this.#metrics.emit({
        name: TELEMETRY_METRIC_NAMES.REQUEST_DURATION_MS,
        value: Date.now() - startMs,
        metadata: meta,
      });
      return result;
    } catch (err) {
      this.#metrics.emit({
        name: TELEMETRY_METRIC_NAMES.REQUEST_FAILURE_TOTAL,
        value: 1,
        metadata: meta,
      });
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countMetrics(points: readonly MetricPoint[], name: string): number {
  return points
    .filter((p) => p.name === name)
    .reduce((sum, p) => sum + p.value, 0);
}

const echoHandler: HandleFn = (msg) => ({ type: `${msg.type}.ack` });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Chaos: bridge restart", () => {
  let metrics: TelemetryMetrics;
  let bridge: MockBridgeProcess;
  let client: BridgeClient;

  beforeEach(() => {
    metrics = new TelemetryMetrics();
    bridge = new MockBridgeProcess(echoHandler);
    client = new BridgeClient(metrics);
    client.connect(bridge);
  });

  it("handles requests normally before any disruption", () => {
    const response = client.send({ type: "handshake.challenge" });
    expect(response.type).toBe("handshake.challenge.ack");

    const recorded = metrics.getRecordedMetrics();
    expect(
      countMetrics(recorded, TELEMETRY_METRIC_NAMES.REQUEST_TOTAL),
    ).toBe(1);
    expect(
      countMetrics(recorded, TELEMETRY_METRIC_NAMES.REQUEST_FAILURE_TOTAL),
    ).toBe(0);
  });

  it("records failures when bridge is killed", () => {
    client.send({ type: "handshake.challenge" }); // succeeds
    bridge.kill();

    expect(() => client.send({ type: "grant.sync" })).toThrow("Bridge is unavailable");

    const recorded = metrics.getRecordedMetrics();
    expect(
      countMetrics(recorded, TELEMETRY_METRIC_NAMES.REQUEST_FAILURE_TOTAL),
    ).toBeGreaterThanOrEqual(1);
  });

  it("recovers after bridge restart with no residual failure state", () => {
    bridge.kill();

    let failureCount = 0;
    for (let i = 0; i < 3; i++) {
      try {
        client.send({ type: "request.check" });
      } catch {
        failureCount += 1;
      }
    }
    expect(failureCount).toBe(3);

    bridge.restart();
    const result = client.send({ type: "handshake.challenge" });
    expect(result.type).toBe("handshake.challenge.ack");

    const recorded = metrics.getRecordedMetrics();
    const successes = countMetrics(
      recorded,
      TELEMETRY_METRIC_NAMES.REQUEST_TOTAL,
    );
    const failures = countMetrics(
      recorded,
      TELEMETRY_METRIC_NAMES.REQUEST_FAILURE_TOTAL,
    );
    expect(successes).toBe(1); // only the post-restart request succeeded
    expect(failures).toBe(3);
  });

  it("emits duration metrics only for successful requests", () => {
    client.send({ type: "handshake.challenge" });
    bridge.kill();
    try {
      client.send({ type: "grant.sync" });
    } catch {
      // expected
    }

    const durationPoints = metrics
      .getRecordedMetrics()
      .filter((p) => p.name === TELEMETRY_METRIC_NAMES.REQUEST_DURATION_MS);
    expect(durationPoints).toHaveLength(1); // only the successful request
    expect(durationPoints[0]?.value).toBeGreaterThanOrEqual(0);
  });

  it("does not accumulate failure metrics after a clean reconnect", () => {
    bridge.kill();
    try { client.send({ type: "request.check" }); } catch { /* expected */ }

    bridge.restart();
    metrics.reset();

    client.send({ type: "handshake.challenge" });
    client.send({ type: "handshake.challenge" });

    const recorded = metrics.getRecordedMetrics();
    expect(
      countMetrics(recorded, TELEMETRY_METRIC_NAMES.REQUEST_FAILURE_TOTAL),
    ).toBe(0);
    expect(
      countMetrics(recorded, TELEMETRY_METRIC_NAMES.REQUEST_TOTAL),
    ).toBe(2);
  });
});
