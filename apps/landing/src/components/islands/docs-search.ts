/**
 * Simplified docs search for the ChatSidebar.
 * Searches through nav labels and category names from the docs navigation data.
 */

import { DOCS_NAV, ALL_DOCS, type NavItem } from "../../data/docs-nav";

export type DocsSearchResult = {
  slug: string;
  label: string;
  category: string;
};

/**
 * Search docs pages by query string.
 * Matches against page labels and category names (case-insensitive).
 */
export function searchDocs(query: string): DocsSearchResult[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const results: DocsSearchResult[] = [];

  for (const cat of DOCS_NAV) {
    for (const item of cat.items) {
      if (
        item.label.toLowerCase().includes(q) ||
        cat.label.toLowerCase().includes(q) ||
        item.slug.toLowerCase().includes(q)
      ) {
        results.push({
          slug: item.slug,
          label: item.label,
          category: cat.label,
        });
      }
    }
  }

  return results;
}

/**
 * Get a doc page by slug.
 */
export function getDocBySlug(slug: string): NavItem | undefined {
  return ALL_DOCS.find((item) => item.slug === slug);
}
