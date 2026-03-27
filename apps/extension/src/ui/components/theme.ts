import { createTheme, type MantineThemeOverride } from "@mantine/core";

export const arlopassTheme: MantineThemeOverride = createTheme({
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    primaryColor: "dark",
    defaultRadius: "sm",
    fontSizes: {
        xs: "10px",
        sm: "12px",
        md: "14px",
        lg: "16px",
    },
    components: {
        Button: {
            defaultProps: {
                variant: "filled",
            },
        },
    },
});

/** Design tokens extracted from the Figma design */
export const tokens = {
    color: {
        textPrimary: "#202225",
        textSecondary: "#808796",
        border: "#dfe1e8",
        bgSurface: "#f3f3f3",
        bgCard: "#ffffff",
        btnPrimaryBg: "#202225",
        btnPrimaryText: "#ffffff",
    },
    radius: {
        container: 4,
        card: 8,
        button: 8,
    },
    spacing: {
        outerPadding: 10,
        headerPadding: 16,
        contentHPadding: 12,
        contentTopPadding: 12,
        contentBottomPadding: 12,
        cardPadding: 12,
        sectionGap: 12,
        iconTextGap: 10,
        metadataGap: 8,
        tabPadding: 12,
        buttonPaddingY: 16,
    },
    size: {
        popupWidth: 360,
        providerIcon: 24,
        headerCollapseIcon: 16,
        headerSettingsIcon: 20,
        categorySelectorIcon: 12,
        cardChevronIcon: 20,
    },
} as const;
