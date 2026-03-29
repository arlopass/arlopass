import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const CONTENT_DIR = join(import.meta.dirname, '..', 'src', 'content', 'docs');
const DIST_DIR = join(import.meta.dirname, '..', 'dist');
const SITE_URL = 'https://arlopass.com';

interface DocEntry {
  slug: string;
  title: string;
  description: string;
  category: string;
  order: number;
  content: string;
}

async function findMdxFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.mdx'))
    .map((e) => join(e.parentPath || e.path, e.name));
}

function parseFrontmatter(raw: string): { data: Record<string, any>; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };

  const yamlBlock = match[1]!;
  const content = match[2]!;
  const data: Record<string, any> = {};

  for (const line of yamlBlock.split('\n')) {
    const trimmed = line.trim();
    // Skip array lines (e.g. keywords: [...]) and empty lines
    if (!trimmed || trimmed.startsWith('-') || trimmed.startsWith('[')) continue;
    // Match key: value pairs (with optional quotes around value)
    const m = trimmed.match(/^(\w+):\s*(?:"([^"]*)"|'([^']*)'|(\d+)|(.+))\s*$/);
    if (!m) continue;
    const key = m[1]!;
    const value = m[2] ?? m[3] ?? m[4] ?? m[5];
    if (value === undefined) continue;
    // Parse integers
    if (/^\d+$/.test(value)) {
      data[key] = parseInt(value, 10);
    } else {
      data[key] = value.trim();
    }
  }

  return { data, content };
}

function stripJsx(content: string): string {
  return content
    .split('\n')
    .filter((line) => !line.startsWith('import ') && !line.startsWith('export '))
    .join('\n')
    .replace(/<[A-Z][^>]*\/>/g, '') // self-closing JSX
    .replace(/<[A-Z][^>]*>[\s\S]*?<\/[A-Z][^>]*>/g, '') // paired JSX
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function main() {
  const files = await findMdxFiles(CONTENT_DIR);
  const docs: DocEntry[] = [];

  for (const file of files) {
    const raw = await readFile(file, 'utf-8');
    const { data, content } = parseFrontmatter(raw);
    const slug = relative(CONTENT_DIR, file).replace(/\.mdx$/, '').replace(/\\/g, '/');

    docs.push({
      slug,
      title: data.title || slug,
      description: data.description || '',
      category: data.category || 'Uncategorized',
      order: data.order || 99,
      content: stripJsx(content),
    });
  }

  // Sort by category then order
  docs.sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order);

  // Generate llms.txt (concise index)
  const categories = new Map<string, DocEntry[]>();
  for (const doc of docs) {
    if (!categories.has(doc.category)) categories.set(doc.category, []);
    categories.get(doc.category)!.push(doc);
  }

  let llmsTxt = `# Arlopass Documentation\n\n`;
  llmsTxt += `> Open-source AI access management for the web. Arlopass is a browser extension and developer SDK that lets web apps use a user's own AI providers without touching API keys.\n\n`;

  for (const [category, entries] of categories) {
    llmsTxt += `## ${category}\n`;
    for (const doc of entries) {
      llmsTxt += `- [${doc.title}](${SITE_URL}/docs/${doc.slug}): ${doc.description}\n`;
    }
    llmsTxt += '\n';
  }

  // Generate llms-full.txt (full content)
  let llmsFullTxt = `# Arlopass Documentation — Full Content\n\n`;
  llmsFullTxt += `> Complete documentation for the Arlopass AI wallet SDK.\n`;
  llmsFullTxt += `> Homepage: ${SITE_URL}\n`;
  llmsFullTxt += `> Documentation: ${SITE_URL}/docs\n\n`;

  for (const doc of docs) {
    llmsFullTxt += `---\n\n`;
    llmsFullTxt += `## ${doc.title}\n\n`;
    if (doc.description) llmsFullTxt += `${doc.description}\n\n`;
    llmsFullTxt += `URL: ${SITE_URL}/docs/${doc.slug}\n\n`;
    llmsFullTxt += doc.content;
    llmsFullTxt += '\n\n';
  }

  await writeFile(join(DIST_DIR, 'llms.txt'), llmsTxt, 'utf-8');
  await writeFile(join(DIST_DIR, 'llms-full.txt'), llmsFullTxt, 'utf-8');

  console.log(`Generated llms.txt (${docs.length} pages, ${llmsTxt.length} bytes)`);
  console.log(`Generated llms-full.txt (${docs.length} pages, ${llmsFullTxt.length} bytes)`);
}

main().catch(console.error);
