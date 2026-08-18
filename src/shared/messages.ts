import type {
  AnnotationMode,
  AnnotationTagId,
  PropertyOptionId,
  WarningLevel,
} from "./annotation-model"

export type SelectionStatus = "empty" | "multi" | "ready"

export type PropertyKind = "dimension" | "color" | "text" | "shape" | "box"

export type PropertyOption = {
  id: PropertyOptionId
  label: string
  value: string
  kind: PropertyKind
}

export type SelectionContextMessage =
  | {
      type: "selection-context"
      status: "empty" | "multi"
    }
  | {
      type: "selection-context"
      status: "ready"
      mode: AnnotationMode
      selectionToken: string
      nodeName: string
      nodeType: string
      nodeSize: string
      parentScope: string
      outerFrameName: string | null
      nextBadgeNumber: number | null
      existingTagId: AnnotationTagId
      existingWarningLevel: WarningLevel
      properties: PropertyOption[]
    }

export type UiImagePayload = {
  id: string
  name: string
  mimeType: string
  width: number
  height: number
  bytes: Uint8Array
}

export type DesignReferenceOption = {
  nodeId: string
  name: string
  nodeType: "FRAME" | "COMPONENT" | "INSTANCE"
  width: number
  height: number
  nodeSize: string
  scopeName: string
  thumbnailBytes: Uint8Array
}

export type DesignReferenceOptionsMessage = {
  type: "design-reference-options"
  selectionToken: string
  options: DesignReferenceOption[]
}

export type DesignReferenceResolvedMessage = {
  type: "design-reference-resolved"
  selectionToken: string
  option: DesignReferenceOption
}

export type RequestDesignReferencesMessage = {
  type: "request-design-references"
  selectionToken: string
}

export type ResolveDesignReferenceMessage = {
  type: "resolve-design-reference"
  selectionToken: string
  nodeId: string
}

export type CreateAnnotationMessage = {
  type: "create-annotation"
  selectionToken: string
  text: string
  images: UiImagePayload[]
  designReferenceIds: string[]
  selectedPropertyIds: PropertyOptionId[]
  tagId: AnnotationTagId
  warningLevel: WarningLevel
}

export type CreateResultMessage = {
  type: "create-result"
  badgeNodeId: string | null
  cardNodeId: string
  badgeNumber: number | null
  updated?: boolean
}

export type ErrorMessage = {
  type: "error"
  message: string
}

export type MainToUiMessage =
  | SelectionContextMessage
  | DesignReferenceOptionsMessage
  | DesignReferenceResolvedMessage
  | CreateResultMessage
  | ErrorMessage

export type UiToMainMessage =
  | CreateAnnotationMessage
  | RequestDesignReferencesMessage
  | ResolveDesignReferenceMessage
