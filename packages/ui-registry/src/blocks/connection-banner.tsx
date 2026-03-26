"use client";

import { ConnectionStatus } from "@byom-ai/react-ui";
import {
  BYOMNotInstalled,
  BYOMDisconnected,
  BYOMConnected,
} from "@byom-ai/react/guards";

export type BYOMConnectionBannerProps = {
  /** URL where users can install the BYOM extension */
  installUrl?: string;
  /** CSS class for the root element */
  className?: string;
};

export function BYOMConnectionBanner({
  installUrl = "https://chromewebstore.google.com",
  className,
}: BYOMConnectionBannerProps) {
  return (
    <ConnectionStatus className={className}>
      <BYOMNotInstalled>
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <span className="flex-1">
            BYOM extension not detected.{" "}
            <a
              href={installUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium hover:text-amber-900 dark:hover:text-amber-100"
            >
              Install it
            </a>{" "}
            to connect to AI providers.
          </span>
        </div>
      </BYOMNotInstalled>

      <BYOMDisconnected>
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
          <span className="flex-1">
            Disconnected from BYOM extension. Check that the extension is enabled and reload.
          </span>
        </div>
      </BYOMDisconnected>

      <BYOMConnected>
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950 px-4 py-3 text-sm text-green-800 dark:text-green-200">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          <span className="flex-1">Connected to BYOM extension.</span>
        </div>
      </BYOMConnected>
    </ConnectionStatus>
  );
}
