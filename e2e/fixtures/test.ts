/**
 * Unified test export that merges extension fixtures with Playwright defaults.
 *
 * Import from this file in every spec:
 *   import { test, expect } from "../../fixtures/test";
 */
export { extensionTest as test, expect } from "./extension.fixture";
