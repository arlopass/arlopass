import type { ProtocolCapability } from "@arlopass/protocol";
import { describe, expect, it } from "vitest";

import { ConsentController } from "../consent/consent-controller.js";
import { ExtensionEventEmitter, type ExtensionEventMap } from "../events.js";
import type {
  ConsentPromptAdapter,
  ConsentPromptRequest,
  ConsentPromptResponse,
} from "../consent/consent-controller.js";

type ControllerHarness = Readonly<{
  controller: ConsentController;
  events: ExtensionEventEmitter<ExtensionEventMap>;
}>;

function createControllerHarness(
  promptAdapter: ConsentPromptAdapter,
): ControllerHarness {
  let now = new Date("2026-03-23T12:00:00.000Z").getTime();
  const events = new ExtensionEventEmitter<ExtensionEventMap>();
  const controller = new ConsentController({
    promptAdapter,
    events,
    now: () => {
      now += 25;
      return now;
    },
  });

  return {
    controller,
    events,
  };
}

function createConsentRequest(
  capability: ProtocolCapability,
): Readonly<{
  origin: string;
  providerId: string;
  modelId: string;
  capabilities: readonly ProtocolCapability[];
}> {
  return {
    origin: "https://app.example.com",
    providerId: "provider.alpha",
    modelId: "model.one",
    capabilities: [capability],
  };
}

describe("ConsentController", () => {
  it("prompts with expected labels and returns one-time decisions", async () => {
    const captured: ConsentPromptRequest[] = [];
    const adapter: ConsentPromptAdapter = {
      showConsentPrompt: async (request): Promise<ConsentPromptResponse> => {
        captured.push(request);
        return { granted: true, grantType: "one-time" };
      },
    };
    const { controller } = createControllerHarness(adapter);

    const decision = await controller.requestConsent(
      createConsentRequest("chat.completions"),
    );

    expect(decision).toMatchObject({
      granted: true,
      grantType: "one-time",
      origin: "https://app.example.com",
      providerId: "provider.alpha",
      modelId: "model.one",
      capabilities: ["chat.completions"],
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]?.capabilityLabels).toEqual([
      "Send chat completion requests",
    ]);
    expect(captured[0]?.grantTypeOptions).toEqual([
      "one-time",
      "session",
      "persistent",
    ]);
  });

  it("supports persistent grants and wildcard coercion for provider.list/session.create", async () => {
    const captured: ConsentPromptRequest[] = [];
    const responses: ConsentPromptResponse[] = [
      { granted: true, grantType: "persistent" },
      { granted: true, grantType: "session" },
    ];
    const adapter: ConsentPromptAdapter = {
      showConsentPrompt: async (request): Promise<ConsentPromptResponse> => {
        captured.push(request);
        const next = responses.shift();
        if (next === undefined) {
          throw new Error("Missing prompt response");
        }

        return next;
      },
    };
    const { controller } = createControllerHarness(adapter);

    const providerListDecision = await controller.requestConsent(
      createConsentRequest("provider.list"),
    );
    const sessionCreateDecision = await controller.requestConsent(
      createConsentRequest("session.create"),
    );

    expect(providerListDecision).toMatchObject({
      granted: true,
      grantType: "persistent",
      providerId: "*",
      modelId: "*",
    });
    expect(sessionCreateDecision).toMatchObject({
      granted: true,
      grantType: "session",
      providerId: "*",
      modelId: "*",
    });

    expect(captured[0]).toMatchObject({
      providerId: "*",
      modelId: "*",
      capabilities: ["provider.list"],
    });
    expect(captured[1]).toMatchObject({
      providerId: "*",
      modelId: "*",
      capabilities: ["session.create"],
    });
  });

  it("returns explicit deny decisions when user denies consent", async () => {
    const adapter: ConsentPromptAdapter = {
      showConsentPrompt: async (): Promise<ConsentPromptResponse> => ({
        granted: false,
        denialReason: "user-denied",
      }),
    };
    const { controller } = createControllerHarness(adapter);

    const decision = await controller.requestConsent(
      createConsentRequest("chat.stream"),
    );

    expect(decision).toEqual({
      granted: false,
      origin: "https://app.example.com",
      providerId: "provider.alpha",
      modelId: "model.one",
      capabilities: ["chat.stream"],
      denialReason: "user-denied",
    });
  });

  it("rejects invalid prompt responses when selected grant type was not offered", async () => {
    const adapter: ConsentPromptAdapter = {
      showConsentPrompt: async (): Promise<ConsentPromptResponse> => ({
        granted: true,
        grantType: "persistent",
      }),
    };
    const { controller } = createControllerHarness(adapter);

    await expect(
      controller.requestConsent({
        ...createConsentRequest("chat.completions"),
        grantTypeOptions: ["one-time", "session"],
      }),
    ).rejects.toMatchObject({
      name: "ConsentControllerError",
      code: "invalid-response",
    });
  });

  it("bubbles explicit prompt failures with structured error metadata", async () => {
    const adapter: ConsentPromptAdapter = {
      showConsentPrompt: async (): Promise<ConsentPromptResponse> => {
        throw new Error("Prompt transport unavailable");
      },
    };
    const { controller } = createControllerHarness(adapter);

    await expect(
      controller.requestConsent(createConsentRequest("chat.completions")),
    ).rejects.toMatchObject({
      name: "ConsentControllerError",
      code: "prompt-failed",
    });
  });

  it("emits requested/resolved events for auditing", async () => {
    const adapter: ConsentPromptAdapter = {
      showConsentPrompt: async (): Promise<ConsentPromptResponse> => ({
        granted: true,
        grantType: "session",
      }),
    };
    const { controller, events } = createControllerHarness(adapter);
    const requested: string[] = [];
    const resolved: string[] = [];

    events.on("consent-requested", (event) => {
      requested.push(
        `${event.origin}:${event.providerId}:${event.modelId}:${event.capabilities.join(",")}`,
      );
    });
    events.on("consent-resolved", (event) => {
      resolved.push(
        `${event.origin}:${event.providerId}:${event.modelId}:${event.granted}`,
      );
    });

    const decision = await controller.requestConsent(
      createConsentRequest("chat.completions"),
    );

    expect(decision.granted).toBe(true);
    expect(requested).toEqual([
      "https://app.example.com:provider.alpha:model.one:chat.completions",
    ]);
    expect(resolved).toEqual(["https://app.example.com:provider.alpha:model.one:true"]);
  });
});
