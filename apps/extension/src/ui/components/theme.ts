import { createTheme, type MantineThemeOverride } from "@mantine/core";

export const arlopassTheme: MantineThemeOverride = createTheme({
    fontFamily: "'Geist Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    fontFamilyMonospace: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    primaryColor: "brand",
    defaultRadius: "sm",
    fontSizes: {
        xs: "10px",
        sm: "12px",
        md: "14px",
        lg: "16px",
    },
    colors: {
        brand: [
            "#FFF7ED", // 0 - subtle light
            "#FFEDD5", // 1
            "#FED7AA", // 2
            "#FDBA74", // 3
            "#FB923C", // 4
            "#F97316", // 5
            "#EA580C", // 6
            "#DB4D12", // 7 - primary (terracotta)
            "#9A3412", // 8 - hover
            "#7C2D12", // 9 - active
        ],
    },
    components: {
        Button: {
            defaultProps: {
                variant: "filled",
            },
        },
    },
});

/**
 * Arlopass design tokens for the extension popup.
 *
 * References CSS custom properties so colors adapt to light/dark mode
 * automatically via prefers-color-scheme media query in app.css.
 */
export const tokens = {
    color: {
        // Text
        textPrimary: "var(--ap-text-primary)",
        textBody: "var(--ap-text-body)",
        textSecondary: "var(--ap-text-secondary)",
        textTertiary: "var(--ap-text-tertiary)",

        // Surfaces
        bgBase: "var(--ap-bg-base)",
        bgSurface: "var(--ap-bg-surface)",
        bgElevated: "var(--ap-bg-elevated)",
        bgCode: "var(--ap-bg-code)",

        // Borders
        border: "var(--ap-border)",
        borderStrong: "var(--ap-border-strong)",

        // Brand
        brand: "#DB4D12",
        brandHover: "#9A3412",
        brandSubtle: "var(--ap-brand-subtle)",

        // Semantic
        success: "#4D7C0F",
        successSubtle: "var(--ap-success-subtle)",
        warning: "#CA8A04",
        warningSubtle: "var(--ap-warning-subtle, #2E2204)",
        danger: "#B91C1C",
        dangerSubtle: "var(--ap-danger-subtle, #2E0505)",

        // Buttons (primary uses brand terracotta)
        btnPrimaryBg: "#DB4D12",
        btnPrimaryText: "#FAFAF9",
        btnPrimaryHover: "#9A3412",
    },
    radius: {
        container: 8,
        card: 8,
        button: 4,
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
