# @arlopass/adapter-perplexity

Perplexity adapter for Arlopass cloud-provider flows.

This package handles credential connection and validation for Perplexity using
the Arlopass cloud adapter contract.

## Status

In active development.

## Installation

```bash
pnpm add @arlopass/adapter-perplexity
```

## Usage

```ts
import { PerplexityAdapter } from "@arlopass/adapter-perplexity";

const adapter = new PerplexityAdapter();

await adapter.beginConnect({
  connectionMethodId: "perplexity.api_key",
});
```

## Connection Methods

- `perplexity.api_key`

## Contract

Implements `CloudAdapterContractV2` from `@arlopass/adapter-runtime`.
