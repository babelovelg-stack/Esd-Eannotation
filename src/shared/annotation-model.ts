import {
  argbFromHex,
  hexFromArgb,
  Hct,
  themeFromSourceColor,
  TonalPalette,
} from "@material/material-color-utilities"

export type AnnotationMode = "global" | "local"

export type WarningLevel = 0 | 1 | 2 | 3 | 4 | 5

export type AnnotationTagId =
  | "none"
  | "interaction"
  | "content"
  | "layout"
  | "function"

export type AnnotationTagDefinition = {
  id: AnnotationTagId
  label: string
  seedHex: string
}

export type AnnotationPalette = {
  tagId: AnnotationTagId
  warningLevel: WarningLevel
  cardFill: string
  bodyText: string
  mutedText: string
  border: string
  divider: string
  badgeFill: string
  badgeText: string
  tagChipFill: string
  tagChipText: string
  tagChipBorder: string
  boxModelFill: string
  boxModelBorder: string
  boxModelText: string
  shadow: string
  shadowOpacity: number
}

export const WARNING_LEVELS = [0, 1, 2, 3, 4, 5] as const

export const DEFAULT_ANNOTATION_SEED = "#6750a4"
export const WARNING_SEED = "#ba1a1a"

export const TAG_DEFINITIONS = [
  { id: "none", label: "无", seedHex: DEFAULT_ANNOTATION_SEED },
  { id: "interaction", label: "交互", seedHex: "#006a6a" },
  { id: "content", label: "内容", seedHex: "#a65000" },
  { id: "layout", label: "布局", seedHex: "#005db8" },
  { id: "function", label: "功能", seedHex: "#9c2f8c" },
] as const satisfies readonly AnnotationTagDefinition[]

const TAG_DEFINITION_BY_ID = new Map<AnnotationTagId, AnnotationTagDefinition>(
  TAG_DEFINITIONS.map((definition) => [definition.id, definition])
)

const WARNING_TONE_BY_LEVEL: Record<
  Exclude<WarningLevel, 0>,
  {
    card: number
    text: number
    muted: number
    border: number
    divider: number
    badge: number
    boxFill: number
    boxBorder: number
  }
> = {
  1: {
    card: 98,
    text: 25,
    muted: 35,
    border: 88,
    divider: 92,
    badge: 40,
    boxFill: 99,
    boxBorder: 88,
  },
  2: {
    card: 96,
    text: 22,
    muted: 32,
    border: 84,
    divider: 88,
    badge: 35,
    boxFill: 98,
    boxBorder: 84,
  },
  3: {
    card: 92,
    text: 15,
    muted: 24,
    border: 78,
    divider: 84,
    badge: 30,
    boxFill: 96,
    boxBorder: 78,
  },
  4: {
    card: 40,
    text: 100,
    muted: 96,
    border: 58,
    divider: 52,
    badge: 25,
    boxFill: 35,
    boxBorder: 58,
  },
  5: {
    card: 30,
    text: 100,
    muted: 96,
    border: 50,
    divider: 44,
    badge: 20,
    boxFill: 25,
    boxBorder: 50,
  },
}

assertTagSeedsAvoidWarningHue()

export type PropertyOptionId =
  | "size"
  | "minMaxSize"
  | "fills"
  | "strokes"
  | "text"
  | "textFill"
  | "radius"
  | "boxModel"

export const PROPERTY_LABELS: Record<PropertyOptionId, string> = {
  size: "宽度和高度",
  minMaxSize: "最大和最小尺寸",
  fills: "填充色",
  strokes: "描边色",
  text: "文字样式",
  textFill: "文字颜色",
  radius: "圆角",
  boxModel: "盒子模型",
}

export const PROPERTY_OPTION_IDS = Object.keys(
  PROPERTY_LABELS
) as PropertyOptionId[]

const FRAME_LIKE_TYPES = new Set(["FRAME", "COMPONENT", "INSTANCE"])

export function localAnnotationCardName(canvasName: string) {
  return `Eannotation / ${canvasName}`
}

export function resolveLocalAnnotationCardName(
  currentName: string,
  canvasName: string | null
) {
  return canvasName === null ? currentName : localAnnotationCardName(canvasName)
}

export type ReferenceValue = {
  variables?: string[]
  style?: string | null
  fallback?: string | null
  mixed?: boolean
}

export function inferAnnotationModeFromAncestry(
  ancestorTypesFromClosest: string[]
): AnnotationMode {
  return ancestorTypesFromClosest.some((type) => FRAME_LIKE_TYPES.has(type))
    ? "local"
    : "global"
}

export function normalizeWarningLevel(value: unknown): WarningLevel {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0
  if (!Number.isFinite(numeric)) {
    return 0
  }

  const rounded = Math.round(numeric)
  if (rounded <= 0) {
    return 0
  }
  if (rounded >= 5) {
    return 5
  }
  return rounded as WarningLevel
}

export function normalizeAnnotationTagId(value: unknown): AnnotationTagId {
  return typeof value === "string" &&
    TAG_DEFINITION_BY_ID.has(value as AnnotationTagId)
    ? (value as AnnotationTagId)
    : "none"
}

export function getAnnotationPalette({
  warningLevel,
  tagId,
}: {
  warningLevel: unknown
  tagId: unknown
}): AnnotationPalette {
  const normalizedTagId = normalizeAnnotationTagId(tagId)
  const normalizedWarningLevel = normalizeWarningLevel(warningLevel)
  if (normalizedWarningLevel === 0) {
    return getTagPalette(normalizedTagId)
  }

  const warningPalette = buildWarningPalette(normalizedWarningLevel)
  const tagPalette = getTagPalette(normalizedTagId)
  return {
    ...warningPalette,
    tagId: normalizedTagId,
    warningLevel: normalizedWarningLevel,
    tagChipFill: tagPalette.tagChipFill,
    tagChipText: tagPalette.tagChipText,
    tagChipBorder: tagPalette.tagChipBorder,
  }
}

export function getTagPalette(tagId: unknown): AnnotationPalette {
  const normalizedTagId = normalizeAnnotationTagId(tagId)
  const definition = tagDefinitionForId(normalizedTagId)
  const theme = themeFromSourceColor(argbFromHex(definition.seedHex))
  const light = theme.schemes.light
  const primary = theme.palettes.primary
  const secondary = theme.palettes.secondary

  return {
    tagId: normalizedTagId,
    warningLevel: 0,
    cardFill: hexFromArgb(secondary.tone(96)),
    bodyText: hexFromArgb(primary.tone(20)),
    mutedText: hexFromArgb(secondary.tone(35)),
    border: hexFromArgb(secondary.tone(86)),
    divider: hexFromArgb(secondary.tone(90)),
    badgeFill: hexFromArgb(light.primary),
    badgeText: hexFromArgb(light.onPrimary),
    tagChipFill: hexFromArgb(light.primary),
    tagChipText: hexFromArgb(light.onPrimary),
    tagChipBorder: hexFromArgb(light.outlineVariant),
    boxModelFill: hexFromArgb(secondary.tone(98)),
    boxModelBorder: hexFromArgb(secondary.tone(86)),
    boxModelText: hexFromArgb(light.onPrimaryContainer),
    shadow: hexFromArgb(light.primary),
    shadowOpacity: 0.16,
  }
}

export function tagDefinitionForId(tagId: unknown): AnnotationTagDefinition {
  return (
    TAG_DEFINITION_BY_ID.get(normalizeAnnotationTagId(tagId)) ??
    TAG_DEFINITIONS[0]
  )
}

export function isWarningHue(hex: string): boolean {
  const hue = Hct.fromInt(argbFromHex(hex)).hue
  return hue <= 25 || hue >= 345
}

export function formatReferenceValue({
  variables = [],
  style = null,
  fallback = null,
  mixed = false,
}: ReferenceValue): string {
  const uniqueVariables = uniqueNonEmpty(variables)
  if (uniqueVariables.length > 0) {
    return uniqueVariables.join(" / ")
  }

  if (style) {
    return style
  }

  if (mixed) {
    return "混合"
  }

  return fallback || "未设置"
}

export function formatPx(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? `${rounded}px` : `${rounded.toFixed(2)}px`
}

export function formatSizingMode(value: string | null | undefined): string {
  if (value === "HUG") {
    return "hug"
  }

  if (value === "FILL") {
    return "fill"
  }

  return "fixed"
}

export function formatDimensionWithSizing(
  px: number,
  sizing: string | null | undefined,
  reference?: ReferenceValue
): string {
  const resolvedValue = formatReferenceValue({
    variables: reference ? reference.variables : [],
    style: reference ? reference.style : null,
    fallback: formatPx(px),
    mixed: reference ? reference.mixed : false,
  })
  return `${resolvedValue} · ${formatSizingMode(sizing)}`
}

export function imageHeightForWidth(
  originalWidth: number,
  originalHeight: number,
  targetWidth: number
): number {
  if (originalWidth <= 0 || originalHeight <= 0 || targetWidth <= 0) {
    return targetWidth
  }

  return Math.round((targetWidth * originalHeight) / originalWidth)
}

export function contentWidthForDesignReferences(
  baseWidth: number,
  designWidths: number[]
): number {
  return designWidths.reduce(
    (width, designWidth) =>
      Number.isFinite(designWidth) && designWidth > width ? designWidth : width,
    baseWidth
  )
}

export function nextBadgeNumber(existingNumbers: number[]): number {
  const max = existingNumbers.reduce((currentMax, value) => {
    return Number.isFinite(value) && value > currentMax ? value : currentMax
  }, 0)
  return max + 1
}

export function formatCornerSummary(values: [string, string, string, string]) {
  const [topLeft, topRight, bottomRight, bottomLeft] = values
  if (
    topLeft === topRight &&
    topRight === bottomRight &&
    bottomRight === bottomLeft
  ) {
    return topLeft
  }

  return `左上 ${topLeft} / 右上 ${topRight} / 右下 ${bottomRight} / 左下 ${bottomLeft}`
}

export function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])
  )
}

function buildWarningPalette(warningLevel: Exclude<WarningLevel, 0>) {
  const tones = WARNING_TONE_BY_LEVEL[warningLevel]
  const palette = TonalPalette.fromInt(argbFromHex(WARNING_SEED))
  const white = "#ffffff"

  return {
    tagId: "none" as AnnotationTagId,
    warningLevel,
    cardFill: hexFromArgb(palette.tone(tones.card)),
    bodyText: warningLevel >= 4 ? white : hexFromArgb(palette.tone(tones.text)),
    mutedText:
      warningLevel >= 4
        ? hexFromArgb(palette.tone(tones.muted))
        : hexFromArgb(palette.tone(tones.muted)),
    border: hexFromArgb(palette.tone(tones.border)),
    divider: hexFromArgb(palette.tone(tones.divider)),
    badgeFill: hexFromArgb(palette.tone(tones.badge)),
    badgeText: white,
    tagChipFill: white,
    tagChipText: hexFromArgb(palette.tone(25)),
    tagChipBorder: hexFromArgb(palette.tone(80)),
    boxModelFill: hexFromArgb(palette.tone(tones.boxFill)),
    boxModelBorder: hexFromArgb(palette.tone(tones.boxBorder)),
    boxModelText:
      warningLevel >= 4 ? white : hexFromArgb(palette.tone(tones.text)),
    shadow: hexFromArgb(palette.tone(tones.badge)),
    shadowOpacity: warningLevel >= 4 ? 0.26 : 0.18,
  } satisfies AnnotationPalette
}

function assertTagSeedsAvoidWarningHue() {
  for (const definition of TAG_DEFINITIONS) {
    if (definition.id === "none") {
      continue
    }

    if (isWarningHue(definition.seedHex)) {
      throw new Error(
        `Annotation tag "${definition.id}" must not use a red seed`
      )
    }
  }
}
