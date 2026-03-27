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
 * Dark mode with warm stone tones, following the Arlopass design system.
 * All components reference these tokens — change here to cascade everywhere.
 */
export const tokens = {
    color: {
        // Text
        textPrimary: "#FAFAF9",      // Warm white — headings, emphasis
        textBody: "#D6D3D1",         // Warm stone — body text
        textSecondary: "#A8A29E",    // Muted stone — labels, metadata
        textTertiary: "#78716C",     // Dim stone — disabled, decorative

        // Surfaces
        bgBase: "#1C1917",           // Deep brown-black — popup body
        bgSurface: "#292524",        // Stone dark — cards, container
        bgElevated: "#3D3835",       // Stone mid — hover, modals, dropdowns
        bgCode: "#1A1412",           // Espresso — code blocks

        // Borders
        border: "#44403C",           // Warm border — dividers
        borderStrong: "#57534E",     // Stronger — active states

        // Brand
        brand: "#DB4D12",            // Terracotta — primary accent
        brandHover: "#9A3412",       // Terracotta dark — hover
        brandSubtle: "#2C1A0E",      // Terracotta at 8% on dark

        // Semantic
        success: "#4D7C0F",          // Sage green — connected, approved
        successSubtle: "#1A2E05",    // Sage on dark
        warning: "#CA8A04",          // Gold — caution
        warningSubtle: "#2E2204",    // Gold on dark
        danger: "#B91C1C",           // Crimson — error, denied
        dangerSubtle: "#2E0505",     // Crimson on dark

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
