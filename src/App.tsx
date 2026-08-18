import {
  AlertCircle,
  AlertTriangle,
  BadgePlus,
  CheckCircle2,
  ClipboardPaste,
  Check,
  ChevronLeft,
  ImagePlus,
  Loader2,
  PanelsTopLeft,
  Search,
  Tag,
  X,
} from "lucide-react"
import * as React from "react"

import logoUrl from "@/assets/logo.png"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  extractFigmaNodeId,
  findFingerprintMatch,
  type ImageFingerprint,
} from "@/shared/design-reference-match"
import {
  TAG_DEFINITIONS,
  WARNING_LEVELS,
  getAnnotationPalette,
  getTagPalette,
  normalizeAnnotationTagId,
  normalizeWarningLevel,
  type AnnotationPalette,
  type AnnotationTagId,
  type PropertyOptionId,
  type WarningLevel,
} from "@/shared/annotation-model"
import type {
  DesignReferenceOption,
  MainToUiMessage,
  PropertyOption,
  SelectionContextMessage,
  UiImagePayload,
  UiToMainMessage,
} from "@/shared/messages"

type ImageDraft = UiImagePayload & {
  previewUrl: string
}

type DesignReferenceDraft = DesignReferenceOption & {
  previewUrl: string
}

type PendingDesignPaste = {
  nodeId: string | null
  imageFile: File | null
}

type ReferenceFeedback = {
  type: "loading" | "success" | "error"
  message: string
}

const EMPTY_CONTEXT: SelectionContextMessage = {
  type: "selection-context",
  status: "empty",
}

function App() {
  const [context, setContext] =
    React.useState<SelectionContextMessage>(EMPTY_CONTEXT)
  const [text, setText] = React.useState("")
  const [images, setImages] = React.useState<ImageDraft[]>([])
  const [designReferences, setDesignReferences] = React.useState<
    DesignReferenceDraft[]
  >([])
  const [selectedDesignReferenceIds, setSelectedDesignReferenceIds] =
    React.useState<Set<string>>(new Set())
  const [isDesignPickerOpen, setIsDesignPickerOpen] = React.useState(false)
  const [isLoadingDesignReferences, setIsLoadingDesignReferences] =
    React.useState(false)
  const [referenceFeedback, setReferenceFeedback] =
    React.useState<ReferenceFeedback | null>(null)
  const [selectedProperties, setSelectedProperties] = React.useState<
    Set<PropertyOptionId>
  >(new Set())
  const [tagId, setTagId] = React.useState<AnnotationTagId>("none")
  const [warningLevel, setWarningLevel] = React.useState<WarningLevel>(0)
  const [feedback, setFeedback] = React.useState<{
    type: "success" | "error"
    message: string
  } | null>(null)
  const [isCreating, setIsCreating] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const designPasteTargetRef = React.useRef<HTMLDivElement | null>(null)
  const pendingDesignPasteRef = React.useRef<PendingDesignPaste | null>(null)

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data.pluginMessage as MainToUiMessage | undefined
      if (!message) {
        return
      }

      if (message.type === "selection-context") {
        setContext(message)
        if (message.status === "ready") {
          setTagId(normalizeAnnotationTagId(message.existingTagId))
          setWarningLevel(normalizeWarningLevel(message.existingWarningLevel))
        } else {
          setTagId("none")
          setWarningLevel(0)
        }
        setSelectedProperties(new Set())
        setSelectedDesignReferenceIds(new Set())
        setDesignReferences((current) => {
          current.forEach((reference) =>
            URL.revokeObjectURL(reference.previewUrl)
          )
          return []
        })
        setIsDesignPickerOpen(false)
        setIsLoadingDesignReferences(false)
        setReferenceFeedback(null)
        pendingDesignPasteRef.current = null
        setFeedback(null)
        return
      }

      if (message.type === "design-reference-options") {
        if (
          context.status !== "ready" ||
          message.selectionToken !== context.selectionToken
        ) {
          return
        }
        const nextReferences = message.options.map((option) => ({
          ...option,
          previewUrl: URL.createObjectURL(
            new Blob([new Uint8Array(option.thumbnailBytes)], {
              type: "image/png",
            })
          ),
        }))
        setDesignReferences((current) => {
          const nextIds = new Set(
            nextReferences.map((reference) => reference.nodeId)
          )
          current
            .filter((reference) => nextIds.has(reference.nodeId))
            .forEach((reference) => URL.revokeObjectURL(reference.previewUrl))
          return [
            ...nextReferences,
            ...current.filter((reference) => !nextIds.has(reference.nodeId)),
          ]
        })
        setIsLoadingDesignReferences(false)
        const pendingPaste = pendingDesignPasteRef.current
        if (pendingPaste) {
          pendingDesignPasteRef.current = null
          void resolveDesignPaste(pendingPaste, nextReferences)
            .then(async (matchedReference) => {
              if (matchedReference) {
                setSelectedDesignReferenceIds((current) =>
                  new Set(current).add(matchedReference.nodeId)
                )
                setReferenceFeedback({
                  type: "success",
                  message: `已识别设计稿：${matchedReference.name}`,
                })
                return
              }

              if (pendingPaste.imageFile) {
                setReferenceFeedback({
                  type: "error",
                  message:
                    "无法定位原设计稿，请复制 Figma 节点链接后再粘贴，或使用右上角选择设计稿",
                })
                return
              }

              setReferenceFeedback({
                type: "error",
                message: "未识别剪贴板中的设计稿",
              })
            })
            .catch((error: unknown) => {
              setReferenceFeedback({
                type: "error",
                message:
                  error instanceof Error ? error.message : "剪贴板内容识别失败",
              })
            })
        }
        return
      }

      if (message.type === "design-reference-resolved") {
        if (
          context.status !== "ready" ||
          message.selectionToken !== context.selectionToken
        ) {
          return
        }
        const nextReference = {
          ...message.option,
          previewUrl: URL.createObjectURL(
            new Blob([new Uint8Array(message.option.thumbnailBytes)], {
              type: "image/png",
            })
          ),
        }
        setDesignReferences((current) => {
          const existing = current.find(
            (reference) => reference.nodeId === nextReference.nodeId
          )
          if (existing) {
            URL.revokeObjectURL(nextReference.previewUrl)
            return current
          }
          return [...current, nextReference]
        })
        setSelectedDesignReferenceIds((current) =>
          new Set(current).add(nextReference.nodeId)
        )
        pendingDesignPasteRef.current = null
        setReferenceFeedback({
          type: "success",
          message: `已识别设计稿：${nextReference.name}`,
        })
        return
      }

      if (message.type === "create-result") {
        setIsCreating(false)
        setText("")
        setImages((current) => {
          current.forEach((image) => URL.revokeObjectURL(image.previewUrl))
          return []
        })
        setSelectedProperties(new Set())
        setSelectedDesignReferenceIds(new Set())
        setTagId("none")
        setWarningLevel(0)
        setFeedback({
          type: "success",
          message:
            message.badgeNumber === null
              ? message.updated
                ? "已追加到全局标注"
                : "已创建全局标注"
              : message.updated
                ? `已追加到局部标注 #${message.badgeNumber}`
                : `已创建局部标注 #${message.badgeNumber}`,
        })
        return
      }

      if (message.type === "error") {
        setIsCreating(false)
        setIsLoadingDesignReferences(false)
        if (pendingDesignPasteRef.current) {
          pendingDesignPasteRef.current = null
          setReferenceFeedback({ type: "error", message: message.message })
        }
        setFeedback({ type: "error", message: message.message })
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [context])

  React.useEffect(() => {
    return () => {
      images.forEach((image) => URL.revokeObjectURL(image.previewUrl))
    }
  }, [images])

  const ready = context.status === "ready"
  const selectedPropertyIds = React.useMemo(
    () => Array.from(selectedProperties),
    [selectedProperties]
  )
  const hasContent =
    text.trim().length > 0 ||
    images.length > 0 ||
    selectedDesignReferenceIds.size > 0 ||
    tagId !== "none" ||
    selectedPropertyIds.length > 0
  const annotationPalette = React.useMemo(
    () => getAnnotationPalette({ tagId, warningLevel }),
    [tagId, warningLevel]
  )

  const handleFiles = React.useCallback(async (files: FileList | File[]) => {
    const nextImages = await Promise.all(
      Array.from(files)
        .filter((file) => file.type.startsWith("image/"))
        .map(readImageFile)
    )
    setImages((current) => [...current, ...nextImages])
  }, [])

  const handlePaste = React.useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const imageFiles = Array.from(event.clipboardData.items)
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null)

      if (imageFiles.length > 0) {
        event.preventDefault()
        void handleFiles(imageFiles)
      }
    },
    [handleFiles]
  )

  const removeImage = React.useCallback((id: string) => {
    setImages((current) => {
      const target = current.find((image) => image.id === id)
      if (target) {
        URL.revokeObjectURL(target.previewUrl)
      }
      return current.filter((image) => image.id !== id)
    })
  }, [])

  const openDesignPicker = React.useCallback(() => {
    if (!ready) {
      return
    }
    setIsDesignPickerOpen(true)
    setIsLoadingDesignReferences(true)
    setFeedback(null)
    postToPlugin({
      type: "request-design-references",
      selectionToken: context.selectionToken,
    })
  }, [context, ready])

  const handleDesignPaste = React.useCallback(
    (event: React.ClipboardEvent<HTMLElement>) => {
      if (!ready) {
        return
      }

      const text = event.clipboardData.getData("text/plain")
      const nodeId = extractFigmaNodeId(text)
      const imageFile =
        Array.from(event.clipboardData.items)
          .find((item) => item.type.startsWith("image/"))
          ?.getAsFile() || null

      if (!nodeId && !imageFile) {
        return
      }

      event.preventDefault()
      pendingDesignPasteRef.current = { nodeId, imageFile }
      setReferenceFeedback({
        type: "loading",
        message: "正在识别剪贴板中的设计稿…",
      })
      if (nodeId) {
        postToPlugin({
          type: "resolve-design-reference",
          selectionToken: context.selectionToken,
          nodeId,
        })
      } else {
        postToPlugin({
          type: "request-design-references",
          selectionToken: context.selectionToken,
        })
      }
    },
    [context, ready]
  )

  const toggleDesignReference = React.useCallback((nodeId: string) => {
    setSelectedDesignReferenceIds((current) => {
      const next = new Set(current)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  const toggleProperty = React.useCallback((id: PropertyOptionId) => {
    setSelectedProperties((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const submit = React.useCallback(() => {
    if (!ready || !hasContent) {
      return
    }

    setIsCreating(true)
    setFeedback(null)
    postToPlugin({
      type: "create-annotation",
      selectionToken: context.selectionToken,
      text,
      images: images.map(toImagePayload),
      designReferenceIds: Array.from(selectedDesignReferenceIds),
      selectedPropertyIds,
      tagId,
      warningLevel,
    })
  }, [
    context,
    hasContent,
    images,
    ready,
    selectedPropertyIds,
    selectedDesignReferenceIds,
    tagId,
    text,
    warningLevel,
  ])

  if (!ready) {
    return <EmptyState status={context.status} />
  }

  if (isDesignPickerOpen) {
    return (
      <DesignReferencePicker
        references={designReferences}
        selectedIds={selectedDesignReferenceIds}
        isLoading={isLoadingDesignReferences}
        errorMessage={feedback?.type === "error" ? feedback.message : null}
        onToggle={toggleDesignReference}
        onClose={() => setIsDesignPickerOpen(false)}
      />
    )
  }

  return (
    <main className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={logoUrl}
              alt="Esd-Eannotation"
              className="size-8 shrink-0 rounded-lg"
              draggable={false}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{context.nodeName}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {context.mode === "local" ? "局部标注" : "全局标注"} ·{" "}
                {context.nodeSize}
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground">
            {context.mode === "local" && context.nextBadgeNumber
              ? `#${context.nextBadgeNumber}`
              : context.nodeType}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        {feedback ? <Feedback feedback={feedback} /> : null}

        <AnnotationSettings
          tagId={tagId}
          warningLevel={warningLevel}
          palette={annotationPalette}
          onTagChange={setTagId}
          onWarningLevelChange={setWarningLevel}
        />

        <section className="flex flex-col gap-2" onPaste={handleDesignPaste}>
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              关联设计稿
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openDesignPicker}
            >
              <PanelsTopLeft />
              选择设计稿
            </Button>
          </div>
          <div
            ref={designPasteTargetRef}
            role="textbox"
            aria-label="粘贴 Figma 设计稿"
            aria-readonly="true"
            tabIndex={0}
            className="flex min-h-16 cursor-text items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 text-left text-xs text-muted-foreground transition outline-none hover:border-ring hover:text-foreground focus:border-ring focus:ring-3 focus:ring-ring/20"
            onClick={() => designPasteTargetRef.current?.focus()}
          >
            <ClipboardPaste className="size-4 shrink-0" />
            <span>
              <span className="block font-medium text-foreground">
                粘贴 Figma 设计稿
              </span>
              <span className="mt-0.5 block">
                点击这里后按 ⌘V；原稿将移入标注
              </span>
            </span>
          </div>
          {referenceFeedback ? (
            <ReferenceFeedbackNotice feedback={referenceFeedback} />
          ) : null}
          {selectedDesignReferenceIds.size > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {designReferences
                .filter((reference) =>
                  selectedDesignReferenceIds.has(reference.nodeId)
                )
                .map((reference) => (
                  <div
                    key={reference.nodeId}
                    className="relative overflow-hidden rounded-lg border border-border bg-muted"
                  >
                    <img
                      src={reference.previewUrl}
                      alt={reference.name}
                      className="aspect-[4/3] w-full object-contain"
                    />
                    <p className="truncate border-t border-border bg-card px-2 py-1.5 text-xs">
                      {reference.name}
                    </p>
                    <button
                      type="button"
                      aria-label={`移除设计稿 ${reference.name}`}
                      className="absolute top-1 right-1 inline-flex size-6 items-center justify-center rounded-md bg-background/90 text-foreground shadow-sm"
                      onClick={() => toggleDesignReference(reference.nodeId)}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            图文标注
          </label>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="min-h-32 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 transition outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
            placeholder="输入交付说明、状态规则或开发注意事项"
          />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              图片
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus />
              上传
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files) {
                void handleFiles(event.target.files)
                event.target.value = ""
              }
            }}
          />
          <div
            tabIndex={0}
            onPaste={handlePaste}
            className="flex min-h-20 items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 px-3 py-4 text-center text-xs text-muted-foreground outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
          >
            <div className="flex items-center gap-2">
              <ClipboardPaste className="size-4" />
              <span>粘贴剪切板图片</span>
            </div>
          </div>
          {images.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {images.map((image) => (
                <div
                  key={image.id}
                  className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted"
                >
                  <img
                    src={image.previewUrl}
                    alt={image.name}
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label="移除图片"
                    className="absolute top-1 right-1 inline-flex size-6 items-center justify-center rounded-md bg-background/90 text-foreground opacity-0 shadow-sm transition group-hover:opacity-100"
                    onClick={() => removeImage(image.id)}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            属性标注
          </label>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {context.properties.map((property) => (
              <PropertyToggle
                key={property.id}
                property={property}
                checked={selectedProperties.has(property.id)}
                onToggle={() => toggleProperty(property.id)}
              />
            ))}
          </div>
        </section>
      </div>

      <footer className="border-t border-border p-4">
        <Button
          type="button"
          className="w-full"
          disabled={!hasContent || isCreating}
          onClick={submit}
        >
          {isCreating ? <Loader2 className="animate-spin" /> : <BadgePlus />}
          创建标注
        </Button>
      </footer>
    </main>
  )
}

function ReferenceFeedbackNotice({
  feedback,
}: {
  feedback: ReferenceFeedback
}) {
  const Icon =
    feedback.type === "loading"
      ? Loader2
      : feedback.type === "success"
        ? CheckCircle2
        : AlertCircle
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
        feedback.type === "success"
          ? "border-primary/20 bg-primary/5 text-primary"
          : feedback.type === "error"
            ? "border-destructive/20 bg-destructive/5 text-destructive"
            : "border-border bg-muted/50 text-muted-foreground"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          feedback.type === "loading" && "animate-spin"
        )}
      />
      <span>{feedback.message}</span>
    </div>
  )
}

function DesignReferencePicker({
  references,
  selectedIds,
  isLoading,
  errorMessage,
  onToggle,
  onClose,
}: {
  references: DesignReferenceDraft[]
  selectedIds: Set<string>
  isLoading: boolean
  errorMessage: string | null
  onToggle: (nodeId: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = React.useState("")
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredReferences = references.filter((reference) =>
    `${reference.name} ${reference.scopeName}`
      .toLocaleLowerCase()
      .includes(normalizedQuery)
  )

  return (
    <main className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-b border-border px-3 py-3">
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose}>
          <ChevronLeft />
          <span className="sr-only">返回标注编辑</span>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">选择设计稿</p>
          <p className="text-xs text-muted-foreground">
            已选 {selectedIds.size} 个，可多选
          </p>
        </div>
        <Button type="button" size="sm" onClick={onClose}>
          完成
        </Button>
      </header>

      <div className="border-b border-border p-3">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="搜索设计稿名称"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {isLoading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span>正在读取当前页设计稿…</span>
          </div>
        ) : errorMessage ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <p className="text-sm font-medium">设计稿读取失败</p>
            <p className="text-xs leading-5 text-muted-foreground">
              {errorMessage}
            </p>
          </div>
        ) : filteredReferences.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {filteredReferences.map((reference) => {
              const selected = selectedIds.has(reference.nodeId)
              return (
                <button
                  key={reference.nodeId}
                  type="button"
                  aria-pressed={selected}
                  className={cn(
                    "overflow-hidden rounded-lg border bg-card text-left transition focus-visible:ring-3 focus-visible:ring-ring/30",
                    selected
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-border hover:border-ring"
                  )}
                  onClick={() => onToggle(reference.nodeId)}
                >
                  <div className="relative aspect-[4/3] bg-muted">
                    <img
                      src={reference.previewUrl}
                      alt=""
                      className="size-full object-contain"
                    />
                    {selected ? (
                      <span className="absolute top-2 right-2 inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                        <Check className="size-4" />
                      </span>
                    ) : null}
                  </div>
                  <div className="border-t border-border px-2.5 py-2">
                    <p className="truncate text-xs font-medium">
                      {reference.name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {reference.scopeName} · {reference.nodeSize}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
            <PanelsTopLeft className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {query ? "没有匹配的设计稿" : "没有其他可选设计稿"}
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              {query
                ? "换个名称搜索试试。"
                : "请在当前页或当前 Section 中创建其他顶层 Frame、Component 或 Instance。"}
            </p>
          </div>
        )}
      </div>
    </main>
  )
}

function AnnotationSettings({
  tagId,
  warningLevel,
  palette,
  onTagChange,
  onWarningLevelChange,
}: {
  tagId: AnnotationTagId
  warningLevel: WarningLevel
  palette: AnnotationPalette
  onTagChange: (tagId: AnnotationTagId) => void
  onWarningLevelChange: (warningLevel: WarningLevel) => void
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Tag className="size-3.5" />
          <span>Tag</span>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {TAG_DEFINITIONS.map((definition) => {
            const optionPalette = getTagPalette(definition.id)
            const selected = definition.id === tagId
            return (
              <button
                key={definition.id}
                type="button"
                className={cn(
                  "flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border px-1.5 text-xs font-medium transition",
                  selected
                    ? "shadow-sm"
                    : "border-border bg-card text-foreground hover:bg-muted"
                )}
                style={
                  selected
                    ? {
                        backgroundColor: optionPalette.cardFill,
                        borderColor: optionPalette.border,
                        color: optionPalette.bodyText,
                      }
                    : undefined
                }
                onClick={() => onTagChange(definition.id)}
              >
                {definition.id !== "none" ? (
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: optionPalette.badgeFill }}
                  />
                ) : null}
                <span className="truncate">{definition.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <AlertTriangle className="size-3.5" />
            <span>警告等级</span>
          </div>
          <span
            className="rounded-md border px-2 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: palette.badgeFill,
              borderColor: palette.border,
              color: palette.badgeText,
            }}
          >
            {warningLevel === 0 ? "普通" : `警告 ${warningLevel}`}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={5}
          step={1}
          value={warningLevel}
          className="h-5 w-full"
          style={{ accentColor: palette.badgeFill }}
          onChange={(event) =>
            onWarningLevelChange(normalizeWarningLevel(event.target.value))
          }
        />
        <div className="grid grid-cols-6 text-center text-[11px] leading-4 text-muted-foreground">
          {WARNING_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={cn(
                "rounded-sm transition hover:text-foreground",
                level === warningLevel && "font-medium text-foreground"
              )}
              onClick={() => onWarningLevelChange(level)}
            >
              {level}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function EmptyState({ status }: { status: "empty" | "multi" }) {
  return (
    <main className="flex h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="flex max-w-64 flex-col items-center gap-3 text-center">
        <img
          src={logoUrl}
          alt="Esd-Eannotation"
          className="size-12 rounded-xl"
          draggable={false}
        />
        <div>
          <p className="text-sm font-medium">
            {status === "multi" ? "请只选择一个元素" : "请选择设计文件中的元素"}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Esd-Eannotation 会根据选择自动判断全局标注或局部标注。
          </p>
        </div>
      </div>
    </main>
  )
}

function Feedback({
  feedback,
}: {
  feedback: { type: "success" | "error"; message: string }
}) {
  const Icon = feedback.type === "success" ? CheckCircle2 : AlertCircle
  return (
    <div
      className={
        feedback.type === "success"
          ? "flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary"
          : "flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      }
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{feedback.message}</span>
    </div>
  )
}

function PropertyToggle({
  property,
  checked,
  onToggle,
}: {
  property: PropertyOption
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label
      className={
        checked
          ? "flex cursor-pointer items-center gap-3 border-b border-border bg-primary/5 px-3 py-2.5 last:border-b-0"
          : "flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0 hover:bg-muted/50"
      }
    >
      <input
        type="checkbox"
        checked={checked}
        className="size-4 shrink-0 accent-primary"
        onChange={onToggle}
      />
      <span className="min-w-0 flex-1 truncate text-sm leading-5 font-normal">
        {property.label}
      </span>
    </label>
  )
}

function postToPlugin(message: UiToMainMessage) {
  parent.postMessage({ pluginMessage: message }, "*")
}

async function readImageFile(file: File): Promise<ImageDraft> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const previewUrl = URL.createObjectURL(file)
  const { width, height } = await readImageDimensions(previewUrl)
  return {
    id: createId(),
    name: file.name || "Pasted image",
    mimeType: file.type || "image/png",
    width,
    height,
    bytes,
    previewUrl,
  }
}

async function resolveDesignPaste(
  paste: PendingDesignPaste,
  references: DesignReferenceDraft[]
) {
  if (paste.nodeId) {
    const linkedReference = references.find(
      (reference) => reference.nodeId === paste.nodeId
    )
    if (linkedReference) {
      return linkedReference
    }
  }

  if (!paste.imageFile) {
    return null
  }

  const pastedFingerprint = await createImageFingerprint(paste.imageFile)
  const candidates = await Promise.all(
    references.map(async (reference) => ({
      nodeId: reference.nodeId,
      fingerprint: await createImageFingerprint(
        new Blob([new Uint8Array(reference.thumbnailBytes)], {
          type: "image/png",
        }),
        reference.width,
        reference.height
      ),
    }))
  )
  const match = findFingerprintMatch(pastedFingerprint, candidates)
  return (
    references.find((reference) => reference.nodeId === match?.nodeId) || null
  )
}

async function createImageFingerprint(
  source: Blob,
  sourceWidth?: number,
  sourceHeight?: number
): Promise<ImageFingerprint> {
  const objectUrl = URL.createObjectURL(source)
  try {
    const image = await loadImage(objectUrl)
    const canvas = document.createElement("canvas")
    canvas.width = 16
    canvas.height = 16
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) {
      throw new Error("无法读取剪贴板图片")
    }

    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    const samples: number[] = []
    for (let index = 0; index < pixels.length; index += 4) {
      samples.push(pixels[index], pixels[index + 1], pixels[index + 2])
    }

    return {
      width: sourceWidth || image.naturalWidth || image.width,
      height: sourceHeight || image.naturalHeight || image.height,
      samples,
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("图片读取失败"))
    image.src = src
  })
}

function readImageDimensions(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      })
    }
    image.onerror = () => reject(new Error("图片读取失败"))
    image.src = src
  })
}

function toImagePayload(image: ImageDraft): UiImagePayload {
  return {
    id: image.id,
    name: image.name,
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    bytes: image.bytes,
  }
}

function createId() {
  return "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default App
