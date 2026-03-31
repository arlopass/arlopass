import { useState, useEffect } from "react";

const REPO = "Arlopass/arlopass";

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
  { os: "win", osLabel: "Windows", arch: "x64", archLabel: "x64" },
  { os: "macos", osLabel: "macOS", arch: "x64", archLabel: "Intel" },
  { os: "macos", osLabel: "macOS", arch: "arm64", archLabel: "Apple Silicon" },
  { os: "linux", osLabel: "Linux", arch: "x64", archLabel: "x64" },
  { os: "linux", osLabel: "Linux", arch: "arm64", archLabel: "ARM64" },
] as const;

/* ── Windows icon as inline SVG (uses currentColor to match palette) ── */
function WindowsIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 4875 4875"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M0 0h2311v2310H0zm2564 0h2311v2310H2564zM0 2564h2311v2311H0zm2564 0h2311v2311H2564" />
    </svg>
  );
}

const OS_OPTIONS = [
  {
    os: "macos",
    label: "macOS",
    note: "macOS 12+ recommended",
    defaultArch: "arm64",
  },
  {
    os: "win",
    label: "Windows",
    note: "Windows 10+ recommended",
    defaultArch: "x64",
  },
  {
    os: "linux",
    label: "Linux",
    note: "x64 and ARM64",
    defaultArch: "x64",
  },
] as const;

function detectOS(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "win";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

const CACHE_KEY = "arlopass-bridge-release";
const CACHE_TTL = 5 * 60 * 1000;

export default function BridgeDownloads() {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [, setVersion] = useState("");
  const [checksumsUrl, setChecksumsUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setUserOS] = useState("unknown");
  const [selectedOS, setSelectedOS] = useState("unknown");

  useEffect(() => {
    const os = detectOS();
    setUserOS(os);
    setSelectedOS(os);
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
        (r) => r.tag_name.startsWith("bridge/v") && !r.draft,
      );
      if (!release) throw new Error("No bridge release found");

      const ver = release.tag_name.replace("bridge/", "");
      const dls: Download[] = [];

      for (const target of TARGETS) {
        const ext = target.os === "win" ? ".exe" : "";
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

      const checksums = release.assets.find((a) => a.name === "SHA256SUMS.txt");

      setDownloads(dls);
      setVersion(ver);
      setChecksumsUrl(checksums?.browser_download_url ?? "");

      try {
        sessionStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            downloads: dls,
            version: ver,
            checksumsUrl: checksums?.browser_download_url ?? "",
            timestamp: Date.now(),
          }),
        );
      } catch {
        /* quota exceeded */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load releases");
    } finally {
      setLoading(false);
    }
  }

  const activeOS = OS_OPTIONS.find((o) => o.os === selectedOS) ?? OS_OPTIONS[1];
  const osDownloads = downloads.filter((d) => d.os === activeOS.os);
  const primary =
    osDownloads.find((d) => d.arch === activeOS.defaultArch) ?? osDownloads[0];
  const alts = osDownloads.filter((d) => d !== primary);

  /* ── Loading skeleton ─────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex flex-col items-start justify-center p-10 lg:py-20 lg:px-12 h-full min-h-[480px]">
        <div className="animate-pulse flex flex-col items-start gap-6 w-full max-w-[320px]">
          <div className="h-12 w-full rounded-lg bg-[var(--ap-bg-elevated)]" />
          <div className="h-4 w-48 rounded bg-[var(--ap-bg-elevated)]" />
          <div className="flex gap-6 mt-6">
            <div className="h-7 w-7 rounded bg-[var(--ap-bg-elevated)]" />
            <div className="h-7 w-7 rounded bg-[var(--ap-bg-elevated)]" />
            <div className="h-7 w-7 rounded bg-[var(--ap-bg-elevated)]" />
          </div>
          <div className="h-3 w-40 rounded bg-[var(--ap-bg-elevated)] mt-6" />
        </div>
      </div>
    );
  }

  /* ── Error / no releases fallback ─────────────────────── */
  if (error || downloads.length === 0) {
    return (
      <div className="flex items-start justify-center flex-col p-10 lg:py-20 lg:px-12 h-full min-h-[480px]">
        <p className="text-sm text-[var(--ap-text-secondary)]">
          Download binaries directly from{" "}
          <a
            href={`https://github.com/${REPO}/releases`}
            className="font-medium text-[var(--ap-text-link)] no-underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub Releases →
          </a>
        </p>
      </div>
    );
  }

  /* ── Centered download layout ─────────────────────────── */
  return (
    <div className="flex flex-col items-start justify-center p-10 lg:py-20 lg:px-12 h-full min-h-[480px]">
      {/* ── Primary CTA ─────────────────────────────────── */}
      {primary ? (
        <a
          href={primary.url}
          download
          className="inline-flex items-center gap-3 text-base font-medium py-3.5 px-8 rounded-lg no-underline transition-opacity duration-150 hover:opacity-85 text-[var(--ap-cta-text)] bg-[var(--ap-cta-bg)]"
        >
          {activeOS.os === "win" ? (
            <WindowsIcon size={18} />
          ) : (
            <img
              src={
                activeOS.os === "macos" ? "/img/apple.svg" : "/img/linux.svg"
              }
              alt=""
              width="18"
              height="18"
              aria-hidden="true"
              style={{ filter: "brightness(0)" }}
            />
          )}
          Download for {activeOS.label}
        </a>
      ) : (
        <span className="text-sm text-[var(--ap-text-tertiary)]">
          No download available for {activeOS.label}
        </span>
      )}

      {/* ── Requirement note ────────────────────────────── */}
      <p className="mt-4 text-sm text-[var(--ap-text-tertiary)]">
        {activeOS.note}
        {primary && (
          <span className="font-mono ml-1.5">· {formatSize(primary.size)}</span>
        )}
      </p>

      {/* ── Windows SmartScreen note ────────────────────── */}
      {activeOS.os === "win" && (
        <p className="mt-5 text-sm text-[var(--ap-text-secondary)] leading-relaxed max-w-[340px]">
          The bridge isn't code-signed yet. After downloading, Windows
          SmartScreen may appear — click{" "}
          <strong className="text-[var(--ap-text-primary)]">"More info"</strong>{" "}
          then{" "}
          <strong className="text-[var(--ap-text-primary)]">
            "Run anyway"
          </strong>
          .
        </p>
      )}

      {/* ── OS switcher icons ───────────────────────────── */}
      <div className="flex items-center gap-6 mt-8">
        {OS_OPTIONS.map((opt) => {
          const isActive = opt.os === selectedOS;
          return (
            <button
              key={opt.os}
              type="button"
              onClick={() => setSelectedOS(opt.os)}
              className={`p-2 rounded-lg border-none cursor-pointer transition-all duration-150 bg-transparent ${
                isActive
                  ? "text-[var(--ap-text-primary)]"
                  : "text-[var(--ap-text-tertiary)] opacity-50 hover:opacity-80 hover:text-[var(--ap-text-secondary)]"
              }`}
              aria-label={`Download for ${opt.label}`}
              aria-pressed={isActive}
            >
              {opt.os === "win" ? (
                <WindowsIcon size={26} />
              ) : (
                <img
                  src={opt.os === "macos" ? "/img/apple.svg" : "/img/linux.svg"}
                  alt={opt.label}
                  width="26"
                  height="26"
                  className="block"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Divider ─────────────────────────────────────── */}
      <div className="w-12 border-t border-[var(--ap-border)] mt-8" />

      {/* ── Other download options ──────────────────────── */}
      <div className="flex flex-col items-start gap-2.5 mt-6">
        <span className="text-xs font-medium text-[var(--ap-text-tertiary)] tracking-wide uppercase">
          Other download options
        </span>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {alts.map((dl) => (
            <a
              key={dl.filename}
              href={dl.url}
              download
              className="text-xs text-[var(--ap-text-tertiary)] no-underline transition-colors duration-150 hover:text-[var(--ap-text-secondary)] hover:underline"
            >
              {dl.archLabel}
            </a>
          ))}
          {checksumsUrl && (
            <a
              href={checksumsUrl}
              className="text-xs text-[var(--ap-text-tertiary)] no-underline transition-colors duration-150 hover:text-[var(--ap-text-secondary)] hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Checksums
            </a>
          )}
          <a
            href={`https://github.com/${REPO}/releases`}
            className="text-xs font-medium text-[var(--ap-text-secondary)] no-underline transition-colors duration-150 hover:text-[var(--ap-text-primary)] hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            All versions
          </a>
        </div>
      </div>
    </div>
  );
}
