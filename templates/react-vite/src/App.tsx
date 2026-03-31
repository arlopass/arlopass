import { useConnection, useProviders, useChat } from "@arlopass/react";
import {
  ArlopassRequiredGate,
  ArlopassConnected,
  ArlopassDisconnected,
  ArlopassHasError,
} from "@arlopass/react/guards";

function InstallPrompt({ installUrl }: { installUrl: string }) {
  return (
    <div className="container">
      <h1>Arlopass React Starter</h1>
      <div className="notice">
        <p>
          <strong>Arlopass extension not detected.</strong>
        </p>
        <p>
          Install the{" "}
          <a href={installUrl} target="_blank" rel="noopener noreferrer">
            Arlopass browser extension
          </a>{" "}
          to get started.
        </p>
      </div>
    </div>
  );
}

function Chat() {
  const { isConnecting } = useConnection();
  const { providers, selectedProvider } = useProviders();
  const {
    messages,
    streamingContent,
    isStreaming,
    isSending,
    error: chatError,
    stream,
    stop,
  } = useChat();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("message") as HTMLInputElement;
    const value = input.value.trim();
    if (!value || isStreaming || isSending) return;
    input.value = "";
    stream(value);
  };

  return (
    <div className="container">
      <header>
        <h1>Arlopass React Starter</h1>

        <ArlopassDisconnected>
          {() => (
            <p className="status">
              {isConnecting ? "Connecting to Arlopass…" : "Disconnected"}
            </p>
          )}
        </ArlopassDisconnected>

        <ArlopassHasError>
          {() => (
            <p className="status">Connection error — check the extension.</p>
          )}
        </ArlopassHasError>

        <ArlopassConnected>
          {() =>
            selectedProvider ? (
              <p className="status connected">
                Connected — {selectedProvider.providerId} /{" "}
                {selectedProvider.modelId}
              </p>
            ) : providers.length > 0 ? (
              <p className="status">
                Select a provider in the Arlopass extension popup.
              </p>
            ) : null
          }
        </ArlopassConnected>
      </header>

      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <span className="role">{msg.role}</span>
            <p>{msg.content}</p>
          </div>
        ))}
        {isStreaming && streamingContent && (
          <div className="message assistant streaming">
            <span className="role">assistant</span>
            <p>{streamingContent}</p>
          </div>
        )}
      </div>

      {chatError && (
        <div className="notice">
          <p>{chatError.message}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="input-form">
        <input
          name="message"
          type="text"
          placeholder={
            selectedProvider
              ? "Type a message…"
              : "Waiting for provider selection…"
          }
          disabled={!selectedProvider || isStreaming || isSending}
          autoComplete="off"
        />
        {isStreaming ? (
          <button type="button" onClick={stop} className="stop-btn">
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!selectedProvider || isSending}>
            Send
          </button>
        )}
      </form>
    </div>
  );
}

export function App() {
  return (
    <ArlopassRequiredGate
      fallback={({ installUrl }) => <InstallPrompt installUrl={installUrl} />}
    >
      <Chat />
    </ArlopassRequiredGate>
  );
}
