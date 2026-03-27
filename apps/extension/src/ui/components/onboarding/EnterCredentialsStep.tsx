import { Group, Stack, Text, TextInput } from "@mantine/core";
import { ProviderAvatar } from "../ProviderAvatar.js";
import { PrimaryButton } from "../PrimaryButton.js";
import type { ProviderEntry } from "./provider-registry.js";
import { tokens } from "../theme.js";

export type EnterCredentialsStepProps = {
  provider: ProviderEntry;
  credentialName: string;
  fieldValues: Record<string, string>;
  isReusing?: boolean | undefined;
  onFieldChange: (key: string, value: string) => void;
  onCredentialNameChange: (name: string) => void;
  onNext: () => void;
};

export function EnterCredentialsStep({
  provider,
  credentialName,
  fieldValues,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isReusing: _isReusing,
  onFieldChange,
  onCredentialNameChange,
  onNext,
}: EnterCredentialsStepProps) {
  const allFieldsFilled = provider.requiredFields.every(
    (f) => (fieldValues[f.key] ?? "").trim().length > 0,
  );

  return (
    <>
      {/* Provider header */}
      <Stack
        gap={tokens.spacing.sectionGap}
        style={{
          padding: tokens.spacing.cardPadding,
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.card,
        }}
      >
        <Group gap={tokens.spacing.iconTextGap} align="center" wrap="nowrap" style={{ paddingBottom: tokens.spacing.sectionGap, borderBottom: `1px solid ${tokens.color.border}` }}>
          <ProviderAvatar providerKey={provider.providerKey} size={tokens.size.providerIcon} />
          <Text fw={600} fz="sm" c={tokens.color.textPrimary}>
            {provider.shortLabel}
          </Text>
        </Group>

        {/* Credential form */}
        <Text fw={500} fz="sm" c={tokens.color.textPrimary}>
          New credential
        </Text>

        <Stack gap={10} style={{ background: tokens.color.bgSurface, padding: tokens.spacing.cardPadding, borderRadius: tokens.radius.card }}>
          <TextInput
            label="Credential name"
            size="xs"
            value={credentialName}
            onChange={(e) => onCredentialNameChange(e.currentTarget.value)}
            placeholder={`${provider.shortLabel} Key`}
            styles={{
              label: { fontSize: 10, fontWeight: 500, color: tokens.color.textSecondary, marginBottom: 4 },
              input: { height: 32, fontSize: 10, borderColor: tokens.color.border, borderRadius: tokens.radius.card },
            }}
          />

          {provider.requiredFields.map((field) => (
            <TextInput
              key={field.key}
              label={field.label}
              size="xs"
              type={field.type === "password" ? "password" : "text"}
              value={fieldValues[field.key] ?? ""}
              onChange={(e) => onFieldChange(field.key, e.currentTarget.value)}
              placeholder={field.placeholder ?? ""}
              styles={{
                label: { fontSize: 10, fontWeight: 500, color: tokens.color.textSecondary, marginBottom: 4 },
                input: { height: 32, fontSize: 10, borderColor: tokens.color.border, borderRadius: tokens.radius.card },
              }}
            />
          ))}
        </Stack>
      </Stack>

      <PrimaryButton onClick={onNext} disabled={!allFieldsFilled}>
        Continue
      </PrimaryButton>
    </>
  );
}
