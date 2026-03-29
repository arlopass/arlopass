import { Spotlight, spotlight } from "@mantine/spotlight";
import type {
  SpotlightActionData,
  SpotlightFilterFunction,
} from "@mantine/spotlight";
import { IconFileText, IconSearch } from "@tabler/icons-react";
import { NAVIGATION } from "../navigation";
import { DOCS } from "../docs-context";
import { navigate } from "../router";

/* ─── Build content index (once at module load) ───────────────────── */

/** For each nav item, collect a searchable string from matching DOCS entries */
const contentIndex = new Map<string, string>();

for (const cat of NAVIGATION) {
  for (const item of cat.items) {
    const slug = item.id.split("/").pop()!;
    const labelLower = item.label.toLowerCase();
    const parts: string[] = [item.label, cat.label];

    for (const doc of DOCS) {
      const slugMatch = slug.includes(doc.id) || doc.id.includes(slug);
      const titleWords = doc.title
        .toLowerCase()
        .split(/[\s()/]+/)
        .filter((w) => w.length > 2);
      const titleOverlap = titleWords.some((w) => labelLower.includes(w));
      const keywordHit = doc.keywords.some(
        (kw) =>
          labelLower.includes(kw) || slug.includes(kw.replace(/\s+/g, "-")),
      );

      if (slugMatch || titleOverlap || keywordHit) {
        parts.push(doc.title, doc.content, ...doc.keywords);
      }
    }

    contentIndex.set(item.id, parts.join(" ").toLowerCase());
  }
}

/* ─── Fuzzy helpers ───────────────────────────────────────────────── */

/** Check if all characters of `needle` appear in order in `haystack`. */
function fuzzyMatch(needle: string, haystack: string): boolean {
  let j = 0;
  for (let i = 0; i < haystack.length && j < needle.length; i++) {
    if (haystack[i] === needle[j]) j++;
  }
  return j === needle.length;
}

/* ─── Custom filter: scored fuzzy search across titles + content ─── */

const fuzzyFilter: SpotlightFilterFunction = (query, actions) => {
  const q = query.toLowerCase().trim();
  if (!q) return actions;

  const terms = q.split(/\s+/).filter((t) => t.length > 0);

  const scored = actions
    .map((action) => {
      if (!("label" in action)) return null;
      const a = action as SpotlightActionData;
      let score = 0;
      const label = (a.label ?? "").toLowerCase();
      const desc = (a.description ?? "").toLowerCase();
      const content = contentIndex.get(a.id) ?? "";

      for (const term of terms) {
        // Exact substring matches (weighted by field)
        if (label.includes(term)) score += 10;
        if (desc.includes(term)) score += 3;
        if (content.includes(term)) score += 5;

        // Subsequence fuzzy match on label as fallback
        if (score === 0 && term.length > 1 && fuzzyMatch(term, label)) {
          score += 2;
        }
      }

      return score > 0 ? { action: a, score } : null;
    })
    .filter(Boolean) as { action: SpotlightActionData; score: number }[];

  return scored.sort((a, b) => b.score - a.score).map((s) => s.action);
};

/* ─── Actions ─────────────────────────────────────────────────────── */

const actions: SpotlightActionData[] = NAVIGATION.flatMap((cat) =>
  cat.items.map((item) => ({
    id: item.id,
    label: item.label,
    description: cat.label,
    onClick: () => navigate(item.id),
    leftSection: <IconFileText size={18} stroke={1.5} />,
  })),
);

/* ─── Component ───────────────────────────────────────────────────── */

export function DocsSpotlight() {
  return (
    <Spotlight
      actions={actions}
      filter={fuzzyFilter}
      limit={8}
      shortcut={["mod + K"]}
      highlightQuery
      nothingFound="No docs found"
      searchProps={{
        leftSection: <IconSearch size={18} stroke={1.5} />,
        placeholder: "Search docs...",
      }}
      styles={{
        content: {
          background: "var(--ap-bg-elevated)",
          border: "1px solid var(--ap-border)",
        },
        search: {
          background: "var(--ap-bg-surface)",
          color: "var(--ap-text-body)",
          borderBottom: "1px solid var(--ap-border)",
        },
        action: {
          "&[data-selected]": {
            background: "var(--ap-brand-subtle-dark)",
          },
        },
      }}
    />
  );
}

export { spotlight };
