"use client";

import { ConnectionStatus } from "@arlopass/react-ui";
import {
  ArlopassNotInstalled,
  ArlopassDisconnected,
  ArlopassConnected,
} from "@arlopass/react/guards";

export type ArlopassConnectionBannerProps = {
  /** URL where users can install the Arlopass extension */
  installUrl?: string;
  /** CSS class for the root element */
  className?: string;
};

export function ArlopassConnectionBanner({
  installUrl = "https://chromewebstore.google.com",
  className,
}: ArlopassConnectionBannerProps) {
  return (
    <ConnectionStatus className={className}>
      <ArlopassNotInstalled>
        <div className="flex items-center gap-3 rounded-lg border border-amber-300/40 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
          <span className="flex-1">
            Arlopass extension not detected.{" "}
            <a
              href={installUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium hover:text-amber-900 dark:hover:text-amber-200"
            >
              Install it
            </a>{" "}
            to connect your AI providers.
          </span>
        </div>
      </ArlopassNotInstalled>

      <ArlopassDisconnected>
        <div className="flex items-center gap-3 rounded-lg border border-red-300/40 dark:border-red-700/40 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-xs text-red-800 dark:text-red-300">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
          <span className="flex-1">
            Disconnected from Arlopass. Check that the extension is enabled and
            reload the page.
          </span>
        </div>
      </ArlopassDisconnected>

      <ArlopassConnected>
        <div className="flex items-center gap-3 rounded-lg border border-emerald-300/40 dark:border-emerald-700/40 bg-emerald-50 dark:bg-emerald-950/30 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-300">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
          <span className="flex-1">Connected to Arlopass.</span>
        </div>
      </ArlopassConnected>
    </ConnectionStatus>
  );
}
