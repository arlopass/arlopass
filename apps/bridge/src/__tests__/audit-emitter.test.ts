/**
 * Tests for durable AuditEmitter behavior.
 *
 * Coverage:
 *  - bounded queueing and non-blocking emit path
 *  - deterministic retries with retry exhaustion
 *  - queue-full drop handling with explicit observability
 *  - sink unavailable behavior under bounded memory
 *  - async emitAsync retry/failure semantics
 */
import { describe, expect, it, vi } from "vitest";

import { AuditSchemaError } from "@byom-ai/audit";

import {
  AuditEmitter,
  AuditQueueCapacityError,
  type AuditEmitterLogEntry,
  type AuditEmitterMetric,
  type AuditExporter,
} from "../audit/audit-emitter.js";
import type { AuditEvent, AuditEventFields } from "../audit/audit-emitter.js";

function validFields(overrides: Partial<AuditEventFields> = {}): AuditEventFields {
  return {
    timestamp: "2026-03-23T10:00:00.000Z",
    origin: "https://app.example.com",
    providerId: "provider.ollama",
    modelId: "model.llama3",
    capability: "chat.stream",
    decision: "allow",
    reasonCode: "allow",
    correlationId: "cor.audit.001",
    policyVersion: "2026.03.23",
    ...overrides,
  };
}

function captureExporter(
  implementation?: (event: AuditEvent) => void | Promise<void>,
): {
  exporter: AuditExporter;
  received: AuditEvent[];
} {
  const received: AuditEvent[] = [];
  const exporter: AuditExporter = {
    export: vi.fn().mockImplementation((event: AuditEvent) => {
      received.push(event);
      return implementation?.(event);
    }),
  };
  return { exporter, received };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("AuditEmitter.emit", () => {
  it("queues events and exports asynchronously", async () => {
    const { exporter: exp1, received: r1 } = captureExporter();
    const { exporter: exp2, received: r2 } = captureExporter();
    const emitter = new AuditEmitter({ onLog: () => {} });
    emitter.addExporter(exp1);
    emitter.addExporter(exp2);

    emitter.emit(validFields());

    expect(r1).toHaveLength(0);
    expect(r2).toHaveLength(0);

    await emitter.waitForIdle();
    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
  });

  it("passes metadata through to the exported event", async () => {
    const { exporter, received } = captureExporter();
    const emitter = new AuditEmitter({ onLog: () => {} });
    emitter.addExporter(exporter);

    emitter.emit({
      ...validFields(),
      correlationId: "cor.audit.metadata",
      metadata: { requestSize: 512 },
    });
    await emitter.waitForIdle();

    expect(received[0]!.metadata).toMatchObject({ requestSize: 512 });
  });

  it("drops when queue capacity is reached and surfaces drop signals", async () => {
    const pending = createDeferred<void>();
    const metrics: AuditEmitterMetric[] = [];
    const logs: AuditEmitterLogEntry[] = [];
    const onExportError = vi.fn();
    const emitter = new AuditEmitter({
      maxQueueSize: 1,
      onMetric: (metric) => metrics.push(metric),
      onLog: (entry) => logs.push(entry),
      onExportError,
    });
    emitter.addExporter({
      export: () => pending.promise,
    });

    emitter.emit(validFields({ correlationId: "cor.audit.queue.1" }));
    emitter.emit(validFields({ correlationId: "cor.audit.queue.2" }));

    expect(onExportError).toHaveBeenCalledOnce();
    expect(onExportError).toHaveBeenCalledWith(
      expect.any(AuditQueueCapacityError),
      0,
    );
    expect(metrics.some((metric) => metric.name === "audit.export.dropped")).toBe(true);
    expect(logs.some((log) => log.reason === "queue_full")).toBe(true);

    pending.resolve();
    await emitter.waitForIdle();
  });

  it("retries transient failures and recovers", async () => {
    const metrics: AuditEmitterMetric[] = [];
    const logs: AuditEmitterLogEntry[] = [];
    const onExportError = vi.fn();
    let attempts = 0;
    const emitter = new AuditEmitter({
      maxAttempts: 3,
      retryBaseDelayMs: 0,
      maxRetryDelayMs: 0,
      onMetric: (metric) => metrics.push(metric),
      onLog: (entry) => logs.push(entry),
      onExportError,
    });
    emitter.addExporter({
      export: () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("transient sink outage");
        }
      },
    });

    emitter.emit(validFields({ correlationId: "cor.audit.recover" }));
    await emitter.waitForIdle();

    expect(attempts).toBe(3);
    const diagnostics = emitter.getDiagnostics();
    expect(diagnostics.retried).toBe(2);
    expect(diagnostics.failed).toBe(0);
    expect(diagnostics.succeeded).toBe(1);
    expect(onExportError).toHaveBeenCalledTimes(2);
    expect(metrics.filter((metric) => metric.name === "audit.export.retried")).toHaveLength(2);
    expect(metrics.filter((metric) => metric.name === "audit.export.succeeded")).toHaveLength(1);
    expect(logs.filter((log) => log.reason === "retry_scheduled")).toHaveLength(2);
  });

  it("marks export as failed when retries are exhausted", async () => {
    const metrics: AuditEmitterMetric[] = [];
    const logs: AuditEmitterLogEntry[] = [];
    const onExportError = vi.fn();
    const emitter = new AuditEmitter({
      maxAttempts: 3,
      retryBaseDelayMs: 0,
      maxRetryDelayMs: 0,
      onMetric: (metric) => metrics.push(metric),
      onLog: (entry) => logs.push(entry),
      onExportError,
    });
    emitter.addExporter({
      export: () => {
        throw new Error("sink unavailable");
      },
    });

    emitter.emit(validFields({ correlationId: "cor.audit.exhaust" }));
    await emitter.waitForIdle();

    const diagnostics = emitter.getDiagnostics();
    expect(diagnostics.retried).toBe(2);
    expect(diagnostics.failed).toBe(1);
    expect(diagnostics.succeeded).toBe(0);
    expect(onExportError).toHaveBeenCalledTimes(3);
    expect(metrics.filter((metric) => metric.name === "audit.export.failed")).toHaveLength(1);
    expect(logs.some((log) => log.reason === "retry_exhausted")).toBe(true);
  });

  it("continues dispatching to healthy exporters when another exporter is stalled", async () => {
    const stalled = createDeferred<void>();
    const stalledExporter: AuditExporter = {
      export: vi.fn().mockImplementation(() => stalled.promise),
    };
    const healthyExporter: AuditExporter = {
      export: vi.fn(),
    };
    const emitter = new AuditEmitter({ onLog: () => {} });
    emitter.addExporter(stalledExporter);
    emitter.addExporter(healthyExporter);

    emitter.emit(validFields({ correlationId: "cor.audit.stalled" }));

    await Promise.resolve();
    await Promise.resolve();

    expect(healthyExporter.export).toHaveBeenCalledTimes(1);
    expect(stalledExporter.export).toHaveBeenCalledTimes(1);

    stalled.resolve();
    await emitter.waitForIdle();
  });

  it("keeps bounded memory when sink is unavailable under spikes", async () => {
    const onExportError = vi.fn();
    const emitter = new AuditEmitter({
      maxQueueSize: 2,
      maxAttempts: 1,
      onLog: () => {},
      onExportError,
    });
    emitter.addExporter({
      export: () => new Promise<void>(() => {}),
    });

    expect(() => {
      emitter.emit(validFields({ correlationId: "cor.audit.sink.1" }));
      emitter.emit(validFields({ correlationId: "cor.audit.sink.2" }));
      emitter.emit(validFields({ correlationId: "cor.audit.sink.3" }));
    }).not.toThrow();

    await Promise.resolve();
    const diagnostics = emitter.getDiagnostics();
    expect(diagnostics.queueDepth).toBeLessThanOrEqual(2);
    expect(diagnostics.dropped).toBe(1);
    expect(onExportError).toHaveBeenCalledWith(
      expect.any(AuditQueueCapacityError),
      0,
    );
  });

  it("works with zero exporters registered", async () => {
    const emitter = new AuditEmitter({ onLog: () => {} });
    expect(() => emitter.emit(validFields())).not.toThrow();
    await emitter.waitForIdle();
    expect(emitter.getDiagnostics().queueDepth).toBe(0);
  });

  it("throws AuditSchemaError when required fields are missing", () => {
    const emitter = new AuditEmitter({ onLog: () => {} });
    const incomplete = { ...validFields(), correlationId: "" } as AuditEventFields;
    expect(() => emitter.emit(incomplete)).toThrow(AuditSchemaError);
  });
});

describe("AuditEmitter.emitAsync", () => {
  it("awaits exporters and returns successful results", async () => {
    const { exporter: exp1 } = captureExporter();
    const { exporter: exp2 } = captureExporter();
    const emitter = new AuditEmitter({
      retryBaseDelayMs: 0,
      maxRetryDelayMs: 0,
      onLog: () => {},
    });
    emitter.addExporter(exp1);
    emitter.addExporter(exp2);

    const results = await emitter.emitAsync(validFields());

    expect(results).toHaveLength(2);
    expect(results[0]!.success).toBe(true);
    expect(results[1]!.success).toBe(true);
  });

  it("retries and returns a failure result when attempts are exhausted", async () => {
    const onExportError = vi.fn();
    const emitter = new AuditEmitter({
      maxAttempts: 3,
      retryBaseDelayMs: 0,
      maxRetryDelayMs: 0,
      onLog: () => {},
      onExportError,
    });
    emitter.addExporter({
      export: async () => {
        throw new Error("async unavailable");
      },
    });

    const results = await emitter.emitAsync(validFields({ correlationId: "cor.audit.async" }));

    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(false);
    expect(results[0]!.error).toBeInstanceOf(Error);
    expect(onExportError).toHaveBeenCalledTimes(3);
  });

  it("throws AuditSchemaError before export when fields are invalid", async () => {
    const emitter = new AuditEmitter({ onLog: () => {} });
    const incomplete = { ...validFields(), correlationId: "" } as AuditEventFields;
    await expect(emitter.emitAsync(incomplete)).rejects.toThrow(AuditSchemaError);
  });
});

describe("AuditEmitter.exporterCount", () => {
  it("reflects the number of registered exporters", () => {
    const emitter = new AuditEmitter({ onLog: () => {} });
    expect(emitter.exporterCount).toBe(0);

    emitter.addExporter({ export: vi.fn() });
    expect(emitter.exporterCount).toBe(1);

    emitter.addExporter({ export: vi.fn() });
    expect(emitter.exporterCount).toBe(2);
  });
});
