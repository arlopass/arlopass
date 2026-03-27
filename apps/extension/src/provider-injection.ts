import type {
  ArlopassTransport,
  TransportRequest,
  TransportResponse,
  TransportStream,
} from "@arlopass/web-sdk";

const DEFAULT_PROPERTY_NAME = "arlopass";
const INJECTED_PROVIDER_TAG = Symbol.for("arlopass.extension.injected-provider");

export type InjectedProviderMetadata = Readonly<{
  source: "arlopass-extension";
  protocolVersion: string;
  extensionVersion?: string;
}>;

export interface InjectedArlopassProvider extends ArlopassTransport {
  readonly metadata: InjectedProviderMetadata;
  readonly [INJECTED_PROVIDER_TAG]: true;
}

export type ProviderInjectionOptions = Readonly<{
  transport: ArlopassTransport;
  target?: Record<string, unknown>;
  propertyName?: string;
  overwrite?: boolean;
  metadata?: InjectedProviderMetadata;
}>;

export type ProviderInjectionHandle = Readonly<{
  provider: InjectedArlopassProvider;
  propertyName: string;
  dispose(): void;
}>;

export class ProviderInjectionError extends Error {
  readonly code:
    | "invalid-target"
    | "invalid-property-name"
    | "property-conflict"
    | "injection-failed"
    | "transport-failed";

  constructor(
    message: string,
    code:
      | "invalid-target"
      | "invalid-property-name"
      | "property-conflict"
      | "injection-failed"
      | "transport-failed",
    options: Readonly<{ cause?: Error }> = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "ProviderInjectionError";
    this.code = code;
  }
}

function defaultTarget(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

function validatePropertyName(propertyName: string): string {
  const normalized = propertyName.trim();
  if (normalized.length === 0) {
    throw new ProviderInjectionError(
      "Provider injection property name must be non-empty.",
      "invalid-property-name",
    );
  }

  return normalized;
}

function validateTarget(target: unknown): Record<string, unknown> {
  if (typeof target !== "object" || target === null) {
    throw new ProviderInjectionError(
      "Provider injection target must be an object.",
      "invalid-target",
    );
  }

  return target as Record<string, unknown>;
}

function toProviderInjectionError(
  message: string,
  error: unknown,
): ProviderInjectionError {
  const causeError = error instanceof Error ? error : undefined;
  return new ProviderInjectionError(message, "transport-failed", {
    ...(causeError !== undefined ? { cause: causeError } : {}),
  });
}

function createInjectedProvider(
  transport: ArlopassTransport,
  metadata: InjectedProviderMetadata,
): InjectedArlopassProvider {
  const provider: InjectedArlopassProvider = {
    metadata,
    [INJECTED_PROVIDER_TAG]: true,
    request: async <TRequestPayload, TResponsePayload>(
      request: TransportRequest<TRequestPayload>,
    ): Promise<TransportResponse<TResponsePayload>> => {
      try {
        return await transport.request<TRequestPayload, TResponsePayload>(request);
      } catch (error) {
        throw toProviderInjectionError(
          "Injected provider request failed.",
          error,
        );
      }
    },
    stream: async <TRequestPayload, TResponsePayload>(
      request: TransportRequest<TRequestPayload>,
    ): Promise<TransportStream<TResponsePayload>> => {
      try {
        const stream = await transport.stream<TRequestPayload, TResponsePayload>(
          request,
        );
        const iterator = stream[Symbol.asyncIterator];
        if (typeof iterator !== "function") {
          throw new ProviderInjectionError(
            "Injected transport stream must be async iterable.",
            "transport-failed",
          );
        }

        const wrappedStream = async function* (): AsyncIterable<
          TransportResponse<TResponsePayload>
        > {
          try {
            for await (const chunk of stream) {
              yield chunk;
            }
          } catch (error) {
            throw toProviderInjectionError(
              "Injected provider stream failed.",
              error,
            );
          }
        }

        return wrappedStream();
      } catch (error) {
        if (error instanceof ProviderInjectionError) {
          throw error;
        }

        throw toProviderInjectionError(
          "Injected provider stream initialization failed.",
          error,
        );
      }
    },
    disconnect: async (sessionId: string): Promise<void> => {
      if (transport.disconnect === undefined) {
        return;
      }

      try {
        await transport.disconnect(sessionId);
      } catch (error) {
        throw toProviderInjectionError(
          "Injected provider disconnect failed.",
          error,
        );
      }
    },
  };

  return Object.freeze(provider);
}

function isInjectedProvider(value: unknown): value is InjectedArlopassProvider {
  return (
    typeof value === "object" &&
    value !== null &&
    INJECTED_PROVIDER_TAG in value &&
    (value as { [INJECTED_PROVIDER_TAG]?: unknown })[INJECTED_PROVIDER_TAG] === true
  );
}

function createDefaultMetadata(): InjectedProviderMetadata {
  return {
    source: "arlopass-extension",
    protocolVersion: "1.0.0",
  };
}

export function injectProvider(options: ProviderInjectionOptions): ProviderInjectionHandle {
  const target = validateTarget(options.target ?? defaultTarget());
  const propertyName = validatePropertyName(options.propertyName ?? DEFAULT_PROPERTY_NAME);
  const overwrite = options.overwrite ?? false;
  const metadata = options.metadata ?? createDefaultMetadata();
  const provider = createInjectedProvider(options.transport, metadata);

  const existing = target[propertyName];
  if (existing !== undefined && !overwrite) {
    throw new ProviderInjectionError(
      `Global property "${propertyName}" already exists.`,
      "property-conflict",
    );
  }

  if (existing !== undefined && overwrite && !isInjectedProvider(existing)) {
    throw new ProviderInjectionError(
      `Global property "${propertyName}" cannot be overwritten because it is not a Arlopass extension provider.`,
      "property-conflict",
    );
  }

  try {
    Object.defineProperty(target, propertyName, {
      configurable: true,
      enumerable: false,
      writable: false,
      value: provider,
    });
  } catch (error) {
    const causeError = error instanceof Error ? error : undefined;
    throw new ProviderInjectionError(
      `Failed to inject provider into "${propertyName}".`,
      "injection-failed",
      causeError !== undefined ? { cause: causeError } : undefined,
    );
  }

  let disposed = false;
  const dispose = (): void => {
    if (disposed) {
      return;
    }

    disposed = true;
    const current = target[propertyName];
    if (current !== provider) {
      return;
    }

    try {
      delete target[propertyName];
    } catch (error) {
      const causeError = error instanceof Error ? error : undefined;
      throw new ProviderInjectionError(
        `Failed to remove injected provider from "${propertyName}".`,
        "injection-failed",
        causeError !== undefined ? { cause: causeError } : undefined,
      );
    }
  };

  return {
    provider,
    propertyName,
    dispose,
  };
}

export function isInjectedArlopassProvider(value: unknown): value is InjectedArlopassProvider {
  return isInjectedProvider(value);
}

declare global {
  interface Window {
    arlopass?: InjectedArlopassProvider;
  }
}
