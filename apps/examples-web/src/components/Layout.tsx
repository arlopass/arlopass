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
          <Text fz="xs" c="dimmed">{category.icon} {category.label}</Text>
          <Text fz="xs" c="dimmed">/</Text>
          <Text fz="xs" c="dimmed" fw={500}>{page.label}</Text>
        </Group>
      )}

      {/* Content */}
      {children}

      {/* Prev/Next navigation */}
      {(prev || next) && (
        <>
          <Divider my="xl" />
          <Group justify="space-between">
            {prev ? (
              <Anchor fz="sm" onClick={() => navigate(prev.id)} style={{ cursor: "pointer" }}>
                ← {prev.label}
              </Anchor>
            ) : <Box />}
            {next ? (
              <Anchor fz="sm" onClick={() => navigate(next.id)} style={{ cursor: "pointer" }}>
                {next.label} →
              </Anchor>
            ) : <Box />}
          </Group>
        </>
      )}
    </Stack>
  );
}
