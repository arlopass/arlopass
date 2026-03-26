"use client";

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { BYOMProvider } from "@byom-ai/react";
import { ProviderPicker } from "../provider-picker/index.js";
import type { ProviderDescriptor } from "../types.js";

function setup() {
  const mockTransport = {
    request: vi.fn().mockResolvedValue({ envelope: {} }),
    stream: vi.fn(),
  };
  (window as unknown as Record<string, unknown>).byom = mockTransport;
  return mockTransport;
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).byom;
});

beforeEach(() => {
  setup();
});

function Wrapper({ children }: { children: ReactNode }) {
  return <BYOMProvider appId="test">{children}</BYOMProvider>;
}

const sampleProviders: ProviderDescriptor[] = [
  { providerId: "openai", providerName: "OpenAI", models: ["gpt-4", "gpt-3.5"] },
  { providerId: "anthropic", providerName: "Anthropic", models: ["claude-3"] },
];

describe("ProviderPicker.Root", () => {
  it("renders in controlled mode with providers prop", () => {
    render(
      <Wrapper>
        <ProviderPicker.Root providers={sampleProviders} data-testid="root">
          <span>content</span>
        </ProviderPicker.Root>
      </Wrapper>,
    );
    const root = screen.getByTestId("root");
    expect(root).toBeDefined();
    expect(root.dataset.state).toBe("ready");
  });

  it("data-state='loading' when loading", () => {
    render(
      <Wrapper>
        <ProviderPicker.Root
          providers={[]}
          isLoading={true}
          data-testid="root"
        >
          <span>content</span>
        </ProviderPicker.Root>
      </Wrapper>,
    );
    expect(screen.getByTestId("root").dataset.state).toBe("loading");
  });
});

describe("ProviderPicker.ProviderSelect", () => {
  it("renders provider options", () => {
    render(
      <Wrapper>
        <ProviderPicker.Root providers={sampleProviders}>
          <ProviderPicker.ProviderSelect data-testid="select" />
        </ProviderPicker.Root>
      </Wrapper>,
    );
    const select = screen.getByTestId("select") as HTMLSelectElement;
    // 1 placeholder + 2 providers
    expect(select.options.length).toBe(3);
    expect(select.options[1]!.textContent).toBe("OpenAI");
    expect(select.options[2]!.textContent).toBe("Anthropic");
  });

  it("data-state='unselected' initially", () => {
    render(
      <Wrapper>
        <ProviderPicker.Root providers={sampleProviders}>
          <ProviderPicker.ProviderSelect data-testid="select" />
        </ProviderPicker.Root>
      </Wrapper>,
    );
    expect(screen.getByTestId("select").dataset.state).toBe("unselected");
  });
});

describe("ProviderPicker.ModelSelect", () => {
  it("renders with placeholder when no provider selected", () => {
    render(
      <Wrapper>
        <ProviderPicker.Root providers={sampleProviders}>
          <ProviderPicker.ModelSelect data-testid="model" />
        </ProviderPicker.Root>
      </Wrapper>,
    );
    const select = screen.getByTestId("model") as HTMLSelectElement;
    expect(select.options.length).toBe(1); // just placeholder
    expect(select.dataset.state).toBe("unselected");
  });
});

describe("ProviderPicker.SubmitButton", () => {
  it("disabled when no selection", () => {
    render(
      <Wrapper>
        <ProviderPicker.Root providers={sampleProviders}>
          <ProviderPicker.SubmitButton data-testid="submit">
            Select
          </ProviderPicker.SubmitButton>
        </ProviderPicker.Root>
      </Wrapper>,
    );
    const btn = screen.getByTestId("submit") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.dataset.state).toBe("disabled");
  });
});

describe("Parts outside ProviderPicker.Root", () => {
  it("ProviderSelect throws when used outside Root", () => {
    expect(() => {
      render(<ProviderPicker.ProviderSelect />);
    }).toThrow("must be used within <ProviderPicker.Root>");
  });

  it("ModelSelect throws when used outside Root", () => {
    expect(() => {
      render(<ProviderPicker.ModelSelect />);
    }).toThrow("must be used within <ProviderPicker.Root>");
  });

  it("SubmitButton throws when used outside Root", () => {
    expect(() => {
      render(<ProviderPicker.SubmitButton />);
    }).toThrow("must be used within <ProviderPicker.Root>");
  });
});
