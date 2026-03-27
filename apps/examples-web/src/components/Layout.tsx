import { type ReactNode } from "react";
import { Anchor, Box, Divider, Group, Stack, Text } from "@mantine/core";
import { getCategory, getPrevNext, getPage } from "../navigation";
import { navigate } from "../router";

type LayoutProps = {
  pageId: string;
  children: ReactNode;
};

export function Layout({ pageId, children }: LayoutProps) {
  const page = getPage(pageId);
  const category = getCategory(pageId);
  const { prev, next } = getPrevNext(pageId);

  return (
    <Stack gap="lg">
      {/* Breadcrumb */}
      {category && page && (
        <Group gap={4}>
          <Text fz="xs" style={{ color: "var(--ap-text-tertiary)" }}>
            {category.label}
          </Text>
          <Text fz="xs" style={{ color: "var(--ap-text-tertiary)" }}>
            /
          </Text>
          <Text fz="xs" style={{ color: "var(--ap-text-tertiary)" }} fw={500}>
            {page.label}
          </Text>
        </Group>
      )}

      {/* Content */}
      {children}

      {/* Prev/Next navigation */}
      {(prev || next) && (
        <>
          <Divider my="xl" style={{ borderColor: "var(--ap-border)" }} />
          <Group justify="space-between">
            {prev ? (
              <Anchor
                fz="sm"
                onClick={() => navigate(prev.id)}
                style={{ cursor: "pointer", color: "var(--ap-text-link)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--ap-text-link-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--ap-text-link)";
                }}
              >
                ← {prev.label}
              </Anchor>
            ) : (
              <Box />
            )}
            {next ? (
              <Anchor
                fz="sm"
                onClick={() => navigate(next.id)}
                style={{ cursor: "pointer", color: "var(--ap-text-link)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--ap-text-link-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--ap-text-link)";
                }}
              >
                {next.label} →
              </Anchor>
            ) : (
              <Box />
            )}
          </Group>
        </>
      )}
    </Stack>
  );
}
