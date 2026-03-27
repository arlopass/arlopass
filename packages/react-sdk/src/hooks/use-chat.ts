"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { ArlopassSDKError } from "@arlopass/web-sdk";
import type {
    ChatSubscribeNoTools,
    ContextWindowInfo,
    MessageId,
    TrackedChatMessage,
} from "../types.js";
import { Subscriptions } from "../store/subscriptions.js";
import { useArlopassContext } from "./use-store.js";

function generateMessageId(): MessageId {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    // Fallback for environments without crypto.randomUUID
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

type UseChatOptions = {
    initialMessages?: TrackedChatMessage[];
    systemPrompt?: string;
};

type UseChatReturn = Readonly<{
    messages: readonly TrackedChatMessage[];
    streamingContent: string;
    streamingMessageId: MessageId | null;
    isStreaming: boolean;
    isSending: boolean;
    error: ArlopassSDKError | null;
    contextInfo: ContextWindowInfo;
    send: (content: string) => Promise<MessageId>;
    stream: (content: string) => Promise<MessageId>;
    stop: () => void;
    clearMessages: () => void;
    retry: (() => Promise<void>) | null;
    subscribe: ChatSubscribeNoTools;
}>;

export function useChat(options?: UseChatOptions): UseChatReturn {
    const { store } = useArlopassContext();
    const [messages, setMessages] = useState<TrackedChatMessage[]>(
        () => options?.initialMessages ?? [],
    );
    const [streamingContent, setStreamingContent] = useState("");
    const [streamingMessageId, setStreamingMessageId] = useState<MessageId | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<ArlopassSDKError | null>(null);

    const messagesRef = useRef<TrackedChatMessage[]>(options?.initialMessages ?? []);
    const abortRef = useRef<AbortController | null>(null);
    const busyRef = useRef(false);
    const lastRequestRef = useRef<{ type: "send" | "stream"; content: string } | null>(null);
    const subsRef = useRef(new Subscriptions());

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

    const buildSystemMessages = useCallback(() => {
        const msgs: { role: "system" | "user" | "assistant"; content: string }[] = [];
        if (options?.systemPrompt) {
            msgs.push({ role: "system", content: options.systemPrompt });
        }
        return msgs;
    }, [options?.systemPrompt]);

    const send = useCallback(async (content: string): Promise<MessageId> => {
        if (busyRef.current) {
            throw new Error("A chat operation is already in progress. Wait for it to complete or call stop().");
        }
        busyRef.current = true;
        lastRequestRef.current = { type: "send", content };
        setError(null);
        setIsSending(true);

        const userMsgId = generateMessageId();
        const userMsg: TrackedChatMessage = {
            id: userMsgId,
            role: "user",
            content,
            status: "complete",
            pinned: false,
        };
        appendMessage(userMsg);

        try {
            const chatMessages = [
                ...buildSystemMessages(),
                ...messagesRef.current.map((m) => ({ role: m.role, content: m.content })),
            ];
            const result = await store.client.chat.send({ messages: chatMessages });

            const assistantMsgId = generateMessageId();
            const assistantMsg: TrackedChatMessage = {
                id: assistantMsgId,
                role: "assistant",
                content: result.message.content,
                inResponseTo: userMsgId,
                status: "complete",
                pinned: false,
            };
            appendMessage(assistantMsg);
            subsRef.current.notify();
            return userMsgId;
        } catch (err) {
            setError(err as ArlopassSDKError);
            updateMessage(userMsgId, { status: "error" });
            throw err;
        } finally {
            busyRef.current = false;
            setIsSending(false);
        }
    }, [store, appendMessage, updateMessage, buildSystemMessages]);

    const stream = useCallback(async (content: string): Promise<MessageId> => {
        if (busyRef.current) {
            throw new Error("A chat operation is already in progress. Wait for it to complete or call stop().");
        }
        busyRef.current = true;
        lastRequestRef.current = { type: "stream", content };
        setError(null);
        setIsStreaming(true);

        const userMsgId = generateMessageId();
        const userMsg: TrackedChatMessage = {
            id: userMsgId,
            role: "user",
            content,
            status: "complete",
            pinned: false,
        };
        appendMessage(userMsg);

        const assistantMsgId = generateMessageId();
        setStreamingMessageId(assistantMsgId);
        setStreamingContent("");

        const controller = new AbortController();
        abortRef.current = controller;

        let accumulated = "";

        try {
            const chatMessages = [
                ...buildSystemMessages(),
                ...messagesRef.current.map((m) => ({ role: m.role, content: m.content })),
            ];
            const iterable = store.client.chat.stream(
                { messages: chatMessages },
                { signal: controller.signal },
            );

            for await (const event of iterable) {
                if (controller.signal.aborted) break;
                if (event.type === "chunk") {
                    accumulated += event.delta;
                    // Batched update via RAF + setTimeout
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
            subsRef.current.notify();
            return userMsgId;
        } catch (err) {
            if (controller.signal.aborted) {
                // Aborted — save partial content if any
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
            setError(err as ArlopassSDKError);
            updateMessage(userMsgId, { status: "error" });
            setStreamingContent("");
            setStreamingMessageId(null);
            throw err;
        } finally {
            busyRef.current = false;
            setIsStreaming(false);
            abortRef.current = null;
        }
    }, [store, appendMessage, updateMessage, buildSystemMessages]);

    const stop = useCallback(() => {
        if (abortRef.current) {
            abortRef.current.abort();
        }
    }, []);

    const clearMessages = useCallback(() => {
        messagesRef.current = [];
        setMessages([]);
        setStreamingContent("");
        setStreamingMessageId(null);
        setIsStreaming(false);
        setIsSending(false);
        setError(null);
        busyRef.current = false;
        lastRequestRef.current = null;
    }, []);

    const retry = error !== null && (error as ArlopassSDKError & { retryable?: boolean }).retryable === true && lastRequestRef.current !== null
        ? async () => {
            setError(null);
            const req = lastRequestRef.current!;
            if (req.type === "send") {
                await send(req.content);
            } else {
                await stream(req.content);
            }
        }
        : null;

    const subscribe = useCallback((...args: unknown[]) => {
        // Generic pub-sub — delegates to internal Subscriptions
        const event = args[0] as string;
        const handler = (args.length === 3 ? args[2] : args[1]) as () => void;
        // Store subscription keyed by event type
        return subsRef.current.subscribe(() => {
            // Only call if event type matches a basic filter
            if (event === "response" || event === "stream" || event === "error") {
                handler();
            }
        });
    }, []) as unknown as ChatSubscribeNoTools;

    const contextInfo = useMemo<ContextWindowInfo>(() => {
        const chatMessages = messagesRef.current.map((m) => ({ role: m.role, content: m.content }));
        return store.client.getContextInfo(chatMessages);
    }, [store, messages]);

    return {
        messages,
        streamingContent,
        streamingMessageId,
        isStreaming,
        isSending,
        error,
        contextInfo,
        send,
        stream,
        stop,
        clearMessages,
        retry,
        subscribe,
    };
}
