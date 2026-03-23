import {
  createAuditEvent,
  type AuditEvent,
  type AuditEventFields,
} from "@byom-ai/audit";

export type { AuditEvent, AuditEventFields };

export type AuditExportResult = Readonly<{
  exporterIndex: number;
  success: boolean;
  error?: unknown;
}>;

export interface AuditExporter {
  export(event: AuditEvent): void | Promise<void>;
}

/**
 * Audit event emitter for the bridge process.
 *
 * Forwards structured audit events to all registered exporters.
 * Exporter failures are caught and forwarded to onExportError but NEVER
 * propagate to the calling decision path — audit failure must not
 * interrupt request flow.
 */
export class AuditEmitter {
  readonly #exporters: AuditExporter[] = [];
  readonly #onExportError: ((error: unknown, exporterIndex: number) => void) | undefined;

  constructor(options: {
    onExportError?: (error: unknown, exporterIndex: number) => void;
  } = {}) {
    this.#onExportError = options.onExportError;
  }

  /** Register an exporter. Exporters receive every emitted event. */
  addExporter(exporter: AuditExporter): void {
    this.#exporters.push(exporter);
  }

  /**
   * Create and synchronously dispatch an audit event to all exporters.
   *
   * Exporters that return a Promise are executed in a fire-and-forget
   * manner. Errors are passed to onExportError and never re-thrown.
   *
   * Throws AuditSchemaError if the supplied fields are incomplete.
   */
  emit(fields: AuditEventFields & { metadata?: Record<string, unknown> }): void {
    const event = createAuditEvent(fields);
    for (let i = 0; i < this.#exporters.length; i++) {
      this.#runExporterFireAndForget(this.#exporters[i]!, event, i);
    }
  }

  /**
   * Async variant that awaits all exporters and returns a per-exporter
   * result array. Errors are still swallowed per the safety contract
   * (they appear in results with success: false).
   *
   * Throws AuditSchemaError if the supplied fields are incomplete.
   */
  async emitAsync(
    fields: AuditEventFields & { metadata?: Record<string, unknown> },
  ): Promise<readonly AuditExportResult[]> {
    const event = createAuditEvent(fields);
    const results: AuditExportResult[] = [];

    for (let i = 0; i < this.#exporters.length; i++) {
      try {
        await this.#exporters[i]!.export(event);
        results.push({ exporterIndex: i, success: true });
      } catch (error) {
        results.push({ exporterIndex: i, success: false, error });
        this.#onExportError?.(error, i);
      }
    }

    return Object.freeze(results);
  }

  /** Number of registered exporters. */
  get exporterCount(): number {
    return this.#exporters.length;
  }

  #runExporterFireAndForget(
    exporter: AuditExporter,
    event: AuditEvent,
    index: number,
  ): void {
    try {
      const result = exporter.export(event);
      if (result instanceof Promise) {
        result.catch((error: unknown) => {
          this.#onExportError?.(error, index);
        });
      }
    } catch (error) {
      this.#onExportError?.(error, index);
    }
  }
}
