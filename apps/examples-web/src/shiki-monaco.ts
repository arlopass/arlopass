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

  shikiToMonaco(highlighter, monaco);
  registered = true;
}

/** The Shiki theme name to use as the Monaco theme. */
export const SHIKI_THEME = THEME;
