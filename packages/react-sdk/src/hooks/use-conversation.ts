"use client";

import { useCallback, useRef, useState } from "react";
import { ConversationManager } from "@byom-ai/web-sdk";
import type { BYOMSDKError } from "@byom-ai/web-sdk";
import type {
    ChatMessage,
    ChatSubscribe,
    MessageId,
    ToolDefinition,
    TrackedChatMessage,
} from "../types.js";
import { Subscriptions } from "../store/subscriptions.js";
import { useBYOMContext } from "./use-store.js";

function generateMessageId(): MessageId {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

type UseConversationOptions = {
    initialMessages?: TrackedChatMessage[];
    systemPrompt?: string;
    tools?: ToolDefinition[];
    maxTokens?: number;
    maxToolRounds?: number;
    primeTools?: boolean;
    hideToolCalls?: boolean;
};

type UseConversationReturn = Readonly<{
    messages: readonly TrackedChatMessage[];
    streamingContent: string;
    streamingMessageId: MessageId | null;
    isStreaming: boolean;
    isSending: boolean;
    error: BYOMSDKError | null;
    tokenCount: number;
    contextWindow: readonly ChatMessage[];
    send: (content: string, options?: { pinned?: boolean }) => Promise<MessageId>;
    stream: (content: string, options?: { pinned?: boolean }) => Promise<MessageId>;
    stop: () => void;
    clearMessages: () => void;
    pinMessage: (messageId: MessageId, pinned: boolean) => void;
    submitToolResult: (toolCallId: string, result: string) => void;
    retry: (() => Promise<void>) | null;
    subscribe: ChatSubscribe;
}>;

export function useConversation(options?: UseConversationOptions): UseConversationReturn {
    const { store } = useBYOMContext();
    const [messages, setMessages] = useState<TrackedChatMessage[]>(
        () => options?.initialMessages ?? [],
    );
    const [streamingContent, setStreamingContent] = useState("");
    const [streamingMessageId, setStreamingMessageId] = useState<MessageId | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<BYOMSDKError | null>(null);
    const [tokenCount, setTokenCount] = useState(0);
    const [contextWindow, setContextWindow] = useState<readonly ChatMessage[]>([]);

    const messagesRef = useRef<TrackedChatMessage[]>(options?.initialMessages ?? []);
    const abortRef = useRef<AbortController | null>(null);
    const busyRef = useRef(false);
    const lastRequestRef = useRef<{ type: "send" | "stream"; content: string; pinned?: boolean } | null>(null);
    const subsRef = useRef(new Subscriptions());

    const managerRef = useRef<ConversationManager | null>(null);
    if (managerRef.current === null) {
        const managerOpts: ConstructorParameters<typeof ConversationManager>[0] = {
            client: store.client,
        };
        if (options?.systemPrompt !== undefined) managerOpts.systemPrompt = options.systemPrompt;
        if (options?.tools !== undefined) managerOpts.tools = options.tools;
        if (options?.maxTokens !== undefined) managerOpts.maxTokens = options.maxTokens;
        if (options?.maxToolRounds !== undefined) managerOpts.maxToolRounds = options.maxToolRounds;
        if (options?.primeTools !== undefined) managerOpts.primeTools = options.primeTools;
        if (options?.hideToolCalls !== undefined) managerOpts.hideToolCalls = options.hideToolCalls;
        managerRef.current = new ConversationManager(managerOpts);
    }

    const appendMessage = useCallback((msg: TrackedChatMessage) => {
        messagesRef.current = [...messagesRef.current, msg];
        setMessages(messagesRef.current);
        return msg;
    }, []);

    const updateMessage = useCallback((id: MessageId, patch: Partial<TrackedChatMessage>) => {
        messagesRef.current = messagesRef.current.map((m) =>
            m.id === id ? { ...m, ...patch } : m,
        );
        setMessages(messagesRef.current);
    }, []);

    const refreshTokenState = useCallback(() => {
        const manager = managerRef.current!;
        setTokenCount(manager.getTokenCount());
        setContextWindow(manager.getContextWindow());
    }, []);

    const send = useCallback(async (content: string, opts?: { pinned?: boolean }): Promise<MessageId> => {
        if (busyRef.current) {
            throw new Error("A chat operation is already in progress. Wait for it to complete or call stop().");
        }
        busyRef.current = true;
        lastRequestRef.current = opts?.pinned !== undefined
            ? { type: "send", content, pinned: opts.pinned }
            : { type: "send", content };
        setError(null);
        setIsSending(true);

        const userMsgId = generateMessageId();
        const userMsg: TrackedChatMessage = {
            id: userMsgId,
            role: "user",
            content,
            status: "complete",
            pinned: opts?.pinned ?? false,
        };
        appendMessage(userMsg);

        try {
            const result = await managerRef.current!.send(content, opts?.pinned !== undefined ? { pinned: opts.pinned } : undefined);

            const assistantMsgId = generateMessageId();
            const assistantMsg: TrackedChatMessage = {
                id: assistantMsgId,
                role: "assistant",
                content: result.content,
                inResponseTo: userMsgId,
                status: "complete",
                pinned: false,
            };
            appendMessage(assistantMsg);
            refreshTokenState();
            subsRef.current.notify();
            return userMsgId;
        } catch (err) {
            setError(err as BYOMSDKError);
            updateMessage(userMsgId, { status: "error" });
            throw err;
        } finally {
            busyRef.current = false;
            setIsSending(false);
        }
    }, [store, appendMessage, updateMessage, refreshTokenState]);

    const stream = useCallback(async (content: string, opts?: { pinned?: boolean }): Promise<MessageId> => {
        if (busyRef.current) {
            throw new Error("A chat operation is already in progress. Wait for it to complete or call stop().");
        }
        busyRef.current = true;
        lastRequestRef.current = opts?.pinned !== undefined
            ? { type: "stream", content, pinned: opts.pinned }
            : { type: "stream", content };
        setError(null);
        setIsStreaming(true);

        const userMsgId = generateMessageId();
        const userMsg: TrackedChatMessage = {
            id: userMsgId,
            role: "user",
            content,
            status: "complete",
            pinned: opts?.pinned ?? false,
        };
        appendMessage(userMsg);

        const assistantMsgId = generateMessageId();
        setStreamingMessageId(assistantMsgId);
        setStreamingContent("");

        const controller = new AbortController();
        abortRef.current = controller;

        let accumulated = "";

        try {
            const iterable = managerRef.current!.stream(content, opts?.pinned !== undefined ? { pinned: opts.pinned } : undefined);

            for await (const event of iterable) {
                if (controller.signal.aborted) break;

                if (event.type === "chunk") {
                    accumulated += event.delta;
                    const current = accumulated;
                    if (typeof requestAnimationFrame === "function") {
                        requestAnimationFrame(() => {
                            setStreamingContent(current);
                        });
                    } else {
                        setTimeout(() => {
                            setStreamingContent(current);
                        }, 0);
                    }
                } else if (event.type === "tool_call") {
                    subsRef.current.notify();
                } else if (event.type === "tool_result") {
                    subsRef.current.notify();
                } else if (event.type === "done") {
                    // Stream finished
                }
            }

            const assistantMsg: TrackedChatMessage = {
                id: assistantMsgId,
                role: "assistant",
                content: accumulated,
                inResponseTo: userMsgId,
                status: "complete",
                pinned: false,
            };
            appendMessage(assistantMsg);
            setStreamingContent("");
            setStreamingMessageId(null);
            refreshTokenState();
            subsRef.current.notify();
            return userMsgId;
        } catch (err) {
            if (controller.signal.aborted) {
                if (accumulated.length > 0) {
                    const partialMsg: TrackedChatMessage = {
                        id: assistantMsgId,
                        role: "assistant",
                        content: accumulated,
                        inResponseTo: userMsgId,
                        status: "complete",
                        pinned: false,
                    };
                    appendMessage(partialMsg);
                }
                setStreamingContent("");
                setStreamingMessageId(null);
                return userMsgId;
            }
            setError(err as BYOMSDKError);
            updateMessage(userMsgId, { status: "error" });
            setStreamingContent("");
            setStreamingMessageId(null);
            throw err;
        } finally {
            busyRef.current = false;
            setIsStreaming(false);
            abortRef.current = null;
        }
    }, [store, appendMessage, updateMessage, refreshTokenState]);

    const stop = useCallback(() => {
        if (abortRef.current) {
            abortRef.current.abort();
        }
    }, []);

    const clearMessages = useCallback(() => {
        managerRef.current!.clear();
        messagesRef.current = [];
        setMessages([]);
        setStreamingContent("");
        setStreamingMessageId(null);
        setIsStreaming(false);
        setIsSending(false);
        setError(null);
        setTokenCount(0);
        setContextWindow([]);
        busyRef.current = false;
        lastRequestRef.current = null;
    }, []);

    const pinMessage = useCallback((messageId: MessageId, pinned: boolean) => {
        const idx = messagesRef.current.findIndex((m) => m.id === messageId);
        if (idx === -1) return;
        updateMessage(messageId, { pinned });
        managerRef.current!.setPin(idx, pinned);
    }, [updateMessage]);

    const submitToolResult = useCallback((toolCallId: string, result: string) => {
        managerRef.current!.submitToolResult(toolCallId, result);
    }, []);

    const retry = error !== null && (error as BYOMSDKError & { retryable?: boolean }).retryable === true && lastRequestRef.current !== null
        ? async () => {
            setError(null);
            const req = lastRequestRef.current!;
            if (req.type === "send") {
                await send(req.content, req.pinned !== undefined ? { pinned: req.pinned } : undefined);
            } else {
                await stream(req.content, req.pinned !== undefined ? { pinned: req.pinned } : undefined);
            }
        }
        : null;

    const subscribe = useCallback((...args: unknown[]) => {
        const event = args[0] as string;
        const handler = (args.length === 3 ? args[2] : args[1]) as () => void;
        return subsRef.current.subscribe(() => {
            if (
                event === "response" ||
                event === "stream" ||
                event === "error" ||
                event === "tool_call" ||
                event === "tool_result"
            ) {
                handler();
            }
        });
    }, []) as unknown as ChatSubscribe;

    return {
        messages,
        streamingContent,
        streamingMessageId,
        isStreaming,
        isSending,
        error,
        tokenCount,
        contextWindow,
        send,
        stream,
        stop,
        clearMessages,
        pinMessage,
        submitToolResult,
        retry,
        subscribe,
    };
}
