export type ProviderModel = Readonly<{
  id: string;
  name: string;
}>;

export type ProviderStatus =
  | "connected"
  | "disconnected"
  | "attention"
  | "reconnecting"
  | "failed"
  | "revoked"
  | "degraded";

export type ConnectorSelectOption = Readonly<{
  value: string;
  label: string;
}>;

export type ConnectorField = Readonly<{
  key: string;
  label: string;
  type: "text" | "password" | "url" | "select";
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  helpText?: string;
  maxLength?: number;
  minLength?: number;
  options?: readonly ConnectorSelectOption[];
}>;

export type ConnectionTestResult = Readonly<{
  ok: boolean;
  status: ProviderStatus;
  message: string;
  models: readonly ProviderModel[];
  metadata?: Readonly<Record<string, string>>;
}>;

export type ConnectorDefinition = Readonly<{
  id: string;
  label: string;
  type: "local" | "cloud" | "cli";
  defaultName: string;
  fields: readonly ConnectorField[];
  testConnection(config: Readonly<Record<string, string>>): Promise<ConnectionTestResult>;
  sanitizeMetadata(config: Readonly<Record<string, string>>): Readonly<Record<string, string>>;
}>;

export type NativeMessageResult =
  | Readonly<{ ok: true; response: unknown }>
  | Readonly<{ ok: false; errorMessage: string }>;

export type CloudConnectorDependencies = Readonly<{
  sendNativeMessage: (
    hostName: string,
    message: Readonly<Record<string, unknown>>,
    options?: Readonly<{ timeoutMs?: number }>,
  ) => Promise<NativeMessageResult>;
  formatNativeHostRuntimeError: (rawMessage: string) => string;
  defaultNativeHostName?: string;
}>;

export type ConnectorValidationResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; message: string }>;

