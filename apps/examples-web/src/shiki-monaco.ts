/**
 * Shiki → Monaco integration.
 *
 * Registers TextMate grammars from Shiki with Monaco so that languages
 * like TSX, JSX, CSS, JSON, bash, and HTML get accurate highlighting
 * (Monaco's built-in tokenizer only supports plain TS / JS).
 *
 * Usage: call `setupShikiMonaco(monaco)` from `<Editor beforeMount={…}>`.
 * The setup is idempotent — safe to call on every editor mount.
 */
import { shikiToMonaco } from "@shikijs/monaco";
import { createHighlighter, type Highlighter } from "shiki";
import type { Monaco } from "@monaco-editor/react";

let highlighterPromise: Promise<Highlighter> | null = null;
let registered = false;

const THEME = "github-light";

const LANGS = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "css",
  "json",
  "html",
  "shell",
] as const;

function getHighlighter(): Promise<Highlighter> {
  if (highlighterPromise === null) {
    highlighterPromise = createHighlighter({
      themes: [THEME],
      langs: [...LANGS],
    });
  }
  return highlighterPromise;
}

/**
 * Register Shiki grammars + theme with the given Monaco instance.
 * Call this from `<Editor beforeMount={setupShikiMonaco}>`.
 */
export async function setupShikiMonaco(monaco: Monaco): Promise<void> {
  if (registered) return;

  const highlighter = await getHighlighter();

  // Register each language with Monaco so Shiki can take over tokenization
  for (const lang of LANGS) {
    monaco.languages.register({ id: lang });
  }

  // Disable TypeScript/JavaScript diagnostics entirely.
  // These are read-only code blocks — Monaco's TS compiler has no tsconfig,
  // no JSX mode, and no ambient types, so it produces false positives
  // (e.g., "Unreachable code detected" on JSX elements).
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
    noSuggestionDiagnostics: true,
  });
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
    noSuggestionDiagnostics: true,
  });

  // Enable JSX in the TS compiler options so it doesn't flag JSX as errors
  // even if diagnostics are re-enabled in the future.
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
  });
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
  });

  shikiToMonaco(highlighter, monaco);
  registered = true;
}

/** The Shiki theme name to use as the Monaco theme. */
export const SHIKI_THEME = THEME;
