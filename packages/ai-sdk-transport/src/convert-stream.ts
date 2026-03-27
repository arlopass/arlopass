type ChatStreamEvent =
    | Readonly<{ type: "chunk"; delta: string; index: number; correlationId: string }>
    | Readonly<{ type: "done"; correlationId: string }>;

type UIMessageChunkLike =
    | { type: "start" }
    | { type: "text-start"; id: string }
    | { type: "text-delta"; id: string; delta: string }
    | { type: "text-end"; id: string }
    | { type: "finish"; finishReason: string }
    | { type: "error"; errorText: string }
    | { type: "abort"; reason?: string };

function generatePartId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function convertStream(
    source: AsyncIterable<ChatStreamEvent>,
    signal?: AbortSignal,
): ReadableStream<UIMessageChunkLike> {
    return new ReadableStream<UIMessageChunkLike>({
        async start(controller) {
            const partId = generatePartId();
            let textStarted = false;

            try {
                controller.enqueue({ type: "start" });

                for await (const event of source) {
                    if (signal?.aborted) {
                        if (textStarted) controller.enqueue({ type: "text-end", id: partId });
                        controller.enqueue({ type: "abort" });
                        controller.close();
                        return;
                    }

                    if (event.type === "chunk") {
                        if (!textStarted) {
                            controller.enqueue({ type: "text-start", id: partId });
                            textStarted = true;
                        }
                        controller.enqueue({ type: "text-delta", id: partId, delta: event.delta });
                    }

                    if (event.type === "done") {
                        if (textStarted) controller.enqueue({ type: "text-end", id: partId });
                        controller.enqueue({ type: "finish", finishReason: "stop" });
                        controller.close();
                        return;
                    }
                }

                // Source exhausted without "done" event
                if (textStarted) controller.enqueue({ type: "text-end", id: partId });
                controller.enqueue({ type: "finish", finishReason: "stop" });
                controller.close();
            } catch (err) {
                if (signal?.aborted) {
                    if (textStarted) controller.enqueue({ type: "text-end", id: partId });
                    controller.enqueue({ type: "abort" });
                } else {
                    if (textStarted) controller.enqueue({ type: "text-end", id: partId });
                    const message = err instanceof Error ? err.message : String(err);
                    controller.enqueue({ type: "error", errorText: message });
                }
                controller.close();
            }
        },
    });
}
