import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArlopassProvider } from "../provider/arlopass-provider.js";
import {
  ArlopassNotInstalled,
  ArlopassDisconnected,
  ArlopassConnected,
  ArlopassConnectionGate,
  ArlopassHasError,
} from "../guards/index.js";

function wrapper(ui: React.ReactNode) {
  return (
    <ArlopassProvider appId="test" autoConnect={false}>
      {ui}
    </ArlopassProvider>
  );
}

describe("Guard components", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).arlopass;
  });

  it("ArlopassNotInstalled renders when no window.arlopass", () => {
    render(
      wrapper(
        <ArlopassNotInstalled>
          <div data-testid="not-installed">no extension</div>
        </ArlopassNotInstalled>,
      ),
    );
    expect(screen.getByTestId("not-installed")).toBeTruthy();
  });

  it("ArlopassDisconnected renders when disconnected", () => {
    render(
      wrapper(
        <ArlopassDisconnected>
          <div data-testid="disconnected">offline</div>
        </ArlopassDisconnected>,
      ),
    );
    expect(screen.getByTestId("disconnected")).toBeTruthy();
  });

  it("ArlopassConnected does NOT render when disconnected", () => {
    render(
      wrapper(
        <ArlopassConnected>
          <div data-testid="connected">online</div>
        </ArlopassConnected>,
      ),
    );
    expect(screen.queryByTestId("connected")).toBeNull();
  });

  it("ArlopassConnectionGate shows fallback when disconnected", () => {
    render(
      wrapper(
        <ArlopassConnectionGate
          fallback={<div data-testid="fallback">wait</div>}
        >
          <div data-testid="content">ready</div>
        </ArlopassConnectionGate>,
      ),
    );
    expect(screen.getByTestId("fallback")).toBeTruthy();
    expect(screen.queryByTestId("content")).toBeNull();
  });

  it("ArlopassConnectionGate shows notInstalledFallback when no extension", () => {
    render(
      wrapper(
        <ArlopassConnectionGate
          fallback={<div data-testid="fallback">wait</div>}
          notInstalledFallback={
            <div data-testid="no-ext">install extension</div>
          }
        >
          <div data-testid="content">ready</div>
        </ArlopassConnectionGate>,
      ),
    );
    expect(screen.getByTestId("no-ext")).toBeTruthy();
    expect(screen.queryByTestId("fallback")).toBeNull();
    expect(screen.queryByTestId("content")).toBeNull();
  });

  it("Negative guards accept render function children", () => {
    render(
      wrapper(
        <ArlopassDisconnected>
          {() => <div data-testid="fn-child">from function</div>}
        </ArlopassDisconnected>,
      ),
    );
    expect(screen.getByTestId("fn-child").textContent).toBe("from function");
  });

  it("ArlopassHasError does NOT render when no error in initial state", () => {
    render(
      wrapper(
        <ArlopassHasError>
          {({ error }) => <div data-testid="error">{error.message}</div>}
        </ArlopassHasError>,
      ),
    );
    expect(screen.queryByTestId("error")).toBeNull();
  });
});
