# @arlopass/adapter-gemini

Gemini adapter for Arlopass cloud-provider flows.

Supports API key and OAuth access-token connection methods through the Arlopass
cloud adapter contract.

## Status

In active development.

## Installation

```bash
pnpm add @arlopass/adapter-gemini
```

## Usage

```ts
import { GeminiAdapter } from "@arlopass/adapter-gemini";

const adapter = new GeminiAdapter();

await adapter.beginConnect({
  connectionMethodId: "gemini.api_key",
});
```

## Connection Methods

- `gemini.api_key`
- `gemini.oauth_access_token`

## Contract

Implements `CloudAdapterContractV2` from `@arlopass/adapter-runtime`.
