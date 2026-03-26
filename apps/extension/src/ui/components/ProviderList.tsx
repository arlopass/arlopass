import { Stack } from "@mantine/core";
import { ProviderCard, type ProviderCardData } from "./ProviderCard.js";
import { tokens } from "./theme.js";

export type ProviderListProps = {
  providers: ProviderCardData[];
  tokenUsageByProvider?: Record<string, number> | undefined;
  onProviderClick?: ((providerId: string) => void) | undefined;
  onRemoveProvider?: ((providerId: string) => void) | undefined;
  onEditProvider?: ((providerId: string) => void) | undefined;
};

export function ProviderList({ providers, tokenUsageByProvider, onProviderClick, onRemoveProvider, onEditProvider }: ProviderListProps) {
  return (
    <Stack gap={tokens.spacing.sectionGap}>
      {providers.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          tokenUsage={tokenUsageByProvider?.[provider.id]}
          onClick={onProviderClick}
          onRemove={onRemoveProvider}
          onEdit={onEditProvider}
        />
      ))}
    </Stack>
  );
}
