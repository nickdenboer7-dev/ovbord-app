export type ThemeMode = "light" | "dark" | "system";

export const accentGreen = "#1D6F42";

export const themes = {
  light: {
    background: "#FFFFFF",
    surface: "#FFFFFF",
    surfaceSoft: "#EEF2EE",
    surfaceAlt: "#E7ECE8",
    border: "#D5DDD7",
    text: "#101411",
    textSoft: "#5D6A62",
    textMuted: "#7B857F",
    accent: "#1D6F42",
    /** Green for text and icons; identical to accent in light mode. */
    accentText: "#1D6F42",
    accentSoft: "#DDF2E6",
    heading: "#1454A0",
    danger: "#D92B2B",
    dangerSoft: "#FCE6E6",
    warning: "#F4A000",
    warningSoft: "#FFF1D7",
    success: "#2A9D55",
    successSoft: "#DFF3E7",
    cardShadow: "rgba(0,0,0,0.08)",
    mapRoute: "#1D6F42",
    fabText: "#FFFFFF",
    tabInactive: "#708177",
    inputBg: "#F0F3F1"
  },
  dark: {
    background: "#121212",
    surface: "#1B1B1B",
    surfaceSoft: "#232323",
    surfaceAlt: "#2B2B2B",
    border: "#343434",
    text: "#F4F7F5",
    textSoft: "#BBC5BE",
    textMuted: "#8E9791",
    accent: "#1D6F42",
    /** Lighter green: #1D6F42 text on dark surfaces is only ~3:1 contrast. */
    accentText: "#4DD17C",
    accentSoft: "#1B3223",
    heading: "#A6C6FF",
    danger: "#FF5E5E",
    dangerSoft: "#341919",
    warning: "#FFB547",
    warningSoft: "#372915",
    success: "#4DD17C",
    successSoft: "#173223",
    cardShadow: "rgba(0,0,0,0.3)",
    mapRoute: "#4DD17C",
    fabText: "#FFFFFF",
    tabInactive: "#94A09A",
    inputBg: "#202020"
  }
};

export type AppTheme = typeof themes.light;
