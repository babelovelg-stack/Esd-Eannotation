import {
  formatCornerSummary,
  formatDimensionWithSizing,
  formatPx,
  formatReferenceValue,
  formatSizingMode,
  type PropertyOptionId,
  uniqueNonEmpty,
} from "../shared/annotation-model"
import type { PropertyOption } from "../shared/messages"

const TEXT_VARIABLE_FIELDS = [
  "fontFamily",
  "fontStyle",
  "fontWeight",
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "paragraphSpacing",
  "paragraphIndent",
]

const TEXT_FIELD_LABELS: Record<string, string> = {
  fontFamily: "字体",
  fontStyle: "字形",
  fontWeight: "字重",
  fontSize: "字号",
  lineHeight: "行高",
  letterSpacing: "字距",
  paragraphSpacing: "段间距",
  paragraphIndent: "段落缩进",
}

export async function collectPropertyOptions(
  node: SceneNode
): Promise<PropertyOption[]> {
  const options: PropertyOption[] = [
    await collectSizeOption(node),
    await collectMinMaxSizeOption(node),
    await collectPaintOption(node, "fills"),
    await collectPaintOption(node, "strokes"),
    await collectRadiusOption(node),
    await collectBoxModelOption(node),
  ]

  if (node.type === "TEXT") {
    options.splice(4, 0, await collectTextStyleOption(node))
    options.splice(5, 0, await collectTextFillOption(node))
  }

  return options
}

export async function collectSelectedPropertyOptions(
  node: SceneNode,
  selectedIds: PropertyOptionId[]
): Promise<PropertyOption[]> {
  const selected = new Set(selectedIds)
  const options = await collectPropertyOptions(node)
  return options.filter((option) => selected.has(option.id))
}

async function collectSizeOption(node: SceneNode): Promise<PropertyOption> {
  const widthVariables = await variableNamesFromAliases(
    getBoundAliases(node, "width")
  )
  const heightVariables = await variableNamesFromAliases(
    getBoundAliases(node, "height")
  )

  const width = formatDimensionWithSizing(
    node.width,
    getNodeStringProperty(node, "layoutSizingHorizontal") || "FIXED",
    { variables: widthVariables }
  )
  const height = formatDimensionWithSizing(
    node.height,
    getNodeStringProperty(node, "layoutSizingVertical") || "FIXED",
    { variables: heightVariables }
  )

  return {
    id: "size",
    label: "宽度和高度",
    value: `宽度 ${width}；高度 ${height}`,
    kind: "dimension",
  }
}

async function collectMinMaxSizeOption(
  node: SceneNode
): Promise<PropertyOption> {
  const rows = await Promise.all([
    formatNullableNumberField(node, "minWidth", "最小宽度"),
    formatNullableNumberField(node, "maxWidth", "最大宽度"),
    formatNullableNumberField(node, "minHeight", "最小高度"),
    formatNullableNumberField(node, "maxHeight", "最大高度"),
  ])

  return {
    id: "minMaxSize",
    label: "最大和最小尺寸",
    value: rows.join("；"),
    kind: "dimension",
  }
}

async function collectPaintOption(
  node: SceneNode,
  field: "fills" | "strokes"
): Promise<PropertyOption> {
  const label = field === "fills" ? "填充色" : "描边色"
  const styleIdField = field === "fills" ? "fillStyleId" : "strokeStyleId"
  const paints = getPaints(node, field)
  const styleId = getStyleId(node, styleIdField)
  const variableValues: string[] = []
  pushAll(
    variableValues,
    await variableNamesFromAliases(getBoundAliases(node, field))
  )
  pushAll(variableValues, await variableNamesFromPaints(paints))
  pushAll(variableValues, await variableNamesFromPaintStyle(styleId))
  const variables = uniqueNonEmpty(variableValues)
  const style = await styleNameFromId(styleId, "PAINT")

  return {
    id: field,
    label,
    value: formatReferenceValue({
      variables,
      style,
      fallback: paintFallback(paints),
      mixed:
        paints === figma.mixed ||
        getRawProperty(node, styleIdField) === figma.mixed,
    }),
    kind: "color",
  }
}

async function collectTextStyleOption(node: TextNode): Promise<PropertyOption> {
  const segments = getTextSegments(node)
  const textStyleIdValues = [getStyleId(node, "textStyleId")]
  for (const segment of segments) {
    textStyleIdValues.push(getRecordString(segment, "textStyleId"))
  }
  const textStyleIds = uniqueNonEmpty(textStyleIdValues)
  const styleNames = await styleNamesFromIds(textStyleIds, "TEXT")
  const variableRows = await collectTextVariableRows(
    node,
    segments,
    textStyleIds
  )

  return {
    id: "text",
    label: "文字样式",
    value:
      variableRows.length > 0
        ? variableRows.join("；")
        : formatReferenceValue({
            style: styleNames.join(" / ") || null,
            fallback: textFallback(node, segments),
            mixed: textStyleIds.length > 1,
          }),
    kind: "text",
  }
}

async function collectTextFillOption(node: TextNode): Promise<PropertyOption> {
  const segments = getTextSegments(node)
  const fillStyleIdValues = [getStyleId(node, "fillStyleId")]
  for (const segment of segments) {
    fillStyleIdValues.push(getRecordString(segment, "fillStyleId"))
  }
  const fillStyleIds = uniqueNonEmpty(fillStyleIdValues)
  const paints = getPaints(node, "fills")
  const segmentPaints = flattenMap(segments, (segment) => {
    const value = getRecord(segment, "fills")
    return value === figma.mixed ? [] : normalizePaints(value)
  })
  const variableValues: string[] = []
  pushAll(
    variableValues,
    await variableNamesFromAliases(getBoundAliases(node, "fills"))
  )
  pushAll(
    variableValues,
    await variableNamesFromAliases(getBoundAliases(node, "textRangeFills"))
  )
  pushAll(
    variableValues,
    await variableNamesFromAliases(
      flattenMap(segments, (segment) =>
        collectAliases(getRecord(segment, "boundVariables"))
      )
    )
  )
  pushAll(variableValues, await variableNamesFromPaints(paints))
  pushAll(variableValues, await variableNamesFromPaints(segmentPaints))
  pushAll(
    variableValues,
    flatten(await Promise.all(fillStyleIds.map(variableNamesFromPaintStyle)))
  )
  const variables = uniqueNonEmpty(variableValues)
  const styleNames = await styleNamesFromIds(fillStyleIds, "PAINT")

  return {
    id: "textFill",
    label: "文字颜色",
    value: formatReferenceValue({
      variables,
      style: styleNames.join(" / ") || null,
      fallback: paintFallback(paints === figma.mixed ? segmentPaints : paints),
      mixed: fillStyleIds.length > 1 || paints === figma.mixed,
    }),
    kind: "color",
  }
}

async function collectRadiusOption(node: SceneNode): Promise<PropertyOption> {
  const values = await Promise.all([
    formatRadiusField(node, "topLeftRadius"),
    formatRadiusField(node, "topRightRadius"),
    formatRadiusField(node, "bottomRightRadius"),
    formatRadiusField(node, "bottomLeftRadius"),
  ])

  return {
    id: "radius",
    label: "圆角",
    value: formatCornerSummary(values),
    kind: "shape",
  }
}

async function collectBoxModelOption(node: SceneNode): Promise<PropertyOption> {
  const padding = await Promise.all([
    formatNumberField(node, "paddingTop", "0px"),
    formatNumberField(node, "paddingRight", "0px"),
    formatNumberField(node, "paddingBottom", "0px"),
    formatNumberField(node, "paddingLeft", "0px"),
  ])
  const gap = await formatNumberField(node, "itemSpacing", "无")
  const stroke = await formatNumberField(node, "strokeWeight", "0px")
  const layout =
    getNodeStringProperty(node, "layoutMode") === "HORIZONTAL" ||
    getNodeStringProperty(node, "layoutMode") === "VERTICAL"
      ? `${getNodeStringProperty(node, "layoutMode")?.toLowerCase()} · ${formatSizingMode(
          getNodeStringProperty(node, "layoutSizingHorizontal")
        )}/${formatSizingMode(getNodeStringProperty(node, "layoutSizingVertical"))}`
      : "无自动布局"

  return {
    id: "boxModel",
    label: "盒子模型",
    value: `内容 ${formatPx(node.width)} x ${formatPx(node.height)}；内边距 ${padding.join(
      " / "
    )}；间隔 ${gap}；边框 ${stroke}；${layout}`,
    kind: "box",
  }
}

async function formatNullableNumberField(
  node: SceneNode,
  field: string,
  label: string
) {
  const value = getNodeNumberProperty(node, field)
  const variables = await variableNamesFromAliases(getBoundAliases(node, field))
  return `${label} ${formatReferenceValue({
    variables,
    fallback: value === null ? "未设置" : formatPx(value),
  })}`
}

async function formatNumberField(
  node: SceneNode,
  field: string,
  fallback: string
) {
  const value = getNodeNumberProperty(node, field)
  const variables = await variableNamesFromAliases(getBoundAliases(node, field))
  return formatReferenceValue({
    variables,
    fallback: value === null ? fallback : formatPx(value),
  })
}

async function formatRadiusField(node: SceneNode, field: string) {
  const directValue = getNodeNumberProperty(node, field)
  const sharedValue = getNodeNumberProperty(node, "cornerRadius")
  const variables = await variableNamesFromAliases(getBoundAliases(node, field))
  return formatReferenceValue({
    variables,
    fallback: formatPx(directValue ?? sharedValue ?? 0),
  })
}

async function styleNameFromId(
  styleId: string | null,
  expectedType: StyleType
): Promise<string | null> {
  if (!styleId) {
    return null
  }

  const style = await figma.getStyleByIdAsync(styleId)
  if (!style || style.type !== expectedType) {
    return null
  }

  return style.name
}

async function styleNamesFromIds(styleIds: string[], expectedType: StyleType) {
  const names = await Promise.all(
    styleIds.map((styleId) => styleNameFromId(styleId, expectedType))
  )
  return uniqueNonEmpty(names)
}

async function collectTextVariableRows(
  node: TextNode,
  segments: Array<Record<string, unknown>>,
  styleIds: string[]
) {
  const namesByField: Record<string, string[]> = {}

  await addTextVariableNamesByField(namesByField, getBoundVariables(node))

  const styles = await Promise.all(
    styleIds.map((styleId) => figma.getStyleByIdAsync(styleId))
  )
  for (const style of styles) {
    if (style && style.type === "TEXT") {
      await addTextVariableNamesByField(namesByField, style.boundVariables)
    }
  }

  for (const segment of segments) {
    await addTextVariableNamesByField(
      namesByField,
      getRecord(segment, "boundVariables")
    )
  }

  return TEXT_VARIABLE_FIELDS.map((field) => {
    const names = uniqueNonEmpty(namesByField[field] || [])
    if (names.length === 0) {
      return null
    }

    return `${TEXT_FIELD_LABELS[field]} ${names.join(" / ")}`
  }).filter((row): row is string => row !== null)
}

async function addTextVariableNamesByField(
  namesByField: Record<string, string[]>,
  source: unknown
) {
  for (const field of TEXT_VARIABLE_FIELDS) {
    const aliases = collectAliases(getRecord(source, field))
    if (aliases.length === 0) {
      continue
    }

    const names = await variableNamesFromAliases(aliases)
    if (names.length === 0) {
      continue
    }

    namesByField[field] = uniqueNonEmpty(
      (namesByField[field] || []).concat(names)
    )
  }
}

async function variableNamesFromPaintStyle(styleId: string | null) {
  if (!styleId) {
    return []
  }

  const style = await figma.getStyleByIdAsync(styleId)
  if (!style || style.type !== "PAINT") {
    return []
  }

  const aliases = collectAliases(style.boundVariables)
  pushAll(
    aliases,
    collectAliases(
      style.paints.map((paint) => getRawProperty(paint, "boundVariables"))
    )
  )
  return variableNamesFromAliases(aliases)
}

async function variableNamesFromPaints(
  paints: ReadonlyArray<Paint> | typeof figma.mixed
) {
  if (paints === figma.mixed) {
    return []
  }

  return variableNamesFromAliases(
    flattenMap(paints, (paint) =>
      collectAliases(getRawProperty(paint, "boundVariables"))
    )
  )
}

async function variableNamesFromAliases(aliases: VariableAlias[]) {
  const variables = await Promise.all(
    aliases.map((alias) => figma.variables.getVariableByIdAsync(alias.id))
  )
  return uniqueNonEmpty(variables.map((variable) => variable?.name))
}

function getTextSegments(node: TextNode) {
  return node.getStyledTextSegments([
    "fontName",
    "fontWeight",
    "fontSize",
    "lineHeight",
    "letterSpacing",
    "fills",
    "textStyleId",
    "fillStyleId",
    "boundVariables",
  ]) as Array<Record<string, unknown>>
}

function textFallback(
  node: TextNode,
  segments: Array<Record<string, unknown>>
) {
  if (segments.length > 1) {
    return "混合文字属性"
  }

  const segment = segments[0]
  const fontName =
    readFontNameParts(segment?.fontName) || readFontNameParts(node.fontName)
  const fontWeight =
    getNumber(segment?.fontWeight) ??
    getNumber(getRawProperty(node, "fontWeight"))
  const fontSize = getNumber(segment?.fontSize) ?? getNumber(node.fontSize)
  const lineHeight = formatLineHeight(segment?.lineHeight ?? node.lineHeight)
  const letterSpacing = formatLetterSpacing(
    segment?.letterSpacing ?? node.letterSpacing
  )

  return uniqueNonEmpty([
    fontName?.family ? `字体 ${fontName.family}` : null,
    fontName?.style ? `字形 ${fontName.style}` : null,
    fontWeight === null ? null : `字重 ${fontWeight}`,
    fontSize === null ? null : `字号 ${formatPx(fontSize)}`,
    lineHeight ? `行高 ${lineHeight}` : null,
    letterSpacing ? `字距 ${letterSpacing}` : null,
  ]).join("；")
}

function paintFallback(paints: ReadonlyArray<Paint> | typeof figma.mixed) {
  if (paints === figma.mixed) {
    return "混合"
  }

  if (paints.length === 0) {
    return "无"
  }

  return paints.map(formatPaint).join(" / ")
}

function formatPaint(paint: Paint) {
  if (paint.type === "SOLID") {
    const opacity = Math.round((paint.opacity ?? 1) * 100)
    return opacity === 100
      ? rgbToHex(paint.color)
      : `${rgbToHex(paint.color)} · ${opacity}%`
  }

  if (paint.type === "IMAGE") {
    return "图片填充"
  }

  if (paint.type === "GRADIENT_LINEAR") {
    return "线性渐变"
  }

  if (paint.type.indexOf("GRADIENT") === 0) {
    return "渐变"
  }

  return paint.type.toLowerCase()
}

function rgbToHex(color: RGB) {
  const values = [color.r, color.g, color.b].map((channel) => {
    const value = Math.max(0, Math.min(255, Math.round(channel * 255)))
    return value.toString(16).padStart(2, "0")
  })
  return values.join("").toUpperCase()
}

function formatLineHeight(value: unknown) {
  if (!isRecord(value)) {
    return null
  }

  const unit = value.unit
  const amount = getNumber(value.value)
  if (unit === "AUTO") {
    return "auto"
  }

  if (amount === null) {
    return null
  }

  return unit === "PERCENT" ? `${amount}%` : formatPx(amount)
}

function formatLetterSpacing(value: unknown) {
  if (!isRecord(value)) {
    return null
  }

  const amount = getNumber(value.value)
  if (amount === null) {
    return null
  }

  return value.unit === "PERCENT" ? `${amount}%` : formatPx(amount)
}

function readFontNameParts(value: unknown) {
  if (!isRecord(value)) {
    return null
  }

  const family = typeof value.family === "string" ? value.family : null
  const style = typeof value.style === "string" ? value.style : null
  if (!family && !style) {
    return null
  }

  return { family, style }
}

function getPaints(
  node: SceneNode,
  field: "fills" | "strokes"
): ReadonlyArray<Paint> | typeof figma.mixed {
  if (!(field in node)) {
    return []
  }

  const value = getRawProperty(node, field)
  return value === figma.mixed ? figma.mixed : normalizePaints(value)
}

function normalizePaints(value: unknown): ReadonlyArray<Paint> {
  return Array.isArray(value) ? (value as Paint[]) : []
}

function getStyleId(node: SceneNode, field: string) {
  const value = getRawProperty(node, field)
  return typeof value === "string" && value.length > 0 ? value : null
}

function getBoundAliases(node: SceneNode, field: string) {
  return collectAliases(getRecord(getBoundVariables(node), field))
}

function getBoundVariables(node: SceneNode) {
  return getRawProperty(node, "boundVariables")
}

function collectAliases(value: unknown): VariableAlias[] {
  if (Array.isArray(value)) {
    return flattenMap(value, collectAliases)
  }

  if (!isRecord(value)) {
    return []
  }

  if (value.type === "VARIABLE_ALIAS" && typeof value.id === "string") {
    return [value as unknown as VariableAlias]
  }

  return flattenMap(Object.values(value), collectAliases)
}

function flatten<T>(values: ReadonlyArray<ReadonlyArray<T>>): T[] {
  const result: T[] = []
  for (const group of values) {
    pushAll(result, group)
  }
  return result
}

function pushAll<T>(target: T[], values: ReadonlyArray<T>) {
  for (const value of values) {
    target.push(value)
  }
}

function flattenMap<T, R>(
  values: readonly T[],
  mapper: (value: T) => ReadonlyArray<R>
): R[] {
  const result: R[] = []
  for (const value of values) {
    const mapped = mapper(value)
    for (const item of mapped) {
      result.push(item)
    }
  }
  return result
}

function getRawProperty(source: unknown, field: string) {
  if (!isRecord(source) || !(field in source)) {
    return undefined
  }

  return source[field]
}

function getRecord(source: unknown, field: string) {
  return getRawProperty(source, field)
}

function getRecordString(source: unknown, field: string) {
  const value = getRawProperty(source, field)
  return typeof value === "string" ? value : null
}

function getNodeNumberProperty(node: SceneNode, field: string) {
  const value = getRawProperty(node, field)
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function getNodeStringProperty(node: SceneNode, field: string) {
  const value = getRawProperty(node, field)
  return typeof value === "string" ? value : null
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
