import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

// Configure marked for safe, compact output
marked.setOptions({
  breaks: true,
  gfm: true,
});

export type MarkdownProps = {
  content: string;
  className?: string | undefined;
};

/**
 * Renders markdown content as sanitized HTML.
 * Supports streaming — re-renders on every content update.
 * Uses marked for parsing + DOMPurify for XSS protection.
 */
export function Markdown({ content, className }: MarkdownProps) {
  const html = useMemo(() => {
    const raw = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [content]);

  return (
    <div
      className={className}
      style={{ fontSize: 14, lineHeight: 1.6 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
