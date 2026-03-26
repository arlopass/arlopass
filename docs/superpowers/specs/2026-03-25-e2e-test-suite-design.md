# BYOM AI E2E Test Suite — Design Specification

## Overview

Comprehensive E2E test suite for the BYOM AI browser extension and examples web app using Playwright. Tests Chrome extension popup, options page, content script injection, web SDK integration, and full user journeys through the examples web app.

## Architecture

- **Framework**: Playwright with TypeScript
- **Pattern**: Page Object Model (POM) with custom fixtures
- **Extension testing**: Chromium persistent context with `--load-extension`
- **Transport**: Extension-injected (`window.byom`) + mock/demo transports in examples web app
- **Browser**: Chromium only (extensions require it)

## Directory Structure

```
e2e/
├── playwright.config.ts           # Main Playwright configuration
├── fixtures/
│   ├── extension.fixture.ts       # Extension loading, service worker, extensionId
│   └── test.ts                    # Merged fixtures re-exported as `test`
├── pages/
│   ├── extension-popup.page.ts    # Popup POM
│   ├── extension-options.page.ts  # Options page POM
│   └── examples-app.page.ts      # Examples web app POM
├── helpers/
│   ├── storage.helper.ts          # Chrome storage read/write helpers
│   └── wait.helper.ts             # Custom waiting utilities
├── tests/
│   ├── extension/
│   │   ├── popup.spec.ts          # Popup UI rendering + interactions
│   │   ├── options.spec.ts        # Options page provider connect flow
│   │   ├── service-worker.spec.ts # Background service worker health
│   │   └── content-script.spec.ts # Content script injection + transport
│   ├── webapp/
│   │   ├── connection.spec.ts     # Transport + connection lifecycle
│   │   ├── providers.spec.ts      # Provider listing + selection
│   │   ├── chat.spec.ts           # Chat send + streaming
│   │   └── error-handling.spec.ts # Error scenarios + edge cases
│   └── integration/
│       ├── extension-webapp.spec.ts  # Extension + webapp working together
│       └── happy-path.spec.ts        # Full end-to-end happy path
└── tsconfig.json                  # E2E-specific TypeScript config
```

## Test Categories

### 1. Extension Tests

| Test | Description |
|------|-------------|
| Popup loads | Extension popup renders header, status chip, action buttons |
| Popup empty state | Shows loading then empty provider list when wallet is clean |
| Popup provider rendering | Shows provider cards with status, model selector, actions |
| Popup set active provider | Clicking "Set Active" updates active provider |
| Popup revoke provider | Clicking "Revoke" removes provider |
| Popup model selection | Changing model dropdown updates active model |
| Popup error banner | Shows inline error on failed actions |
| Popup Connect Provider button | Opens options page |
| Options page loads | Renders connector form, bridge pairing section |
| Options connector selection | Switching connector updates form fields |
| Options form validation | Required fields enforced, display name max 80 chars |
| Options test connection | "Test Connection" runs in-memory validation |
| Options save provider | "Save Provider" persists to chrome.storage |
| Service worker starts | Service worker registers and is reachable |
| Content script injection | `window.byom` is injected on web pages |

### 2. Web App Tests (Mock Transport)

| Test | Description |
|------|-------------|
| App renders | Header, status badge, tabs visible |
| Transport profile switching | Dropdown changes transport mode |
| Connect with mock | Mock transport connects, shows session |
| Connect with failure transport | Failure transport shows structured error |
| List providers | Provider dropdown populates |
| Select provider & model | Selections update UI |
| Chat send | Single-turn message appears in transcript |
| Chat stream | Streaming chunks appear in preview |
| Disconnect | Clears session state |
| Happy path scenario | One-click runs full flow |
| Clear button | Clears logs and chat history |
| Event log | Operations produce log entries |

### 3. Integration Tests (Extension + Web App)

| Test | Description |
|------|-------------|
| Extension injects transport | `window.byom` available in examples app context |
| Full happy path | Extension popup → options → connect → webapp chat |

## Fixtures

### Extension Fixture
- Launches Chromium with persistent context
- Loads built extension from `apps/extension/dist/chromium/`
- Provides `extensionId` from service worker URL
- Provides `serviceWorker` handle
- Cleans up on test end

### Web App Fixture
- Uses Playwright `webServer` to start Vite dev server on port 5173
- Alternatively: build + preview on port 4173

## Tags

- `@smoke` — Critical path tests (extension loads, webapp connects, chat works)
- `@extension` — Extension-specific tests
- `@webapp` — Web app-specific tests
- `@integration` — Cross-component tests
- `@error` — Error/edge case scenarios

## Key Constraints

1. Extensions only work in Chromium with persistent context
2. Cannot use `channel: 'chromium'` with headless — use `headless: false` or `channel: 'chromium'` which supports headless as of recent Playwright versions
3. Each test gets a fresh persistent context (no shared state between tests)
4. Bridge/native messaging not available in test environment — tests use mock transport for webapp + chrome.storage manipulation for extension
5. Extension dist must be pre-built before running tests
