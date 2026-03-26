import { describe, expect, it } from "vitest";

import {
  createCloudFeatureFlagsFromEnv,
  DEFAULT_CLOUD_FEATURE_FLAGS,
  isCanaryAllowed,
  isCloudExecutionEnabled,
  type CloudFeatureFlags,
} from "../config/cloud-feature-flags.js";

describe("cloud feature flags", () => {
  it("defaults cloudBrokerV2Enabled to false", () => {
    expect(DEFAULT_CLOUD_FEATURE_FLAGS.cloudBrokerV2Enabled).toBe(false);
  });

  it("returns false when cloud execution is disabled", () => {
    const flags: CloudFeatureFlags = {
      cloudBrokerV2Enabled: true,
      cloudMethodAllowlist: {
        "anthropic.api_key": false,
      },
    };

    expect(isCloudExecutionEnabled(flags, "anthropic.api_key")).toBe(false);
  });

  it("returns true when global and method-level flags are enabled", () => {
    const flags: CloudFeatureFlags = {
      cloudBrokerV2Enabled: true,
      cloudMethodAllowlist: {
        "anthropic.api_key": true,
      },
    };

    expect(isCloudExecutionEnabled(flags, "anthropic.api_key")).toBe(true);
  });

  it("enforces canary allowlists for extension IDs and origins", () => {
    const allowlist = {
      extensionIds: ["ext-canary"],
      origins: ["https://app.example.com"],
    };

    expect(
      isCanaryAllowed(
        {
          extensionId: "ext-unknown",
          origin: "https://app.example.com",
        },
        allowlist,
      ),
    ).toBe(false);
    expect(
      isCanaryAllowed(
        {
          extensionId: "ext-canary",
          origin: "https://unknown.example.com",
        },
        allowlist,
      ),
    ).toBe(false);
    expect(
      isCanaryAllowed(
        {
          extensionId: "ext-canary",
          origin: "https://app.example.com",
        },
        allowlist,
      ),
    ).toBe(true);
  });

  it("denies cloud execution when canary context is not allowlisted", () => {
    const flags: CloudFeatureFlags = {
      cloudBrokerV2Enabled: true,
      cloudMethodAllowlist: {
        "anthropic.api_key": true,
      },
      cloudCanaryAllowlist: {
        extensionIds: ["ext-canary"],
        origins: ["https://app.example.com"],
      },
    };

    expect(
      isCloudExecutionEnabled(flags, "anthropic.api_key", {
        extensionId: "ext-unknown",
        origin: "https://app.example.com",
      }),
    ).toBe(false);
    expect(
      isCloudExecutionEnabled(flags, "anthropic.api_key", {
        extensionId: "ext-canary",
        origin: "https://unknown.example.com",
      }),
    ).toBe(false);
    expect(
      isCloudExecutionEnabled(flags, "anthropic.api_key", {
        extensionId: "ext-canary",
        origin: "https://app.example.com",
      }),
    ).toBe(true);
  });

  it("maps provider feature toggles to current cloud method ids", () => {
    const flags = createCloudFeatureFlagsFromEnv({
      BYOM_CLOUD_BROKER_V2_ENABLED: "true",
      BYOM_CLOUD_PROVIDER_FOUNDRY_ENABLED: "true",
      BYOM_CLOUD_PROVIDER_VERTEX_ENABLED: "true",
      BYOM_CLOUD_PROVIDER_BEDROCK_ENABLED: "true",
      BYOM_CLOUD_PROVIDER_OPENAI_ENABLED: "true",
      BYOM_CLOUD_PROVIDER_PERPLEXITY_ENABLED: "true",
      BYOM_CLOUD_PROVIDER_GEMINI_ENABLED: "true",
    });

    expect(isCloudExecutionEnabled(flags, "foundry.api_key")).toBe(true);
    expect(isCloudExecutionEnabled(flags, "vertex.api_key")).toBe(true);
    expect(isCloudExecutionEnabled(flags, "vertex.service_account")).toBe(true);
    expect(isCloudExecutionEnabled(flags, "bedrock.api_key")).toBe(true);
    expect(isCloudExecutionEnabled(flags, "bedrock.assume_role")).toBe(true);
    expect(isCloudExecutionEnabled(flags, "openai.api_key")).toBe(true);
    expect(isCloudExecutionEnabled(flags, "perplexity.api_key")).toBe(true);
    expect(isCloudExecutionEnabled(flags, "gemini.api_key")).toBe(true);
    expect(isCloudExecutionEnabled(flags, "gemini.oauth_access_token")).toBe(true);
    expect(isCloudExecutionEnabled(flags, "foundry.aad_client_credentials")).toBe(true);
  });

  it("supports legacy foundry method id aliases in explicit allowlist", () => {
    const flags = createCloudFeatureFlagsFromEnv({
      BYOM_CLOUD_BROKER_V2_ENABLED: "true",
      BYOM_CLOUD_METHOD_ALLOWLIST: "foundry.aad_client_credentials",
    });

    expect(isCloudExecutionEnabled(flags, "foundry.api_key")).toBe(true);
    expect(isCloudExecutionEnabled(flags, "foundry.aad_client_credentials")).toBe(true);
  });
});
