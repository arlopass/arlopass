import { MetadataDivider } from "../MetadataDivider.js";
import type { ConnectedApp } from "../app-connect/app-storage.js";
import { formatTokens } from "./utils.js";

export type AppStatsBarProps = {
  app: ConnectedApp;
  totalTokens: number;
};

export function AppStatsBar({ app, totalTokens }: AppStatsBarProps) {
  return (
    <div className="flex items-center gap-2">
      {app.iconUrl && (
        <img
          src={app.iconUrl}
          alt=""
          width={20}
          height={20}
          className="rounded-sm shrink-0"
        />
      )}
      <span className="text-[10px] font-medium text-[var(--ap-text-primary)]">
        {formatTokens(totalTokens)} tokens used
      </span>
      <MetadataDivider />
      <span className="text-[10px] font-medium text-[var(--ap-text-primary)]">
        {app.permissions.autopilot &&
        app.permissions.readBalance &&
        app.permissions.autoSelectModel
          ? "Full permissions"
          : "Partial permissions"}
      </span>
    </div>
  );
}
