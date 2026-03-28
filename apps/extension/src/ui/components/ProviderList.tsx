import { ProviderCard, type ProviderCardData } from "./ProviderCard.js";

export type ProviderListProps = {
  providers: ProviderCardData[];
  tokenUsageByProvider?: Record<string, number> | undefined;
  onProviderClick?: ((providerId: string) => void) | undefined;
  onRemoveProvider?: ((providerId: string) => void) | undefined;
  onEditProvider?: ((providerId: string) => void) | undefined;
};

export function ProviderList({
  providers,
  tokenUsageByProvider,
  onProviderClick,
  onRemoveProvider,
  onEditProvider,
}: ProviderListProps) {
  return (
    <div className="flex flex-col gap-2">
      {providers.map((provider, i) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          tokenUsage={tokenUsageByProvider?.[provider.id]}
          onClick={onProviderClick}
          onRemove={onRemoveProvider}
          onEdit={onEditProvider}
          index={i}
        />
      ))}
    </div>
  );
}
