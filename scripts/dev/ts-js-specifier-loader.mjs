/**
 * Development ESM loader that:
 * 1) resolves ".js" specifiers to ".ts" (or ".mts") when needed, and
 * 2) transpiles TypeScript source on the fly via `typescript.transpileModule`.
 *
 * This keeps source-first workspaces runnable in dev mode without publishing
 * package artifacts first, and works on Node versions that do not natively
 * execute `.ts` files.
 */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let ts;
try {
  ts = require("typescript");
} catch (error) {
  const message =
    "Missing dependency: typescript. Run `npm ci` at repository root before starting the bridge/dev scripts.";
  throw new Error(
    error instanceof Error ? `${message} (${error.message})` : message,
  );
}

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      error == null ||
      typeof error !== "object" ||
      error.code !== "ERR_MODULE_NOT_FOUND" ||
      typeof specifier !== "string" ||
      !specifier.endsWith(".js")
    ) {
      throw error;
    }

    const tsSpecifier = `${specifier.slice(0, -3)}.ts`;
    try {
      return await nextResolve(tsSpecifier, context);
    } catch (tsError) {
      if (
        tsError == null ||
        typeof tsError !== "object" ||
        tsError.code !== "ERR_MODULE_NOT_FOUND"
      ) {
        throw tsError;
      }
    }

    const mtsSpecifier = `${specifier.slice(0, -3)}.mts`;
    return nextResolve(mtsSpecifier, context);
  }
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts") || url.endsWith(".mts")) {
    const source = await readFile(new URL(url), "utf8");
    const transpiled = ts.transpileModule(source, {
      fileName: fileURLToPath(url),
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        sourceMap: false,
        inlineSourceMap: false,
      },
    });

    return {
      format: "module",
      source: transpiled.outputText,
      shortCircuit: true,
    };
  }

  return nextLoad(url, context);
}
