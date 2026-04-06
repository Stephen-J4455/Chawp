import { Dimensions } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const isSmallDevice = SCREEN_WIDTH < 375;
const isMediumDevice = SCREEN_WIDTH >= 375 && SCREEN_WIDTH < 414;

// Responsive font size helper
const responsiveFontSize = (size) => {
  if (isSmallDevice) return size * 0.9;
  if (isMediumDevice) return size;
  return size * 1.05;
};

export const colors = {
  background: "#070B16",
  surface: "#0F1524",
  card: "#161D33",
  overlay: "rgba(10, 15, 27, 0.6)",
  primary: "#2E6BFF",
  primaryMuted: "#1F4FCC",
  accent: "#FFB547",
  accentMuted: "#FF9833",
  success: "#3DD598",
  danger: "#FF5C5C",
  textPrimary: "#F5F7FF",
  textSecondary: "#9AA3C0",
  textMuted: "#6C7796",
  border: "#1F2944",
  highlight: "#1F2A55",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
};

export const radii = {
  sm: 8,
  md: 14,
  lg: 24,
  pill: 999,
};

export const typography = {
  display: {
    fontSize: responsiveFontSize(32),
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  headline: {
    fontSize: responsiveFontSize(24),
    fontWeight: "700",
  },
  title: {
    fontSize: responsiveFontSize(18),
    fontWeight: "600",
  },
  body: {
    fontSize: responsiveFontSize(15),
    fontWeight: "500",
  },
  caption: {
    fontSize: responsiveFontSize(13),
    fontWeight: "500",
  },
};

// Export responsive helpers for use in components
export const responsive = {
  width: SCREEN_WIDTH,
  isSmallDevice,
  isMediumDevice,
  isLargeDevice: SCREEN_WIDTH >= 414,
  scale: (size) => responsiveFontSize(size),
};
