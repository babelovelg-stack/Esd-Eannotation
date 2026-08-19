import {
  getAnnotationPalette,
  getTagPalette,
  contentWidthForDesignReferences,
  imageHeightForWidth,
  inferAnnotationModeFromAncestry,
  localAnnotationCardName,
  nextBadgeNumber,
  normalizeAnnotationTagId,
  normalizeWarningLevel,
  resolveLocalAnnotationCardName,
  tagDefinitionForId,
  type AnnotationPalette,
  type AnnotationMode,
  type AnnotationTagId,
  type WarningLevel,
} from "../shared/annotation-model"
import type {
  CreateAnnotationMessage,
  DesignReferenceOption,
  MainToUiMessage,
  PropertyOption,
  UiImagePayload,
  UiToMainMessage,
} from "../shared/messages"
import {
  collectPropertyOptions,
  collectSelectedPropertyOptions,
} from "./properties"

const UI_WIDTH = 390
const UI_HEIGHT = 680
const CARD_PADDING = 20
const CARD_RADIUS = 20
const IMAGE_RADIUS = 14
const MODULE_GAP = 10
const GLOBAL_CONTENT_WIDTH = 355
const LOCAL_CONTENT_WIDTH = 317
const BADGE_SIZE = 26
const BADGE_RADIUS = 10
const ANNOTATION_GAP = 24
const PLUGIN_DATA_KEY = "anno"
const PUBLIC_RELAUNCH_LABEL = "Open Esd-Eannotation"
const TAG_CHIP_NAME = "Annotation tag"

type AnnotationParent = PageNode | SectionNode
type AnnotationCardNode = FrameNode
type FrameLikeNode = FrameNode | ComponentNode | InstanceNode
type DesignReferenceNode = FrameLikeNode
type CanvasFonts = {
  regular: FontName
  medium: FontName
}
type AnnoPluginData = {
  type: "badge" | "card"
  mode?: AnnotationMode
  number?: number
  sourceNodeId?: string
  tagId?: AnnotationTagId
  warningLevel?: WarningLevel
}
type LocalAnnotationRecord = {
  sourceNodeId: string
  cards: AnnotationCardNode[]
  badges: AnnotationCardNode[]
}

let fontCache: Promise<CanvasFonts> | null = null
let isSynchronizingAnnotations = false
let annotationDataByNodeId = new Map<string, AnnoPluginData>()
let watchedPage: PageNode | null = null

figma.showUI(__html__, {
  width: UI_WIDTH,
  height: UI_HEIGHT,
  title: "Esd-Eannotation",
  themeColors: true,
})

figma.on("selectionchange", () => {
  void syncSelectionContext()
})

figma.on("currentpagechange", () => {
  void syncCurrentPageState()
})

const handleCurrentPageNodeChange = (event: NodeChangeEvent) => {
  if (isSynchronizingAnnotations) {
    return
  }

  const deletedAnnotations = event.nodeChanges
    .filter((change): change is DeleteChange => change.type === "DELETE")
    .map((change) => annotationDataByNodeId.get(change.id))
    .filter((data): data is AnnoPluginData => data !== undefined)

  if (deletedAnnotations.length === 0) {
    return
  }

  void (async () => {
    await reconcileAnnotationIntegrity(deletedAnnotations)
    await syncSelectionContext()
  })()
}

figma.ui.onmessage = (message: UiToMainMessage) => {
  if (message.type === "create-annotation") {
    void createAnnotation(message)
  }
  if (message.type === "request-design-references") {
    void sendDesignReferenceOptions(message.selectionToken)
  }
  if (message.type === "resolve-design-reference") {
    void resolveDesignReferenceById(message.selectionToken, message.nodeId)
  }
}

void syncCurrentPageState()

async function syncSelectionContext() {
  const message = await buildSelectionContextMessage()
  postToUi(message)
}

async function syncCurrentPageState() {
  await figma.currentPage.loadAsync()
  watchCurrentPageNodeChanges()
  syncAnnotationRegistry()
  await reconcileAnnotationIntegrity()
  await syncSelectionContext()
}

function watchCurrentPageNodeChanges() {
  if (watchedPage === figma.currentPage) {
    return
  }

  watchedPage?.off("nodechange", handleCurrentPageNodeChange)
  watchedPage = figma.currentPage
  watchedPage.on("nodechange", handleCurrentPageNodeChange)
}

async function buildSelectionContextMessage(): Promise<MainToUiMessage> {
  const selection = figma.currentPage.selection
  if (selection.length === 0) {
    return { type: "selection-context", status: "empty" }
  }

  if (selection.length > 1) {
    return { type: "selection-context", status: "multi" }
  }

  const node = selection[0]
  const analysis = analyzeSelection(node)
  const properties = await collectPropertyOptions(node)
  const parent = analysis.sectionAncestor || figma.currentPage
  const existingAnnotation = findExistingAnnotation(
    parent,
    node.id,
    analysis.mode
  )

  return {
    type: "selection-context",
    status: "ready",
    mode: analysis.mode,
    selectionToken: createSelectionToken(node),
    nodeName: node.name,
    nodeType: node.type,
    nodeSize: `${Math.round(node.width)} x ${Math.round(node.height)}`,
    parentScope: analysis.sectionAncestor?.name || figma.currentPage.name,
    outerFrameName: analysis.outerFrame?.name || null,
    nextBadgeNumber:
      analysis.mode === "local"
        ? existingAnnotation?.number || getNextBadgeNumberForCurrentPage()
        : null,
    existingTagId: existingAnnotation?.tagId || "none",
    existingWarningLevel: existingAnnotation?.warningLevel || 0,
    properties,
  }
}

async function createAnnotation(message: CreateAnnotationMessage) {
  try {
    const node = getSingleSelectedNode(message.selectionToken)
    const analysis = analyzeSelection(node)
    const selectedProperties = await collectSelectedPropertyOptions(
      node,
      message.selectedPropertyIds
    )
    const text = message.text.trim()
    const tagId = normalizeAnnotationTagId(message.tagId)
    const warningLevel = normalizeWarningLevel(message.warningLevel)
    const palette = getAnnotationPalette({ tagId, warningLevel })
    const designReferences = await resolveSelectedDesignReferences(
      node,
      message.designReferenceIds
    )

    if (
      text.length === 0 &&
      message.images.length === 0 &&
      designReferences.length === 0 &&
      tagId === "none" &&
      selectedProperties.length === 0
    ) {
      throw new Error("请先输入文本、添加图片或选择至少一个属性标注")
    }

    const parent = analysis.sectionAncestor || figma.currentPage
    const existingAnnotation = findExistingAnnotation(
      parent,
      node.id,
      analysis.mode
    )

    if (existingAnnotation) {
      if (analysis.mode === "local" && analysis.outerFrame) {
        updateLocalCardName(existingAnnotation.card, analysis.outerFrame.name)
      }
      const content = getAnnotationContentFrame(
        existingAnnotation.card,
        analysis.mode
      )
      const baseContentWidth =
        analysis.mode === "local"
          ? Math.max(LOCAL_CONTENT_WIDTH, content.width)
          : Math.max(GLOBAL_CONTENT_WIDTH, existingAnnotation.card.width - 40)
      const contentWidth = contentWidthForDesignReferences(
        baseContentWidth,
        designReferences.map((reference) => reference.width)
      )
      resizeAnnotationForContentWidth(
        existingAnnotation.card,
        content,
        analysis.mode,
        contentWidth
      )
      const designReferenceGroup = await appendAnnotationContent({
        content,
        text,
        images: message.images,
        designReferences,
        properties: selectedProperties,
        sourceNode: node,
        contentWidth,
        tagId,
        palette,
      })
      moveDesignReferencesToGroup(designReferenceGroup, designReferences)
      applyAnnotationPalette(
        existingAnnotation.card,
        existingAnnotation.badge,
        palette,
        tagId
      )
      setAnnoData(existingAnnotation.card, {
        ...(getAnnoData(existingAnnotation.card) || {}),
        type: "card",
        mode: analysis.mode,
        number: existingAnnotation.number ?? undefined,
        sourceNodeId: node.id,
        tagId,
        warningLevel,
      })
      if (existingAnnotation.badge) {
        setAnnoData(existingAnnotation.badge, {
          ...(getAnnoData(existingAnnotation.badge) || {}),
          type: "badge",
          mode: "local",
          number: existingAnnotation.number ?? undefined,
          sourceNodeId: node.id,
          tagId,
          warningLevel,
        })
      }
      refreshAnnotationRelaunchData(existingAnnotation.card)
      if (existingAnnotation.badge) {
        refreshAnnotationRelaunchData(existingAnnotation.badge)
      }

      figma.currentPage.selection = existingAnnotation.badge
        ? [existingAnnotation.badge, existingAnnotation.card]
        : [existingAnnotation.card]
      figma.viewport.scrollAndZoomIntoView(
        existingAnnotation.badge
          ? [existingAnnotation.badge, existingAnnotation.card]
          : [existingAnnotation.card]
      )

      postToUi({
        type: "create-result",
        badgeNodeId: existingAnnotation.badge?.id || null,
        cardNodeId: existingAnnotation.card.id,
        badgeNumber: existingAnnotation.number,
        updated: true,
      })
      await syncSelectionContext()
      return
    }

    const badgeNumber =
      analysis.mode === "local" ? getNextBadgeNumberForCurrentPage() : null
    const externalBadge =
      analysis.mode === "local" && badgeNumber !== null
        ? await createBadge(badgeNumber, true, palette)
        : null
    const { card, designReferenceGroup } = await createAnnotationCard({
      mode: analysis.mode,
      badgeNumber,
      text,
      images: message.images,
      designReferences,
      properties: selectedProperties,
      sourceNode: node,
      localCanvasName: analysis.outerFrame?.name ?? null,
      tagId,
      palette,
    })

    parent.appendChild(card)
    moveDesignReferencesToGroup(designReferenceGroup, designReferences)
    if (externalBadge) {
      parent.appendChild(externalBadge)
    }

    const sourceBox = requiredBox(node)
    const anchorBox =
      analysis.mode === "local" && analysis.outerFrame
        ? requiredBox(analysis.outerFrame)
        : sourceBox
    const cardTarget = avoidCardCollision(
      parent,
      anchorBox.x + anchorBox.width + ANNOTATION_GAP,
      anchorBox.y,
      card.width,
      card.height
    )

    setAbsolutePosition(card, parent, cardTarget.x, cardTarget.y)
    setAnnoData(card, {
      type: "card",
      mode: analysis.mode,
      number: badgeNumber ?? undefined,
      sourceNodeId: node.id,
      tagId,
      warningLevel,
    })
    refreshAnnotationRelaunchData(card)

    if (externalBadge) {
      setAbsolutePosition(
        externalBadge,
        parent,
        sourceBox.x + sourceBox.width - BADGE_SIZE / 2,
        sourceBox.y - BADGE_SIZE / 2
      )
      setAnnoData(externalBadge, {
        type: "badge",
        mode: "local",
        number: badgeNumber ?? undefined,
        sourceNodeId: node.id,
        tagId,
        warningLevel,
      })
      refreshAnnotationRelaunchData(externalBadge)
      figma.currentPage.selection = [externalBadge, card]
    } else {
      figma.currentPage.selection = [card]
    }

    figma.viewport.scrollAndZoomIntoView(
      externalBadge ? [externalBadge, card] : [card]
    )

    postToUi({
      type: "create-result",
      badgeNodeId: externalBadge?.id || null,
      cardNodeId: card.id,
      badgeNumber,
    })
    await syncSelectionContext()
  } catch (error) {
    postToUi({
      type: "error",
      message: error instanceof Error ? error.message : "创建标注失败",
    })
  }
}

async function resolveDesignReferenceById(
  selectionToken: string,
  nodeId: string
) {
  try {
    const sourceNode = getSingleSelectedNode(selectionToken)
    const node = await figma.getNodeByIdAsync(nodeId)
    if (!node || !isFrameLikeNode(node)) {
      throw new Error("链接中的节点不是可关联的 Frame、Component 或 Instance")
    }

    const sourceDesignId =
      analyzeSelection(sourceNode).outerFrame?.id || sourceNode.id
    if (node.id === sourceDesignId || containsNode(node, sourceNode)) {
      throw new Error("不能把当前正在标注的设计稿移入自身")
    }
    if (getAnnoData(node) !== null || hasAnnoAncestor(node)) {
      throw new Error("这个设计稿已经位于 Esd-Eannotation 标注中")
    }

    postToUi({
      type: "design-reference-resolved",
      selectionToken,
      option: await createDesignReferenceOption(node),
    })
  } catch (error) {
    postToUi({
      type: "error",
      message:
        error instanceof Error ? error.message : "读取链接中的设计稿失败",
    })
  }
}

async function sendDesignReferenceOptions(selectionToken: string) {
  try {
    const sourceNode = getSingleSelectedNode(selectionToken)
    const candidates = getDesignReferenceCandidates(sourceNode)
    const options = await Promise.all(
      candidates.map(createDesignReferenceOption)
    )

    postToUi({
      type: "design-reference-options",
      selectionToken,
      options,
    })
  } catch (error) {
    postToUi({
      type: "error",
      message: error instanceof Error ? error.message : "读取设计稿失败",
    })
  }
}

async function createDesignReferenceOption(
  node: FrameLikeNode
): Promise<DesignReferenceOption> {
  return {
    nodeId: node.id,
    name: node.name,
    nodeType: node.type,
    width: Math.max(1, Math.round(node.width)),
    height: Math.max(1, Math.round(node.height)),
    nodeSize: `${Math.round(node.width)} x ${Math.round(node.height)}`,
    scopeName: node.parent?.name || figma.currentPage.name,
    thumbnailBytes: await exportDesignReference(node, 320),
  }
}

function containsNode(parent: ChildrenMixin, target: BaseNode): boolean {
  return parent.children.some(
    (child) =>
      child.id === target.id ||
      ("children" in child && containsNode(child as ChildrenMixin, target))
  )
}

function hasAnnoAncestor(node: BaseNode) {
  let parent = node.parent
  while (parent && parent.type !== "DOCUMENT") {
    if (getAnnoData(parent) !== null) {
      return true
    }
    parent = parent.parent
  }
  return false
}

function getDesignReferenceCandidates(sourceNode: SceneNode) {
  const analysis = analyzeSelection(sourceNode)
  const currentDesignId = analysis.outerFrame?.id || sourceNode.id
  const scope = analysis.sectionAncestor || figma.currentPage
  const candidates: FrameLikeNode[] = []

  const collectFrameLikeChildren = (parent: ChildrenMixin) => {
    for (const child of parent.children) {
      if (isFrameLikeNode(child)) {
        candidates.push(child)
      }
    }
  }

  if (scope.type === "SECTION") {
    collectFrameLikeChildren(scope)
  } else {
    for (const child of scope.children) {
      if (isFrameLikeNode(child)) {
        candidates.push(child)
      } else if (child.type === "SECTION") {
        collectFrameLikeChildren(child)
      }
    }
  }

  return candidates
    .filter((node) => node.id !== currentDesignId && getAnnoData(node) === null)
    .sort((left, right) => {
      const leftBox = requiredBox(left)
      const rightBox = requiredBox(right)
      return leftBox.y - rightBox.y || leftBox.x - rightBox.x
    })
}

async function resolveSelectedDesignReferences(
  sourceNode: SceneNode,
  requestedIds: string[]
): Promise<DesignReferenceNode[]> {
  const sourceDesignId =
    analyzeSelection(sourceNode).outerFrame?.id || sourceNode.id
  const uniqueIds = Array.from(new Set(requestedIds))

  return Promise.all(
    uniqueIds.map(async (nodeId) => {
      const node = await figma.getNodeByIdAsync(nodeId)
      if (!node || !isFrameLikeNode(node)) {
        throw new Error("关联设计稿已变化，请重新选择")
      }
      if (node.id === sourceDesignId || containsNode(node, sourceNode)) {
        throw new Error("不能把当前正在标注的设计稿移入自身")
      }
      if (getAnnoData(node) !== null || hasAnnoAncestor(node)) {
        throw new Error("这个设计稿已经位于 Esd-Eannotation 标注中")
      }
      return node
    })
  )
}

function exportDesignReference(node: FrameLikeNode, maxWidth: number) {
  return node.exportAsync({
    format: "PNG",
    constraint: {
      type: "WIDTH",
      value: Math.min(maxWidth, Math.max(1, Math.round(node.width))),
    },
  })
}

function postToUi(message: MainToUiMessage) {
  figma.ui.postMessage(message)
}

function getSingleSelectedNode(selectionToken: string) {
  const selection = figma.currentPage.selection
  if (selection.length !== 1) {
    throw new Error("请只选择一个元素")
  }

  const node = selection[0]
  if (createSelectionToken(node) !== selectionToken) {
    throw new Error("当前选择已变化，请重新确认标注内容")
  }

  return node
}

function createSelectionToken(node: SceneNode) {
  return `${figma.currentPage.id}:${node.id}`
}

function analyzeSelection(node: SceneNode) {
  const ancestors: BaseNode[] = []
  let sectionAncestor: SectionNode | null = null
  const frameAncestors: FrameLikeNode[] = []
  let parent = node.parent

  while (parent && parent.type !== "PAGE") {
    ancestors.push(parent)
    if (parent.type === "SECTION" && sectionAncestor === null) {
      sectionAncestor = parent
    }
    if (isFrameLikeNode(parent)) {
      frameAncestors.push(parent)
    }
    parent = parent.parent
  }

  const mode = inferAnnotationModeFromAncestry(
    ancestors.map((ancestor) => ancestor.type)
  )

  return {
    mode,
    sectionAncestor,
    outerFrame:
      frameAncestors.length > 0
        ? frameAncestors[frameAncestors.length - 1]
        : null,
  }
}

function isFrameLikeNode(node: BaseNode): node is FrameLikeNode {
  return (
    node.type === "FRAME" ||
    node.type === "COMPONENT" ||
    node.type === "INSTANCE"
  )
}

function getNextBadgeNumberForCurrentPage() {
  const numbers = collectLocalAnnotationRecords()
    .map(getLocalAnnotationRecordNumber)
    .filter((value): value is number => typeof value === "number")

  return nextBadgeNumber(numbers)
}

async function reconcileAnnotationIntegrity(
  deletedAnnotations: AnnoPluginData[] = []
) {
  if (isSynchronizingAnnotations) {
    return
  }

  isSynchronizingAnnotations = true
  try {
    const deletedBadgeSourceIds = new Set(
      deletedAnnotations
        .filter(
          (data) =>
            data.type === "badge" &&
            data.mode === "local" &&
            typeof data.sourceNodeId === "string"
        )
        .map((data) => data.sourceNodeId as string)
    )

    for (const record of collectLocalAnnotationRecords()) {
      if (record.cards.length === 0) {
        removeAnnotationNodes(record.badges)
        continue
      }

      if (
        record.badges.length === 0 &&
        deletedBadgeSourceIds.has(record.sourceNodeId)
      ) {
        removeAnnotationNodes(record.cards)
      }
    }

    await renumberLocalAnnotations()
    refreshCurrentPageAnnotationRelaunchData()
  } finally {
    syncAnnotationRegistry()
    isSynchronizingAnnotations = false
  }
}

async function renumberLocalAnnotations() {
  const records = collectLocalAnnotationRecords()
    .filter((record) => record.cards.length > 0)
    .sort(compareLocalAnnotationRecords)

  for (const [index, record] of records.entries()) {
    const number = index + 1
    const card = sortAnnotationNodes(record.cards)[0]
    const badge = sortAnnotationNodes(record.badges)[0] || null
    const visualData = getAnnoData(card) || (badge ? getAnnoData(badge) : null)
    const tagId = normalizeAnnotationTagId(visualData?.tagId)
    const warningLevel = normalizeWarningLevel(visualData?.warningLevel)
    const palette = getAnnotationPalette({ tagId, warningLevel })

    updateAnnoNumber(card, number)
    await updateLocalCardNameFromSource(card, record.sourceNodeId)
    await updateInternalBadgeNumber(card, number, palette)
    applyAnnotationPalette(card, badge, palette, tagId)

    if (badge) {
      updateAnnoNumber(badge, number)
      await updateBadgeVisualNumber(badge, number, true, palette)
    }
  }
}

function collectLocalAnnotationRecords() {
  const records = new Map<string, LocalAnnotationRecord>()

  for (const node of getCurrentPageAnnoNodes()) {
    const data = getAnnoData(node)
    if (
      !data ||
      data.mode !== "local" ||
      typeof data.sourceNodeId !== "string"
    ) {
      continue
    }

    const key = `local:${data.sourceNodeId}`
    const record =
      records.get(key) ||
      ({
        sourceNodeId: data.sourceNodeId,
        cards: [],
        badges: [],
      } satisfies LocalAnnotationRecord)

    if (data.type === "card") {
      record.cards.push(node)
    } else {
      record.badges.push(node)
    }

    records.set(key, record)
  }

  return Array.from(records.values())
}

function compareLocalAnnotationRecords(
  left: LocalAnnotationRecord,
  right: LocalAnnotationRecord
) {
  const leftNumber = getLocalAnnotationRecordNumber(left)
  const rightNumber = getLocalAnnotationRecordNumber(right)

  if (
    leftNumber !== null &&
    rightNumber !== null &&
    leftNumber !== rightNumber
  ) {
    return leftNumber - rightNumber
  }

  if (leftNumber !== null && rightNumber === null) {
    return -1
  }

  if (leftNumber === null && rightNumber !== null) {
    return 1
  }

  const leftBox = getLocalAnnotationRecordBox(left)
  const rightBox = getLocalAnnotationRecordBox(right)
  return (
    leftBox.y - rightBox.y ||
    leftBox.x - rightBox.x ||
    left.sourceNodeId.localeCompare(right.sourceNodeId)
  )
}

function getLocalAnnotationRecordNumber(record: LocalAnnotationRecord) {
  const numbers = [...record.cards, ...record.badges]
    .map((node) => getAnnoData(node)?.number)
    .filter((value): value is number => typeof value === "number")

  return numbers.length > 0 ? Math.min(...numbers) : null
}

function getLocalAnnotationRecordBox(record: LocalAnnotationRecord) {
  return (
    sortAnnotationNodes([...record.badges, ...record.cards])[0]
      ?.absoluteBoundingBox || { x: 0, y: 0, width: 0, height: 0 }
  )
}

function sortAnnotationNodes<T extends SceneNode>(nodes: T[]) {
  return [...nodes].sort((left, right) => {
    const leftBox = left.absoluteBoundingBox
    const rightBox = right.absoluteBoundingBox
    return (
      (leftBox?.y ?? 0) - (rightBox?.y ?? 0) ||
      (leftBox?.x ?? 0) - (rightBox?.x ?? 0) ||
      left.id.localeCompare(right.id)
    )
  })
}

function removeAnnotationNodes(nodes: AnnotationCardNode[]) {
  for (const node of nodes) {
    if (!node.removed) {
      node.remove()
    }
  }
}

function updateAnnoNumber(node: AnnotationCardNode, number: number) {
  const data = getAnnoData(node)
  if (!data || data.number === number) {
    return
  }

  setAnnoData(node, {
    ...data,
    number,
  })
}

function updateLocalCardName(
  card: AnnotationCardNode,
  canvasName: string | null
) {
  const nextName = resolveLocalAnnotationCardName(card.name, canvasName)
  if (card.name !== nextName) {
    card.name = nextName
  }
}

async function updateLocalCardNameFromSource(
  card: AnnotationCardNode,
  sourceNodeId: string
) {
  const sourceNode = await figma.getNodeByIdAsync(sourceNodeId)
  if (!sourceNode || !isSceneNode(sourceNode)) {
    updateLocalCardName(card, null)
    return
  }

  const outerFrame = analyzeSelection(sourceNode).outerFrame
  updateLocalCardName(card, outerFrame?.name ?? null)
}

function isSceneNode(node: BaseNode): node is SceneNode {
  return node.type !== "DOCUMENT" && node.type !== "PAGE"
}

async function updateInternalBadgeNumber(
  card: AnnotationCardNode,
  number: number,
  palette: AnnotationPalette
) {
  const badge = findInternalBadge(card)
  if (!badge) {
    return
  }

  await updateBadgeVisualNumber(badge, number, false, palette)
}

function findInternalBadge(card: AnnotationCardNode) {
  return findDescendantFrame(
    card,
    (node) =>
      node.name.startsWith("Eannotation / Badge label") ||
      node.name.startsWith("Anno / Badge label")
  )
}

function findDescendantFrame(
  parent: ChildrenMixin,
  predicate: (node: FrameNode) => boolean
): FrameNode | null {
  for (const child of parent.children) {
    if (child.type !== "FRAME") {
      continue
    }

    if (predicate(child)) {
      return child
    }

    const nested = findDescendantFrame(child, predicate)
    if (nested) {
      return nested
    }
  }

  return null
}

async function updateBadgeVisualNumber(
  badge: AnnotationCardNode,
  number: number,
  markAsExternal: boolean,
  palette: AnnotationPalette
) {
  const nextName = markAsExternal
    ? `Eannotation / Badge ${number}`
    : `Eannotation / Badge label ${number}`
  if (badge.name !== nextName) {
    badge.name = nextName
  }

  const text = badge.children.find(
    (child): child is TextNode => child.type === "TEXT"
  )
  if (!text) {
    badge.appendChild(
      await createText(String(number), {
        font: "medium",
        fontSize: 14,
        lineHeight: 22,
        color: palette.badgeText,
      })
    )
    styleBadge(badge, palette)
    return
  }

  if (text.characters === String(number)) {
    styleBadge(badge, palette)
    return
  }

  if (text.fontName !== figma.mixed) {
    await figma.loadFontAsync(text.fontName)
  }
  text.characters = String(number)
  styleBadge(badge, palette)
}

function getCurrentPageAnnoNodes() {
  return figma.currentPage
    .findAll((node) => getAnnoData(node) !== null)
    .filter((node): node is AnnotationCardNode => node.type === "FRAME")
}

function refreshCurrentPageAnnotationRelaunchData() {
  for (const node of getCurrentPageAnnoNodes()) {
    refreshAnnotationRelaunchData(node)
  }
}

function refreshAnnotationRelaunchData(node: AnnotationCardNode) {
  setRelaunchData(node, { open: PUBLIC_RELAUNCH_LABEL })
}

function syncAnnotationRegistry() {
  annotationDataByNodeId = new Map(
    getCurrentPageAnnoNodes()
      .map((node) => [node.id, getAnnoData(node)] as const)
      .filter(
        (entry): entry is readonly [string, AnnoPluginData] => entry[1] !== null
      )
  )
}

function findExistingAnnotation(
  parent: AnnotationParent,
  sourceNodeId: string,
  mode: AnnotationMode
) {
  let card: AnnotationCardNode | null = null
  let badge: AnnotationCardNode | null = null
  let number: number | null = null
  let tagId: AnnotationTagId = "none"
  let warningLevel: WarningLevel = 0

  for (const child of parent.children) {
    const data = getAnnoData(child)
    if (!data || data.sourceNodeId !== sourceNodeId || data.mode !== mode) {
      continue
    }

    if (data.type === "card" && child.type === "FRAME") {
      card = child
      number = typeof data.number === "number" ? data.number : null
      tagId = normalizeAnnotationTagId(data.tagId)
      warningLevel = normalizeWarningLevel(data.warningLevel)
    }

    if (data.type === "badge" && child.type === "FRAME") {
      badge = child
      if (typeof data.number === "number") {
        number = data.number
      }
      if (!card) {
        tagId = normalizeAnnotationTagId(data.tagId)
        warningLevel = normalizeWarningLevel(data.warningLevel)
      }
    }
  }

  return card ? { card, badge, number, tagId, warningLevel } : null
}

async function createAnnotationCard({
  mode,
  badgeNumber,
  text,
  images,
  designReferences,
  properties,
  sourceNode,
  localCanvasName,
  tagId,
  palette,
}: {
  mode: AnnotationMode
  badgeNumber: number | null
  text: string
  images: UiImagePayload[]
  designReferences: DesignReferenceNode[]
  properties: PropertyOption[]
  sourceNode: SceneNode
  localCanvasName: string | null
  tagId: AnnotationTagId
  palette: AnnotationPalette
}) {
  const baseContentWidth =
    mode === "local" ? LOCAL_CONTENT_WIDTH : GLOBAL_CONTENT_WIDTH
  const contentWidth = contentWidthForDesignReferences(
    baseContentWidth,
    designReferences.map((reference) => reference.width)
  )
  const cardWidth = annotationCardWidth(mode, contentWidth)
  const cardName = (() => {
    if (mode !== "local") {
      return "Eannotation / Global Annotation"
    }
    if (localCanvasName === null) {
      throw new Error("无法确定局部标注所属画布")
    }
    return localAnnotationCardName(localCanvasName)
  })()
  const card = createAutoFrame(
    cardName,
    mode === "local" ? "HORIZONTAL" : "VERTICAL",
    cardWidth
  )
  card.paddingTop = CARD_PADDING
  card.paddingRight = CARD_PADDING
  card.paddingBottom = CARD_PADDING
  card.paddingLeft = CARD_PADDING
  card.itemSpacing = mode === "local" ? 12 : 4
  card.cornerRadius = CARD_RADIUS
  card.fills = [solid(palette.cardFill)]
  card.strokes = [solid(palette.border)]
  card.strokeWeight = 1
  card.effects = [
    {
      type: "DROP_SHADOW",
      color: rgbaFromHex(palette.shadow, palette.shadowOpacity),
      offset: { x: 0, y: 2 },
      radius: 6,
      spread: 0,
      visible: true,
      blendMode: "NORMAL",
    },
  ]

  const content =
    mode === "local"
      ? createAutoFrame("Description", "VERTICAL", contentWidth)
      : card

  if (mode === "local") {
    const badgeColumn = createAutoFrame(
      "Layout wrapper",
      "VERTICAL",
      BADGE_SIZE
    )
    badgeColumn.fills = []
    badgeColumn.paddingTop = 3
    badgeColumn.counterAxisAlignItems = "CENTER"
    badgeColumn.appendChild(await createBadge(badgeNumber ?? 1, false, palette))
    card.appendChild(badgeColumn)
    card.appendChild(content)
  }

  if (mode === "local") {
    content.fills = []
  }
  content.itemSpacing = MODULE_GAP
  content.counterAxisAlignItems = "MIN"

  const designReferenceGroup = await appendAnnotationContent({
    content,
    text,
    images,
    designReferences,
    properties,
    sourceNode,
    contentWidth,
    tagId,
    palette,
  })

  return { card, designReferenceGroup }
}

async function appendAnnotationContent({
  content,
  text,
  images,
  designReferences,
  properties,
  sourceNode,
  contentWidth,
  tagId,
  palette,
}: {
  content: AnnotationCardNode
  text: string
  images: UiImagePayload[]
  designReferences: DesignReferenceNode[]
  properties: PropertyOption[]
  sourceNode: SceneNode
  contentWidth: number
  tagId: AnnotationTagId
  palette: AnnotationPalette
}) {
  await syncAnnotationTag(content, tagId)

  if (text) {
    appendAnnotationModule(
      content,
      await createText(text, {
        width: contentWidth,
        font: "regular",
        fontSize: 16,
        lineHeight: 32,
        color: palette.bodyText,
      }),
      contentWidth,
      palette
    )
  }

  if (images.length > 0) {
    appendAnnotationModule(
      content,
      createImageGroup(images, contentWidth),
      contentWidth,
      palette
    )
  }

  const designReferenceGroup =
    designReferences.length > 0
      ? createDesignReferenceGroup(contentWidth)
      : null
  if (designReferenceGroup) {
    appendAnnotationModule(content, designReferenceGroup, contentWidth, palette)
  }

  if (properties.length > 0) {
    appendAnnotationModule(
      content,
      await createPropertySection(
        properties,
        sourceNode,
        contentWidth,
        palette
      ),
      contentWidth,
      palette
    )
  }

  return designReferenceGroup
}

function appendAnnotationModule(
  content: AnnotationCardNode,
  moduleNode: SceneNode,
  width: number,
  palette: AnnotationPalette
) {
  if (content.children.some((child) => !isTagChip(child))) {
    content.appendChild(createDivider(width, palette))
  }
  content.appendChild(moduleNode)
}

function getAnnotationContentFrame(
  card: AnnotationCardNode,
  mode: AnnotationMode
) {
  if (mode === "global") {
    return card
  }

  const content = card.children.find(
    (child): child is FrameNode =>
      child.type === "FRAME" && child.name === "Description"
  )

  return content || card
}

function annotationCardWidth(mode: AnnotationMode, contentWidth: number) {
  return (
    contentWidth + CARD_PADDING * 2 + (mode === "local" ? BADGE_SIZE + 12 : 0)
  )
}

function resizeAnnotationForContentWidth(
  card: AnnotationCardNode,
  content: AnnotationCardNode,
  mode: AnnotationMode,
  contentWidth: number
) {
  if (mode === "local") {
    content.resize(contentWidth, content.height)
  }
  card.resize(annotationCardWidth(mode, contentWidth), card.height)
}

async function syncAnnotationTag(
  content: AnnotationCardNode,
  tagId: AnnotationTagId
) {
  const normalizedTagId = normalizeAnnotationTagId(tagId)
  const existingTag = content.children.find(
    (child): child is AnnotationCardNode => isTagChip(child)
  )

  if (normalizedTagId === "none") {
    existingTag?.remove()
    return
  }

  if (existingTag) {
    await updateTagChip(existingTag, normalizedTagId)
    return
  }

  const chip = await createTagChip(normalizedTagId)
  if (content.children.length > 0) {
    content.insertChild(0, chip)
  } else {
    content.appendChild(chip)
  }
}

async function createTagChip(tagId: AnnotationTagId) {
  const chip = createAutoFrame(TAG_CHIP_NAME, "HORIZONTAL")
  chip.primaryAxisSizingMode = "AUTO"
  chip.counterAxisSizingMode = "AUTO"
  chip.primaryAxisAlignItems = "CENTER"
  chip.counterAxisAlignItems = "CENTER"
  chip.itemSpacing = 4
  chip.paddingTop = 3
  chip.paddingRight = 8
  chip.paddingBottom = 3
  chip.paddingLeft = 8
  chip.cornerRadius = 999

  styleTagChip(chip, tagId)
  const label = await createText(tagDefinitionForId(tagId).label, {
    font: "medium",
    fontSize: 12,
    lineHeight: 18,
    color: getTagPalette(tagId).tagChipText,
  })
  label.name = "Tag label"
  chip.appendChild(label)
  return chip
}

async function updateTagChip(chip: AnnotationCardNode, tagId: AnnotationTagId) {
  styleTagChip(chip, tagId)
  const label = chip.children.find(
    (child): child is TextNode => child.type === "TEXT"
  )
  const text = tagDefinitionForId(tagId).label

  if (!label) {
    const nextLabel = await createText(text, {
      font: "medium",
      fontSize: 12,
      lineHeight: 18,
      color: getTagPalette(tagId).tagChipText,
    })
    nextLabel.name = "Tag label"
    chip.appendChild(nextLabel)
    return
  }

  if (label.fontName !== figma.mixed) {
    await figma.loadFontAsync(label.fontName)
  }
  label.name = "Tag label"
  label.characters = text
  label.fills = [solid(getTagPalette(tagId).tagChipText)]
}

function isTagChip(node: BaseNode): boolean {
  return node.type === "FRAME" && node.name === TAG_CHIP_NAME
}

function styleTagChip(chip: AnnotationCardNode, tagId: AnnotationTagId) {
  const tagPalette = getTagPalette(tagId)
  chip.fills = [solid(tagPalette.tagChipFill)]
  chip.strokes = [solid(tagPalette.tagChipBorder)]
  chip.strokeWeight = 1

  for (const child of chip.children) {
    if (child.type === "TEXT") {
      child.fills = [solid(tagPalette.tagChipText)]
    }
  }
}

function applyAnnotationPalette(
  card: AnnotationCardNode,
  externalBadge: AnnotationCardNode | null,
  palette: AnnotationPalette,
  tagId: AnnotationTagId
) {
  styleAnnotationCard(card, palette)
  for (const child of card.children) {
    applyPaletteToAnnotationChild(child, palette, tagId)
  }

  if (externalBadge) {
    styleBadge(externalBadge, palette)
  }
}

function styleAnnotationCard(
  card: AnnotationCardNode,
  palette: AnnotationPalette
) {
  card.fills = [solid(palette.cardFill)]
  card.strokes = [solid(palette.border)]
  card.strokeWeight = 1
  card.effects = [
    {
      type: "DROP_SHADOW",
      color: rgbaFromHex(palette.shadow, palette.shadowOpacity),
      offset: { x: 0, y: 2 },
      radius: 6,
      spread: 0,
      visible: true,
      blendMode: "NORMAL",
    },
  ]
}

function applyPaletteToAnnotationChild(
  node: SceneNode,
  palette: AnnotationPalette,
  tagId: AnnotationTagId
) {
  if (node.type === "TEXT") {
    node.fills = [solid(palette.bodyText)]
    return
  }

  if (node.type !== "FRAME") {
    return
  }

  if (
    node.name.startsWith("Eannotation / Badge") ||
    node.name.startsWith("Anno / Badge")
  ) {
    styleBadge(node, palette)
    return
  }

  if (isTagChip(node)) {
    styleTagChip(node, tagId)
    return
  }

  if (node.name === "Divider") {
    node.fills = [solid(palette.divider)]
    return
  }

  if (node.name === "Box model") {
    styleBoxModelGraphic(node, palette)
    return
  }

  if (node.name.startsWith("Description /")) {
    styleDescriptionRow(node, palette)
    return
  }

  if (node.name === "Design references") {
    return
  }

  if (node.name !== "Images") {
    node.fills = []
  }

  for (const child of node.children) {
    applyPaletteToAnnotationChild(child, palette, tagId)
  }
}

function styleBadge(badge: AnnotationCardNode, palette: AnnotationPalette) {
  badge.fills = [solid(palette.badgeFill)]
  badge.strokes = [solid(palette.badgeText, 0.2)]
  badge.strokeWeight = 1
  badge.effects = [
    {
      type: "DROP_SHADOW",
      color: rgbaFromHex(palette.badgeFill, 0.28),
      offset: { x: 0, y: 2 },
      radius: 4,
      spread: 0,
      visible: true,
      blendMode: "NORMAL",
    },
  ]

  for (const child of badge.children) {
    if (child.type === "TEXT") {
      child.fills = [solid(palette.badgeText)]
    }
  }
}

function styleDescriptionRow(
  row: AnnotationCardNode,
  palette: AnnotationPalette
) {
  const texts = row.children.filter(
    (child): child is TextNode => child.type === "TEXT"
  )
  if (texts[0]) {
    texts[0].fills = [solid(palette.mutedText)]
  }
  if (texts[1]) {
    texts[1].fills = [solid(palette.bodyText)]
  }
}

function styleBoxModelGraphic(
  graphic: AnnotationCardNode,
  palette: AnnotationPalette
) {
  for (const child of graphic.children) {
    if (child.type === "TEXT") {
      child.fills = [solid(palette.boxModelText)]
      continue
    }

    if (child.type !== "FRAME") {
      continue
    }

    if (child.name === "Border box") {
      child.strokes = [solid(palette.boxModelBorder)]
      for (const borderChild of child.children) {
        if (borderChild.type === "FRAME" && borderChild.name === "Content") {
          borderChild.fills = [solid(palette.boxModelFill)]
          borderChild.strokes = [solid(palette.boxModelBorder)]
          for (const contentChild of borderChild.children) {
            if (contentChild.type === "TEXT") {
              contentChild.fills = [solid(palette.boxModelText)]
            }
          }
        }
      }
    }
  }
}

async function createBadge(
  number: number,
  markAsExternal: boolean,
  palette: AnnotationPalette
) {
  const badge = createAutoFrame(`Eannotation / Badge ${number}`, "HORIZONTAL")
  badge.minWidth = BADGE_SIZE
  badge.resize(BADGE_SIZE, BADGE_SIZE)
  badge.primaryAxisSizingMode = "AUTO"
  badge.counterAxisSizingMode = "FIXED"
  badge.primaryAxisAlignItems = "CENTER"
  badge.counterAxisAlignItems = "CENTER"
  badge.paddingTop = 2
  badge.paddingRight = 8
  badge.paddingBottom = 2
  badge.paddingLeft = 8
  badge.cornerRadius = BADGE_RADIUS
  badge.fills = [solid(palette.badgeFill)]
  badge.strokes = [solid(palette.badgeText, 0.2)]
  badge.strokeWeight = 1
  badge.effects = [
    {
      type: "DROP_SHADOW",
      color: rgbaFromHex(palette.badgeFill, 0.28),
      offset: { x: 0, y: 2 },
      radius: 4,
      spread: 0,
      visible: true,
      blendMode: "NORMAL",
    },
  ]
  badge.appendChild(
    await createText(String(number), {
      font: "medium",
      fontSize: 14,
      lineHeight: 22,
      color: palette.badgeText,
    })
  )

  if (!markAsExternal) {
    badge.name = `Eannotation / Badge label ${number}`
  }

  return badge
}

async function createPropertySection(
  properties: PropertyOption[],
  sourceNode: SceneNode,
  width: number,
  palette: AnnotationPalette
) {
  const section = createAutoFrame("Section", "VERTICAL", width)
  section.itemSpacing = 12
  section.fills = []

  for (const property of properties) {
    if (section.children.length > 0) {
      section.appendChild(createDivider(width, palette))
    }

    if (property.id === "boxModel") {
      section.appendChild(
        await createBoxModelModule(property, sourceNode, width, palette)
      )
      continue
    }
    if (property.value.indexOf("；") >= 0) {
      section.appendChild(await createDescriptionList(property, width, palette))
      continue
    }
    section.appendChild(await createDescriptionRow(property, width, palette))
  }

  return section
}

async function createBoxModelModule(
  property: PropertyOption,
  sourceNode: SceneNode,
  width: number,
  palette: AnnotationPalette
) {
  const moduleFrame = createAutoFrame(
    `Property / ${property.label}`,
    "VERTICAL",
    width
  )
  moduleFrame.itemSpacing = 12
  moduleFrame.fills = []
  moduleFrame.appendChild(
    await createBoxModelGraphic(sourceNode, width, palette)
  )
  moduleFrame.appendChild(await createBoxModelList(property, width, palette))
  return moduleFrame
}

async function createBoxModelList(
  property: PropertyOption,
  width: number,
  palette: AnnotationPalette
) {
  const list = createAutoFrame("Box model list", "VERTICAL", width)
  list.itemSpacing = 8
  list.fills = []

  for (const row of descriptionRowsFromValue(property.value, "自动布局")) {
    list.appendChild(
      await createDescriptionRow(
        {
          id: "boxModel",
          kind: "box",
          label: row.label,
          value: row.value,
        },
        width,
        palette
      )
    )
  }

  return list
}

async function createDescriptionList(
  property: PropertyOption,
  width: number,
  palette: AnnotationPalette
) {
  const list = createAutoFrame(
    `Description list / ${property.label}`,
    "VERTICAL",
    width
  )
  list.itemSpacing = 8
  list.fills = []

  for (const row of descriptionRowsFromValue(property.value, property.label)) {
    list.appendChild(
      await createDescriptionRow(
        {
          id: property.id,
          kind: property.kind,
          label: row.label,
          value: row.value,
        },
        width,
        palette
      )
    )
  }

  return list
}

function descriptionRowsFromValue(value: string, fallbackLabel: string) {
  return value
    .split("；")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      if (part === "无自动布局") {
        return {
          label: "自动布局",
          value: "无",
        }
      }

      const firstSpace = part.indexOf(" ")
      if (firstSpace > 0) {
        return {
          label: part.slice(0, firstSpace),
          value: part.slice(firstSpace + 1).trim(),
        }
      }

      return {
        label: fallbackLabel,
        value: part,
      }
    })
}

async function createDescriptionRow(
  property: PropertyOption,
  width: number,
  palette: AnnotationPalette
) {
  const row = createAutoFrame(
    `Description / ${property.label}`,
    "HORIZONTAL",
    width
  )
  row.itemSpacing = 12
  row.fills = []

  const label = await createText(property.label, {
    width: 100,
    font: "regular",
    fontSize: 14,
    lineHeight: 22,
    color: palette.mutedText,
  })
  label.name = "Description label"
  const value = await createText(property.value, {
    width: Math.max(120, width - 112),
    font: "regular",
    fontSize: 14,
    lineHeight: 22,
    color: palette.bodyText,
  })
  value.name = "Description value"

  row.appendChild(label)
  row.appendChild(value)
  value.layoutSizingHorizontal = "FILL"

  return row
}

async function createBoxModelGraphic(
  node: SceneNode,
  width: number,
  palette: AnnotationPalette
) {
  const graphic = figma.createFrame()
  graphic.name = "Box model"
  graphic.resize(width, 170)
  graphic.fills = []
  graphic.clipsContent = false

  const outer = figma.createFrame()
  outer.name = "Border box"
  outer.resize(Math.max(160, width - 96), 118)
  outer.x = 48
  outer.y = 26
  outer.cornerRadius = 8
  outer.fills = []
  outer.strokes = [solid(palette.boxModelBorder)]
  outer.strokeWeight = 1
  outer.clipsContent = false
  graphic.appendChild(outer)

  const content = figma.createFrame()
  content.name = "Content"
  content.resize(Math.max(76, width - 210), 54)
  content.x = (outer.width - content.width) / 2
  content.y = (outer.height - content.height) / 2
  content.fills = [solid(palette.boxModelFill)]
  content.strokes = [solid(palette.boxModelBorder)]
  content.dashPattern = [2, 2]
  content.clipsContent = false
  outer.appendChild(content)

  const contentLabel = await createText(
    `${Math.round(node.width)} x ${Math.round(node.height)}`,
    {
      width: content.width,
      font: "regular",
      fontSize: 14,
      lineHeight: 22,
      color: palette.boxModelText,
    }
  )
  contentLabel.name = "Box model content label"
  contentLabel.textAlignHorizontal = "CENTER"
  contentLabel.x = 0
  contentLabel.y = (content.height - contentLabel.height) / 2
  content.appendChild(contentLabel)

  const labels = [
    {
      text: formatMaybeNumber(node, "paddingTop", "12"),
      x: width / 2 - 16,
      y: 0,
    },
    {
      text: formatMaybeNumber(node, "paddingRight", "12"),
      x: width - 40,
      y: 74,
    },
    {
      text: formatMaybeNumber(node, "paddingBottom", "12"),
      x: width / 2 - 16,
      y: 146,
    },
    { text: formatMaybeNumber(node, "paddingLeft", "12"), x: 8, y: 74 },
  ]

  for (const label of labels) {
    const labelNode = await createText(label.text, {
      width: 32,
      font: "regular",
      fontSize: 14,
      lineHeight: 22,
      color: palette.boxModelText,
    })
    labelNode.name = "Box model padding label"
    labelNode.textAlignHorizontal = "CENTER"
    labelNode.x = label.x
    labelNode.y = label.y
    graphic.appendChild(labelNode)
  }

  return graphic
}

function createImageNode(image: UiImagePayload, width: number) {
  const node = figma.createRectangle()
  node.name = `Image / ${image.name || "Pasted image"}`
  node.resize(width, imageHeightForWidth(image.width, image.height, width))
  node.cornerRadius = IMAGE_RADIUS
  node.fills = [
    {
      type: "IMAGE",
      imageHash: figma.createImage(image.bytes).hash,
      scaleMode: "FILL",
    },
  ]
  return node
}

function createImageGroup(images: UiImagePayload[], width: number) {
  const group = createAutoFrame("Images", "VERTICAL", width)
  group.itemSpacing = 8
  group.fills = []

  for (const image of images) {
    group.appendChild(createImageNode(image, width))
  }

  return group
}

function createDesignReferenceGroup(width: number) {
  const group = createAutoFrame("Design references", "VERTICAL", width)
  group.itemSpacing = 24
  group.fills = []

  return group
}

function moveDesignReferencesToGroup(
  group: AnnotationCardNode | null,
  references: DesignReferenceNode[]
) {
  if (!group && references.length > 0) {
    throw new Error("无法创建关联设计稿容器")
  }

  for (const reference of references) {
    const originalWidth = reference.width
    const originalHeight = reference.height
    group?.appendChild(reference)
    if (reference.parent !== group) {
      throw new Error(`无法移动设计稿「${reference.name}」`)
    }
    reference.layoutSizingHorizontal = "FIXED"
    reference.layoutSizingVertical = "FIXED"
    reference.resize(originalWidth, originalHeight)
  }
}

function createDivider(width: number, palette: AnnotationPalette) {
  const divider = figma.createFrame()
  divider.name = "Divider"
  divider.resize(width, 1)
  divider.fills = [solid(palette.divider)]
  divider.clipsContent = false
  return divider
}

async function createText(
  characters: string,
  options: {
    font: "regular" | "medium"
    fontSize: number
    lineHeight: number
    color: string
    width?: number
  }
) {
  const fonts = await getCanvasFonts()
  const node = figma.createText()
  const font = options.font === "medium" ? fonts.medium : fonts.regular
  await figma.loadFontAsync(font)
  node.fontName = font
  node.fontSize = options.fontSize
  node.lineHeight = { unit: "PIXELS", value: options.lineHeight }
  node.fills = [solid(options.color)]
  node.characters = characters
  node.textAutoResize = options.width ? "HEIGHT" : "WIDTH_AND_HEIGHT"
  if (options.width) {
    node.resize(options.width, Math.max(node.height, options.lineHeight))
  }
  return node
}

function createAutoFrame(
  name: string,
  direction: "HORIZONTAL" | "VERTICAL",
  width?: number
) {
  const frame = figma.createFrame()
  frame.name = name
  frame.layoutMode = direction
  frame.fills = []
  frame.primaryAxisAlignItems = "MIN"
  frame.counterAxisAlignItems = "MIN"
  frame.clipsContent = false

  if (width) {
    frame.resize(width, 1)
    if (direction === "VERTICAL") {
      frame.primaryAxisSizingMode = "AUTO"
      frame.counterAxisSizingMode = "FIXED"
    } else {
      frame.primaryAxisSizingMode = "FIXED"
      frame.counterAxisSizingMode = "AUTO"
    }
  }

  return frame
}

function setRelaunchData(node: SceneNode, data: Record<string, string>) {
  const maybeRelaunchNode = node as SceneNode & {
    setRelaunchData?: (data: Record<string, string>) => void
  }

  if (typeof maybeRelaunchNode.setRelaunchData === "function") {
    maybeRelaunchNode.setRelaunchData(data)
  }
}

async function getCanvasFonts() {
  if (!fontCache) {
    fontCache = (async () => {
      const fonts = await figma.listAvailableFontsAsync()
      const regular =
        findFont(fonts, "PingFang SC", "Regular") ||
        findFont(fonts, "Inter", "Regular") ||
        fonts[0]?.fontName ||
        ({ family: "Inter", style: "Regular" } satisfies FontName)
      const medium =
        findFont(fonts, "PingFang SC", "Medium") ||
        findFont(fonts, "Inter", "Medium") ||
        regular
      await Promise.all([
        figma.loadFontAsync(regular),
        figma.loadFontAsync(medium),
      ])
      return { regular, medium }
    })()
  }

  return fontCache
}

function findFont(fonts: Font[], family: string, style: string) {
  return fonts.find(
    (font) => font.fontName.family === family && font.fontName.style === style
  )?.fontName
}

function solid(hex: string, opacity = 1): SolidPaint {
  return {
    type: "SOLID",
    color: hexToRgb(hex),
    opacity,
  }
}

function rgbaFromHex(hex: string, opacity: number) {
  return {
    ...hexToRgb(hex),
    a: opacity,
  }
}

function hexToRgb(hex: string): RGB {
  const value = hex.replace("#", "")
  return {
    r: Number.parseInt(value.slice(0, 2), 16) / 255,
    g: Number.parseInt(value.slice(2, 4), 16) / 255,
    b: Number.parseInt(value.slice(4, 6), 16) / 255,
  }
}

function setAbsolutePosition(
  node: SceneNode,
  parent: AnnotationParent,
  absoluteX: number,
  absoluteY: number
) {
  const origin = getParentOrigin(parent)
  node.x = absoluteX - origin.x
  node.y = absoluteY - origin.y
}

function getParentOrigin(parent: AnnotationParent) {
  if (parent.type === "PAGE") {
    return { x: 0, y: 0 }
  }

  const box = parent.absoluteBoundingBox
  return {
    x: box?.x ?? parent.x,
    y: box?.y ?? parent.y,
  }
}

function avoidCardCollision(
  parent: AnnotationParent,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const existingCards = parent.children
    .filter((child) => getAnnoData(child)?.type === "card")
    .map(requiredBox)
  let nextY = y
  let guard = 0

  while (
    existingCards.some(
      (box) =>
        x < box.x + box.width &&
        x + width > box.x &&
        nextY < box.y + box.height &&
        nextY + height > box.y
    ) &&
    guard < 20
  ) {
    nextY += height + ANNOTATION_GAP
    guard += 1
  }

  return { x, y: nextY }
}

function requiredBox(node: SceneNode): Rect {
  const box = node.absoluteBoundingBox
  if (!box) {
    throw new Error(`无法读取 ${node.name} 的画布位置`)
  }

  return box
}

function formatMaybeNumber(node: SceneNode, field: string, fallback: string) {
  const value = getRawNumber(node, field)
  return value === null ? fallback : String(Math.round(value))
}

function getRawNumber(node: SceneNode, field: string) {
  if (!(field in node)) {
    return null
  }

  const value = (node as unknown as Record<string, unknown>)[field]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function setAnnoData(node: SceneNode, data: AnnoPluginData) {
  const normalizedData: AnnoPluginData = {
    ...data,
    tagId: normalizeAnnotationTagId(data.tagId),
    warningLevel: normalizeWarningLevel(data.warningLevel),
  }
  node.setPluginData(PLUGIN_DATA_KEY, JSON.stringify(normalizedData))
  annotationDataByNodeId.set(node.id, normalizedData)
}

function getAnnoData(node: BaseNode): AnnoPluginData | null {
  const raw = node.getPluginData(PLUGIN_DATA_KEY)
  if (!raw) {
    return null
  }

  try {
    const value = JSON.parse(raw) as Partial<AnnoPluginData>
    if (value.type === "badge" || value.type === "card") {
      return {
        ...value,
        type: value.type,
        tagId: normalizeAnnotationTagId(value.tagId),
        warningLevel: normalizeWarningLevel(value.warningLevel),
      }
    }
  } catch {
    return null
  }

  return null
}
