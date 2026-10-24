/**
 * Colours for the trip page (ritverloop). Light values are exactly the colours
 * the page used before dark-mode support, so light mode stays pixel-identical.
 * Map overlays (status pill, zoom buttons, markers) intentionally keep fixed
 * light colours because they sit on light PDOK map tiles in both schemes.
 */
export type RitColors = {
  statusBar: "dark" | "light";
  page: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  navy: string;
  buttonBg: string;
  blue: string;
  green: string;
  red: string;
  refreshError: string;
  summaryBg: string;
  summaryBorder: string;
  summaryDivider: string;
  stagePositiveBg: string;
  stageNeutralBg: string;
  toggleBorder: string;
  moreStopsBorder: string;
  moreStopsBg: string;
  passedName: string;
  passedText: string;
  grayRail: string;
  railFill: string;
  vehicleRing: string;
  nextTagBg: string;
  nextTagText: string;
  boardingRowBg: string;
  boardingTagBg: string;
  boardingTagText: string;
  nowTagBg: string;
  endTagBg: string;
  /** Text that relied on the platform default colour in light mode stays unset there. */
  delayText: string | undefined;
  mapBg: string;
  /** Cancelled trip banner/stage and trip notices. */
  cancelBg: string;
  cancelBorder: string;
  warnAlertBg: string;
  warnAlertBorder: string;
  /** Stop where the user gets off, and its tag in the timeline. */
  alightRowBg: string;
  alightTagBg: string;
  alightTagText: string;
  /** V5.4 position card (light green) and the rail after the alighting stop. */
  positionBg: string;
  positionBorder: string;
  positionIconBg: string;
  afterAlightRail: string;
};

export const ritColors: { light: RitColors; dark: RitColors } = {
  light: {
    statusBar: "dark",
    page: "#FFFFFF",
    surface: "#FFFFFF",
    text: "#13233D",
    muted: "#69778A",
    border: "#E6EAF0",
    navy: "#14518B",
    buttonBg: "#14518B",
    blue: "#1478E3",
    green: "#16894B",
    red: "#C93030",
    refreshError: "#BA4623",
    summaryBg: "#F6FAFF",
    summaryBorder: "#DCE9F8",
    summaryDivider: "#D4E2F2",
    stagePositiveBg: "#E4F4EB",
    stageNeutralBg: "#EDF1F5",
    toggleBorder: "#DCE5F2",
    moreStopsBorder: "#D3E5FC",
    moreStopsBg: "#F0F7FF",
    passedName: "#9FA9B6",
    passedText: "#9AA3AF",
    grayRail: "#C4CCD5",
    railFill: "#FFFFFF",
    vehicleRing: "#FFFFFF",
    nextTagBg: "#F0F7FE",
    nextTagText: "#185c98",
    boardingRowBg: "#EAF3FB",
    boardingTagBg: "#D5E8F7",
    boardingTagText: "#185c98",
    nowTagBg: "#DFF6E7",
    endTagBg: "#EFF3F8",
    delayText: undefined,
    mapBg: "#E9EFF2",
    cancelBg: "#FFF4F3",
    cancelBorder: "#F5C6C2",
    warnAlertBg: "#FFF6E5",
    warnAlertBorder: "#F2D9A6",
    alightRowBg: "#F5F2FC",
    alightTagBg: "#ECE5FA",
    alightTagText: "#5A3E9E",
    positionBg: "#EFF8F2",
    positionBorder: "#D5ECDD",
    positionIconBg: "#DDF2E6",
    afterAlightRail: "#D3D9E0"
  },
  dark: {
    statusBar: "light",
    page: "#121212",
    surface: "#1B1B1B",
    text: "#F4F7F5",
    muted: "#9AA6B4",
    border: "#2C3138",
    navy: "#8DBDF0",
    buttonBg: "#2563A8",
    blue: "#5AA9F7",
    green: "#4DD17C",
    red: "#FF6B6B",
    refreshError: "#FF8A65",
    summaryBg: "#16202C",
    summaryBorder: "#263A52",
    summaryDivider: "#2A3B50",
    stagePositiveBg: "#173223",
    stageNeutralBg: "#262C33",
    toggleBorder: "#334356",
    moreStopsBorder: "#2A4667",
    moreStopsBg: "#14243A",
    passedName: "#6E7885",
    passedText: "#6E7885",
    grayRail: "#4A525C",
    railFill: "#121212",
    vehicleRing: "#121212",
    nextTagBg: "#1A2B42",
    nextTagText: "#A6D0FF",
    boardingRowBg: "#1A2F43",
    boardingTagBg: "#234260",
    boardingTagText: "#D9EBFC",
    nowTagBg: "#1E3A28",
    endTagBg: "#262C33",
    delayText: "#F4F7F5",
    mapBg: "#2B2B2B",
    cancelBg: "#341919",
    cancelBorder: "#5A2626",
    warnAlertBg: "#372915",
    warnAlertBorder: "#5A4520",
    alightRowBg: "#1D1828",
    alightTagBg: "#2E2545",
    alightTagText: "#C9B8F2",
    positionBg: "#15241B",
    positionBorder: "#22402C",
    positionIconBg: "#1E3A28",
    afterAlightRail: "#3A4048"
  }
};

export function ritColorsFor(scheme: string | null | undefined): RitColors {
  return scheme === "dark" ? ritColors.dark : ritColors.light;
}
