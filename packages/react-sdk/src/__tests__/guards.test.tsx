import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BYOMProvider } from "../provider/byom-provider.js";
import {
  BYOMNotInstalled,
  BYOMDisconnected,
  BYOMConnected,
  BYOMConnectionGate,
  BYOMHasError,
} from "../guards/index.js";

function wrapper(ui: React.ReactNode) {
  return (
    <BYOMProvider appId="test" autoConnect={false}>
      {ui}
    </BYOMProvider>
  );
}

describe("Guard components", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).byom;
  });

  it("BYOMNotInstalled renders when no window.byom", () => {
    render(wrapper(
      <BYOMNotInstalled>
        <div data-testid="not-installed">no extension</div>
      </BYOMNotInstalled>,
    ));
    expect(screen.getByTestId("not-installed")).toBeTruthy();
  });

  it("BYOMDisconnected renders when disconnected", () => {
    render(wrapper(
      <BYOMDisconnected>
        <div data-testid="disconnected">offline</div>
      </BYOMDisconnected>,
    ));
    expect(screen.getByTestId("disconnected")).toBeTruthy();
  });

  it("BYOMConnected does NOT render when disconnected", () => {
    render(wrapper(
      <BYOMConnected>
        <div data-testid="connected">online</div>
      </BYOMConnected>,
    ));
    expect(screen.queryByTestId("connected")).toBeNull();
  });

  it("BYOMConnectionGate shows fallback when disconnected", () => {
    render(wrapper(
      <BYOMConnectionGate fallback={<div data-testid="fallback">wait</div>}>
        <div data-testid="content">ready</div>
      </BYOMConnectionGate>,
    ));
    expect(screen.getByTestId("fallback")).toBeTruthy();
    expect(screen.queryByTestId("content")).toBeNull();
  });

  it("BYOMConnectionGate shows notInstalledFallback when no extension", () => {
    render(wrapper(
      <BYOMConnectionGate
        fallback={<div data-testid="fallback">wait</div>}
        notInstalledFallback={<div data-testid="no-ext">install extension</div>}
      >
        <div data-testid="content">ready</div>
      </BYOMConnectionGate>,
    ));
    expect(screen.getByTestId("no-ext")).toBeTruthy();
    expect(screen.queryByTestId("fallback")).toBeNull();
    expect(screen.queryByTestId("content")).toBeNull();
  });

  it("Negative guards accept render function children", () => {
    render(wrapper(
      <BYOMDisconnected>
        {() => <div data-testid="fn-child">from function</div>}
      </BYOMDisconnected>,
    ));
    expect(screen.getByTestId("fn-child").textContent).toBe("from function");
  });

  it("BYOMHasError does NOT render when no error in initial state", () => {
    render(wrapper(
      <BYOMHasError>
        {({ error }) => <div data-testid="error">{error.message}</div>}
      </BYOMHasError>,
    ));
    expect(screen.queryByTestId("error")).toBeNull();
  });
});
