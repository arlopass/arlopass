import {
    BYOMClient,
    type BYOMTransport,
} from "@byom-ai/web-sdk";
import { convertMessages } from "./convert-messages.js";
import { convertStream } from "./convert-stream.js";

export type BYOMChatTransportOptions = Readonly<{
    appId?: string;
    appSuffix?: string;
    appName?: string;
    appDescription?: string;
    appIcon?: string;
    client?: BYOMClient;
    timeoutMs?: number;
}>;

type SendMessagesOptions = Readonly<{
    trigger: "submit-message" | "regenerate-message";
    chatId: string;
    messageId: string | undefined;
    messages: ReadonlyArray<{
        id: string;
        role: "system" | "user" | "assistant";
        parts: ReadonlyArray<{ type: string; text?: string }>;
    }>;
    abortSignal: AbortSignal | undefined;
}>;

type ReconnectOptions = Readonly<{
    chatId: string;
}>;

type UIMessageChunkLike =
    | { type: "start" }
    | { type: "text-start"; id: string }
    | { type: "text-delta"; id: string; delta: string }
    | { type: "text-end"; id: string }
    | { type: "finish"; finishReason: string }
    | { type: "error"; errorText: string }
    | { type: "abort"; reason?: string };

function getInjectedTransport(): BYOMTransport | undefined {
    if (typeof window === "undefined") return undefined;
    return (window as Window & { byom?: BYOMTransport }).byom;
}

export class BYOMChatTransport {
    readonly #options: BYOMChatTransportOptions;
    #client: BYOMClient | undefined;
    #connectPromise: Promise<BYOMClient> | undefined;

    constructor(options: BYOMChatTransportOptions = {}) {
        this.#options = options;
        if (options.client !== undefined) {
            this.#client = options.client;
        }
    }

    async sendMessages(
        options: SendMessagesOptions,
    ): Promise<ReadableStream<UIMessageChunkLike>> {
        const client = await this.#ensureClient();

        if (client.selectedProvider === undefined) {
            throw new Error(
                "No provider selected. Open the BYOM extension and choose a model.",
            );
        }

        const chatMessages = convertMessages(options.messages as any);
        const signal = options.abortSignal;

        const iterable = client.chat.stream(
            { messages: chatMessages },
            signal !== undefined ? { signal } : undefined,
        );

        return convertStream(iterable, signal ?? undefined);
    }

    async reconnectToStream(
        _options: ReconnectOptions,
    ): Promise<ReadableStream<UIMessageChunkLike> | null> {
        return null;
    }

    async #ensureClient(): Promise<BYOMClient> {
        if (this.#client !== undefined) return this.#client;

        if (this.#connectPromise !== undefined) return this.#connectPromise;

        this.#connectPromise = this.#autoConnect();
        try {
            const client = await this.#connectPromise;
            this.#client = client;
            return client;
        } finally {
            this.#connectPromise = undefined;
        }
    }

    async #autoConnect(): Promise<BYOMClient> {
        const transport = getInjectedTransport();
        if (transport === undefined) {
            throw new Error(
                "BYOM extension not detected. Install it from https://byomai.com to use AI models.",
            );
        }

        const timeoutMs = this.#options.timeoutMs ?? 120_000;
        const origin =
            typeof window !== "undefined" ? window.location.origin : undefined;
        const client = new BYOMClient({
            transport,
            ...(origin !== undefined ? { origin } : {}),
            timeoutMs,
        });

        await client.connect({
            ...(this.#options.appId !== undefined
                ? { appId: this.#options.appId }
                : {}),
            ...(this.#options.appSuffix !== undefined
                ? { appSuffix: this.#options.appSuffix }
                : {}),
            ...(this.#options.appName !== undefined
                ? { appName: this.#options.appName }
                : {}),
            ...(this.#options.appDescription !== undefined
                ? { appDescription: this.#options.appDescription }
                : {}),
            ...(this.#options.appIcon !== undefined
                ? { appIcon: this.#options.appIcon }
                : {}),
        });

        return client;
    }
}
