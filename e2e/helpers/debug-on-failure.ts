import type { BrowserContext, Page, TestInfo } from "@playwright/test";

/**
 * Captures on-page debug context (error messages, feedback alerts, recent
 * logs) and attaches it to the Playwright test report when a test fails.
 *
 * Usage — single page:
 * ```ts
 * test.afterEach(async ({}, testInfo) => {
 *     await attachDebugOnFailure(page, testInfo);
 * });
 * ```
 *
 * Usage — multi-page / context (integration tests):
 * ```ts
 * test.afterEach(async ({ context }, testInfo) => {
 *     await attachContextDebugOnFailure(context, testInfo);
 * });
 * ```
 */
export async function attachDebugOnFailure(
    page: Page | null | undefined,
    testInfo: TestInfo,
): Promise<void> {
    if (testInfo.status === testInfo.expectedStatus) return; // test passed
    if (!page || page.isClosed()) return;

    const debug = await collectPageDebug(page);
    if (debug.length === 0) return;

    await testInfo.attach("on-page-debug-context", {
        body: debug,
        contentType: "text/plain",
    });
}

/**
 * Collect debug info from whichever page is open — works for the
 * extension popup, options page, and examples web app.
 *
 * Captures every known error / warning / feedback / status surface
 * so failures are immediately diagnosable from the HTML report.
 */
async function collectPageDebug(page: Page): Promise<string> {
    const sections: string[] = [];

    // ─────────────────────────────────────────────────
    //  Extension Popup (popup.html / popup-render.ts)
    // ─────────────────────────────────────────────────

    // Error banner(s) — role="alert", can be prepended multiple times
    const popupErrors = await safeAllTextContent(page, '.error-banner', 5);
    for (const text of popupErrors) {
        sections.push(`[Popup Error Banner]\n${text}`);
    }

    // Wallet header status chip (#wallet-status — READY / DEGRADED / etc.)
    const walletStatus = await safeTextContent(page, '#wallet-status');
    if (walletStatus) {
        sections.push(`[Wallet Status Chip] ${walletStatus}`);
    }

    // Warning count — "N record(s) skipped due to invalid format."
    const warningCount = await safeTextContent(page, '.warning-count');
    if (warningCount) {
        sections.push(`[Popup Warning Count]\n${warningCount}`);
    }

    // Provider status chips — every provider's current status
    const providerStatuses = await page.evaluate(() => {
        const cards = document.querySelectorAll('.provider-card');
        return Array.from(cards).map((card) => {
            const name = card.querySelector('.provider-card__name')?.textContent?.trim() ?? '?';
            const status = card.querySelector('.status-chip')?.textContent?.trim() ?? '?';
            const detail = card.querySelector('.provider-card__status-detail')?.textContent?.trim();
            const active = card.querySelector('.active-badge') ? ' [ACTIVE]' : '';
            return `${name}: ${status}${active}${detail ? ` — ${detail}` : ''}`;
        });
    }).catch(() => [] as string[]);
    if (providerStatuses.length > 0) {
        sections.push(`[Popup Provider Statuses]\n${providerStatuses.join('\n')}`);
    }

    // Empty state
    const emptyState = await safeTextContent(page, '.empty-state');
    if (emptyState) {
        sections.push(`[Popup Empty State]\n${emptyState.replace(/\s+/g, ' ').trim()}`);
    }

    // ─────────────────────────────────────────────────
    //  Extension Options Page (options.html / options.ts)
    // ─────────────────────────────────────────────────

    // Provider-connect feedback (#provider-connect-feedback)
    const connectFeedback = await safeTextContent(page, '#provider-connect-feedback');
    if (connectFeedback) {
        sections.push(`[Options Connect Feedback]\n${connectFeedback}`);
    }

    // Bridge security feedback (#bridge-security-feedback)
    const bridgeFeedback = await safeTextContent(page, '#bridge-security-feedback');
    if (bridgeFeedback) {
        sections.push(`[Options Bridge Feedback]\n${bridgeFeedback}`);
    }

    // Edit state message (#provider-edit-state)
    const editState = await safeTextContent(page, '#provider-edit-state');
    if (editState) {
        sections.push(`[Options Edit State] ${editState}`);
    }

    // Generic .options-feedback containers (there can be multiple)
    const optionsFeedbacks = await safeAllTextContent(page, '.options-feedback', 4);
    for (const text of optionsFeedbacks) {
        if (text.trim().length > 0) {
            sections.push(`[Options Feedback]\n${text}`);
        }
    }

    // Provider statuses in the options page sidebar list
    const optionsProviderStatuses = await page.evaluate(() => {
        const badges = document.querySelectorAll('.provider-status');
        return Array.from(badges).map((badge) => {
            const row = badge.closest('.provider-row, [class*="provider"]');
            const name = row?.querySelector('.provider-name, [class*="name"]')?.textContent?.trim() ?? '';
            return `${name ? name + ': ' : ''}${badge.textContent?.trim() ?? '?'}`;
        });
    }).catch(() => [] as string[]);
    if (optionsProviderStatuses.length > 0) {
        sections.push(`[Options Provider Statuses]\n${optionsProviderStatuses.join('\n')}`);
    }

    // ─────────────────────────────────────────────────
    //  Examples Web App (App.tsx — Mantine components)
    // ─────────────────────────────────────────────────

    // All Mantine Alerts (feedback, transport detection, scenario outcome)
    const alerts = await page.evaluate(() => {
        const els = document.querySelectorAll('[class*="Alert"]');
        return Array.from(els).slice(0, 5).map((el) => {
            const title = el.querySelector('[class*="AlertTitle"]')?.textContent?.trim() ?? '';
            const body = el.textContent?.trim() ?? '';
            return title ? `${title}: ${body}` : body;
        });
    }).catch(() => [] as string[]);
    for (const text of alerts) {
        if (text.length > 0) {
            sections.push(`[App Alert]\n${text}`);
        }
    }

    // Connection + state badges
    const badges = await page.evaluate(() => {
        const els = document.querySelectorAll('[class*="Badge"]');
        const headerBadges = Array.from(els)
            .filter((el) => {
                const text = el.textContent?.trim() ?? '';
                return /^(CONNECTED|DISCONNECTED|connecting|connected|disconnected|degraded|failed|reconnecting)$/i.test(text);
            })
            .map((el) => el.textContent?.trim() ?? '');
        return headerBadges;
    }).catch(() => [] as string[]);
    if (badges.length > 0) {
        sections.push(`[App Status Badges] ${badges.join(' | ')}`);
    }

    // Stream preview (may hold partial error or response)
    const streamPreview = await safeTextContent(page, '.mono-text');
    if (streamPreview && streamPreview !== 'No active stream.') {
        const truncated = streamPreview.length > 300 ? streamPreview.slice(0, 300) + '…' : streamPreview;
        sections.push(`[App Stream Preview]\n${truncated}`);
    }

    // Last 3 event log entries (newest first)
    const logTexts = await page.evaluate(() => {
        const cards = Array.from(
            document.querySelectorAll('[class*="Card"]'),
        ).filter((card) => {
            const badge = card.querySelector('[class*="Badge"]');
            return badge && /info|success|error/i.test(badge.textContent ?? '');
        });
        return cards.slice(0, 3).map((card) => (card.textContent ?? '').trim());
    }).catch(() => [] as string[]);
    if (logTexts.length > 0) {
        sections.push(`[App Event Log (last 3)]\n${logTexts.join('\n---\n')}`);
    }

    // ─────────────────────────────────────────────────
    //  Generic fallbacks (ARIA roles)
    // ─────────────────────────────────────────────────

    // Any role="alert" not already captured
    const ariaAlerts = await safeAllTextContent(page, '[role="alert"]', 5);
    for (const text of ariaAlerts) {
        if (text.trim().length > 0 && !sections.some((s) => s.includes(text.trim()))) {
            sections.push(`[ARIA Alert]\n${text}`);
        }
    }

    // Any role="status" not already captured
    const ariaStatuses = await safeAllTextContent(page, '[role="status"]', 5);
    for (const text of ariaStatuses) {
        if (text.trim().length > 0 && !sections.some((s) => s.includes(text.trim()))) {
            sections.push(`[ARIA Status]\n${text}`);
        }
    }

    return sections.join('\n\n');
}

async function safeTextContent(
    page: Page,
    selector: string,
): Promise<string | null> {
    try {
        const el = page.locator(selector).first();
        if (!(await el.isVisible({ timeout: 500 }))) return null;
        return (await el.textContent()) ?? null;
    } catch {
        return null;
    }
}

async function safeAllTextContent(
    page: Page,
    selector: string,
    max: number,
): Promise<string[]> {
    try {
        const els = page.locator(selector);
        const count = Math.min(await els.count(), max);
        const results: string[] = [];
        for (let i = 0; i < count; i++) {
            const text = await els.nth(i).textContent();
            if (text) results.push(text.trim());
        }
        return results;
    } catch {
        return [];
    }
}

/**
 * Captures debug context from **all open pages** in a BrowserContext.
 * Useful for integration tests that open extension popup, options, and
 * webapp pages within the same test.
 */
export async function attachContextDebugOnFailure(
    context: BrowserContext | null | undefined,
    testInfo: TestInfo,
): Promise<void> {
    if (testInfo.status === testInfo.expectedStatus) return;
    if (!context) return;

    const pages = context.pages();
    const sections: string[] = [];

    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        if (page.isClosed()) continue;
        const url = page.url();
        const debug = await collectPageDebug(page);
        if (debug.length > 0) {
            sections.push(`=== Page ${i + 1}: ${url} ===\n${debug}`);
        }
    }

    if (sections.length === 0) return;

    await testInfo.attach("on-page-debug-context", {
        body: sections.join("\n\n"),
        contentType: "text/plain",
    });
}
