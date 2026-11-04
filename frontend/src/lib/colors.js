// color_tag values stored by the API -> hex used in the UI
export const COLOR_TAGS = {
  gold: "#D4AF37",
  blue: "#3B82F6",
  green: "#22C55E",
  red: "#EF4444",
  purple: "#A855F7",
  yellow: "#EAB308",
  gray: "#9CA3AF",
};

export const colorFor = (tag, fallback = COLOR_TAGS.gold) => COLOR_TAGS[tag] || fallback;

export const EMOJIS = ["🏦", "💳", "👛", "🐷", "💰", "🏠", "🚗", "✈️", "🏖️", "🎓", "🛟", "🎁", "📈", "🛒"];

export const CATEGORY_EMOJIS = ["🛒", "🍽️", "☕", "🚗", "⛽", "🏠", "💡", "📱", "🎬", "🎮", "👕", "💊", "🎓", "✈️", "🎁", "🐾", "💼", "💰", "📈", "🏷️"];

// Chart marks on the dark card surface (~#111525), assigned in this fixed order (never cycled; extra
// categories are folded into "Other" by the API). Validated: OKLCH L 0.48–0.67, chroma >= 0.10,
// adjacent colour-blind ΔE >= 8 and >= 3:1 contrast against the surface. Text never uses these colours.
export const CHART_COLORS = ["#B38F24", "#4A8AE6", "#E35D57", "#17998A", "#A26FE3", "#6A9A2A"];
export const CHART_OTHER_COLOR = "#7A8190"; // neutral, for the aggregated "Other" bucket
export const CHART_LINE_COLOR = COLOR_TAGS.gold; // single-series net-worth line
