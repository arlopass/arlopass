# @arlopass/adapter-openai

OpenAI adapter for Arlopass cloud-provider flows.

This package implements the Arlopass cloud adapter contract and provides
connection lifecycle methods for OpenAI credentials.

## Status

In active development.

Core connect/validate flows are available and covered by contract tests.

## Installation

```bash
pnpm add @arlopass/adapter-openai
```

## Usage

```ts
import { OpenAiAdapter } from "@arlopass/adapter-openai";

const adapter = new OpenAiAdapter();

const begin = await adapter.beginConnect({
  connectionMethodId: "openai.api_key",
});

const complete = await adapter.completeConnect({
  connectionMethodId: "openai.api_key",
  payload: {
    apiKey: "sk-...",
  },
});

console.log(begin.challengeId, complete.credentialRef);
```

## Contract

Implements `CloudAdapterContractV2` from `@arlopass/adapter-runtime`.
