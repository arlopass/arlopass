import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'Arlopass/arlopass';

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface Release {
  tag_name: string;
  draft: boolean;
  assets: ReleaseAsset[];
}

/**
 * Fetches an installer script from the latest bridge GitHub release.
 * Falls back to the local source file if no release is found or the fetch fails.
 * Called once at build time (SSG) so the result is baked into the static output.
 */
export async function fetchInstaller(filename: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases?per_page=20`,
      { headers: { Accept: 'application/vnd.github+json' } },
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);

    const releases: Release[] = await res.json();
    const release = releases.find(
      (r) => r.tag_name.startsWith('bridge/v') && !r.draft,
    );
    if (!release) throw new Error('No bridge release found');

    const asset = release.assets.find((a) => a.name === filename);
    if (!asset) throw new Error(`${filename} not in release ${release.tag_name}`);

    const scriptRes = await fetch(asset.browser_download_url);
    if (!scriptRes.ok) throw new Error(`Download failed: ${scriptRes.status}`);

    console.log(`[installer] Fetched ${filename} from ${release.tag_name}`);
    return await scriptRes.text();
  } catch (e) {
    console.warn(
      `[installer] GitHub fetch failed for ${filename}, using local copy:`,
      e instanceof Error ? e.message : e,
    );
    return readFileSync(
      resolve(process.cwd(), '..', '..', 'scripts', 'installers', filename),
      'utf-8',
    );
  }
}
