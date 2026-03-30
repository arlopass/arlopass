import { useState, useEffect } from 'react';

const REPO = 'Arlopass/arlopass';

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface Release {
  tag_name: string;
  draft: boolean;
  assets: ReleaseAsset[];
}

interface Download {
  os: string;
  osLabel: string;
  arch: string;
  archLabel: string;
  url: string;
  filename: string;
  size: number;
}

const TARGETS = [
  { os: 'win', osLabel: 'Windows', arch: 'x64', archLabel: 'x64' },
  { os: 'macos', osLabel: 'macOS', arch: 'x64', archLabel: 'Intel' },
  { os: 'macos', osLabel: 'macOS', arch: 'arm64', archLabel: 'Apple Silicon' },
  { os: 'linux', osLabel: 'Linux', arch: 'x64', archLabel: 'x64' },
  { os: 'linux', osLabel: 'Linux', arch: 'arm64', archLabel: 'ARM64' },
] as const;

function detectOS(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'win';
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

const CACHE_KEY = 'arlopass-bridge-release';
const CACHE_TTL = 5 * 60 * 1000;

export default function BridgeDownloads() {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [version, setVersion] = useState('');
  const [checksumsUrl, setChecksumsUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userOS, setUserOS] = useState('unknown');

  useEffect(() => {
    setUserOS(detectOS());
    void fetchRelease();
  }, []);

  async function fetchRelease() {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        if (Date.now() - data.timestamp < CACHE_TTL) {
          setDownloads(data.downloads);
          setVersion(data.version);
          setChecksumsUrl(data.checksumsUrl);
          setLoading(false);
          return;
        }
      }
    } catch {
      /* ignore cache errors */
    }

    try {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/releases?per_page=20`,
      );
      if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);

      const releases: Release[] = await res.json();
      const release = releases.find(
        (r) => r.tag_name.startsWith('bridge/v') && !r.draft,
      );
      if (!release) throw new Error('No bridge release found');

      const ver = release.tag_name.replace('bridge/', '');
      const dls: Download[] = [];

      for (const target of TARGETS) {
        const ext = target.os === 'win' ? '.exe' : '';
        const filename = `arlopass-bridge-${target.os}-${target.arch}${ext}`;
        const asset = release.assets.find((a) => a.name === filename);
        if (asset) {
          dls.push({
            ...target,
            url: asset.browser_download_url,
            filename: asset.name,
            size: asset.size,
          });
        }
      }

      const checksums = release.assets.find(
        (a) => a.name === 'SHA256SUMS.txt',
      );

      setDownloads(dls);
      setVersion(ver);
      setChecksumsUrl(checksums?.browser_download_url ?? '');

      try {
        sessionStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            downloads: dls,
            version: ver,
            checksumsUrl: checksums?.browser_download_url ?? '',
            timestamp: Date.now(),
          }),
        );
      } catch {
        /* quota exceeded */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load releases');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-10 px-4 md:px-6 lg:px-8 pb-10">
        <div className="animate-pulse space-y-3">
          <div
            className="h-5 w-48 rounded"
            style={{ backgroundColor: 'var(--ap-bg-elevated)' }}
          />
          <div
            className="h-4 w-72 rounded"
            style={{ backgroundColor: 'var(--ap-bg-elevated)' }}
          />
          <div className="flex flex-wrap gap-3 mt-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-10 w-40 rounded-lg"
                style={{ backgroundColor: 'var(--ap-bg-elevated)' }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || downloads.length === 0) {
    return (
      <div className="mt-10 px-4 md:px-6 lg:px-8 pb-10">
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'var(--ap-text-secondary)' }}
        >
          Download the bridge binary directly.{' '}
          <a
            href={`https://github.com/${REPO}/releases`}
            className="font-medium no-underline"
            style={{ color: 'var(--ap-text-link)' }}
            target="_blank"
            rel="noopener noreferrer"
          >
            View all releases on GitHub →
          </a>
        </p>
      </div>
    );
  }

  // Sort: user's OS first
  const sortedDownloads = [...downloads].sort((a, b) => {
    const aMatch = a.os === userOS ? 0 : 1;
    const bMatch = b.os === userOS ? 0 : 1;
    return aMatch - bMatch;
  });

  return (
    <div className="mt-10 px-4 md:px-6 lg:px-8 pb-10">
      <p
        className="text-sm font-medium mb-1"
        style={{ color: 'var(--ap-text-primary)' }}
      >
        Download for your platform
        {version && (
          <span
            className="ml-2 text-xs font-mono font-normal"
            style={{ color: 'var(--ap-text-tertiary)' }}
          >
            {version}
          </span>
        )}
      </p>
      <p
        className="text-sm mb-5"
        style={{ color: 'var(--ap-text-secondary)' }}
      >
        Download the pre-built binary for your platform. Or use the
        one-line terminal installers below for automatic setup including
        native messaging host registration.
      </p>

      <div className="flex flex-wrap gap-2.5">
        {sortedDownloads.map((dl) => (
          <a
            key={dl.filename}
            href={dl.url}
            download
            className="group inline-flex items-center gap-2 text-sm font-medium py-2.5 px-4 rounded-lg no-underline transition-all duration-150"
            style={{
              color:
                dl.os === userOS
                  ? 'var(--ap-cta-text)'
                  : 'var(--ap-text-primary)',
              backgroundColor:
                dl.os === userOS ? 'var(--ap-cta-bg)' : 'transparent',
              border:
                dl.os === userOS
                  ? '1px solid transparent'
                  : '1px solid var(--ap-border-strong)',
            }}
            onMouseEnter={(e) => {
              if (dl.os !== userOS) {
                e.currentTarget.style.borderColor = 'var(--ap-text-tertiary)';
                e.currentTarget.style.backgroundColor =
                  'var(--ap-bg-surface)';
              }
            }}
            onMouseLeave={(e) => {
              if (dl.os !== userOS) {
                e.currentTarget.style.borderColor = 'var(--ap-border-strong)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {dl.osLabel} {dl.archLabel}
            <span
              className="text-xs font-normal"
              style={{
                color:
                  dl.os === userOS
                    ? 'var(--ap-text-tertiary)'
                    : 'var(--ap-text-tertiary)',
                opacity: dl.os === userOS ? 0.7 : 1,
              }}
            >
              {formatSize(dl.size)}
            </span>
          </a>
        ))}
      </div>

      <p
        className="mt-4 text-xs"
        style={{ color: 'var(--ap-text-tertiary)' }}
      >
        {checksumsUrl && (
          <>
            <a
              href={checksumsUrl}
              className="no-underline hover:underline"
              style={{ color: 'var(--ap-text-tertiary)' }}
              target="_blank"
              rel="noopener noreferrer"
            >
              SHA-256 checksums
            </a>
            {' · '}
          </>
        )}
        <a
          href={`https://github.com/${REPO}/releases`}
          className="no-underline hover:underline"
          style={{ color: 'var(--ap-text-tertiary)' }}
          target="_blank"
          rel="noopener noreferrer"
        >
          All releases on GitHub
        </a>
      </p>
    </div>
  );
}
