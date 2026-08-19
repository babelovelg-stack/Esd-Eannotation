import { describe, expect, it } from "vitest"
import { argbFromHex, lstarFromArgb } from "@material/material-color-utilities"

import {
  TAG_DEFINITIONS,
  contentWidthForDesignReferences,
  formatCornerSummary,
  formatDimensionWithSizing,
  formatReferenceValue,
  getAnnotationPalette,
  getTagPalette,
  imageHeightForWidth,
  inferAnnotationModeFromAncestry,
  isWarningHue,
  localAnnotationCardName,
  nextBadgeNumber,
  normalizeAnnotationTagId,
  normalizeWarningLevel,
  resolveLocalAnnotationCardName,
} from "./annotation-model"

describe("annotation model", () => {
  it("infers local annotations only when an outer frame-like ancestor exists", () => {
    expect(inferAnnotationModeFromAncestry(["GROUP", "FRAME", "SECTION"])).toBe(
      "local"
    )
    expect(inferAnnotationModeFromAncestry(["SECTION", "PAGE"])).toBe("global")
  })

  it("names local annotation cards after their outer canvas", () => {
    expect(localAnnotationCardName("登录页")).toBe("Eannotation / 登录页")
    expect(localAnnotationCardName("Flow / Checkout")).toBe(
      "Eannotation / Flow / Checkout"
    )
    expect(
      resolveLocalAnnotationCardName(
        "Eannotation / Existing canvas",
        "Renamed canvas"
      )
    ).toBe("Eannotation / Renamed canvas")
    expect(
      resolveLocalAnnotationCardName("Eannotation / Existing canvas", null)
    ).toBe("Eannotation / Existing canvas")
  })

  it("uses variable names before styles and raw fallback values", () => {
    expect(
      formatReferenceValue({
        variables: ["color/text/default"],
        style: "Text / Body",
        fallback: "#333333",
      })
    ).toBe("color/text/default")

    expect(
      formatReferenceValue({
        variables: [],
        style: "Text / Body",
        fallback: "Inter 14px",
      })
    ).toBe("Text / Body")

    expect(formatReferenceValue({ fallback: "#333333 · 80%" })).toBe(
      "#333333 · 80%"
    )
  })

  it("formats dimensions with Figma sizing modes", () => {
    expect(formatDimensionWithSizing(96, "FILL")).toBe("96px · fill")
    expect(
      formatDimensionWithSizing(144, "HUG", {
        variables: ["size/control/height"],
      })
    ).toBe("size/control/height · hug")
  })

  it("keeps uploaded images proportional to the annotation content width", () => {
    expect(imageHeightForWidth(355, 240, 317)).toBe(214)
    expect(imageHeightForWidth(0, 0, 355)).toBe(355)
  })

  it("expands annotation content to the widest related design", () => {
    expect(contentWidthForDesignReferences(317, [720, 390, 1440])).toBe(1440)
    expect(contentWidthForDesignReferences(355, [240, 320])).toBe(355)
  })

  it("increments page badge numbers from the maximum existing badge", () => {
    expect(nextBadgeNumber([])).toBe(1)
    expect(nextBadgeNumber([1, 4, 2])).toBe(5)
  })

  it("keeps corner order as top-left, top-right, bottom-right, bottom-left", () => {
    expect(formatCornerSummary(["8px", "8px", "8px", "8px"])).toBe("8px")
    expect(formatCornerSummary(["4px", "8px", "12px", "16px"])).toBe(
      "左上 4px / 右上 8px / 右下 12px / 左下 16px"
    )
  })

  it("generates a non-white Material palette for regular annotations", () => {
    const palette = getAnnotationPalette({ warningLevel: 0, tagId: "none" })

    expect(palette.cardFill.toLowerCase()).not.toBe("#ffffff")
    expect(palette.bodyText.toLowerCase()).not.toBe("#333333")
    expect(lstarFromArgb(argbFromHex(palette.cardFill))).toBeGreaterThanOrEqual(
      95
    )
    expect(palette.warningLevel).toBe(0)
  })

  it("keeps tag seeds out of the warning red hue and gives each tag a distinct color", () => {
    const tagDefinitions = TAG_DEFINITIONS.filter(
      (definition) => definition.id !== "none"
    )
    const cardFills = new Set(
      tagDefinitions.map((definition) => {
        expect(isWarningHue(definition.seedHex)).toBe(false)
        const palette = getTagPalette(definition.id)
        expect(
          lstarFromArgb(argbFromHex(palette.cardFill))
        ).toBeGreaterThanOrEqual(95)
        return palette.cardFill
      })
    )

    expect(cardFills.size).toBe(tagDefinitions.length)
  })

  it("darkens warning backgrounds as the level increases and switches high levels to white text", () => {
    const warningPalettes = [1, 2, 3, 4, 5].map((warningLevel) =>
      getAnnotationPalette({ warningLevel, tagId: "interaction" })
    )
    const backgroundTones = warningPalettes.map((palette) =>
      lstarFromArgb(argbFromHex(palette.cardFill))
    )

    expect(backgroundTones).toEqual([...backgroundTones].sort((a, b) => b - a))
    expect(backgroundTones[0]).toBeGreaterThanOrEqual(97)
    expect(backgroundTones[2]).toBeGreaterThanOrEqual(90)
    expect(warningPalettes[3].bodyText.toLowerCase()).toBe("#ffffff")
    expect(warningPalettes[4].bodyText.toLowerCase()).toBe("#ffffff")
  })

  it("lets warning colors override card colors while preserving the non-red tag chip", () => {
    const warningWithTag = getAnnotationPalette({
      warningLevel: 3,
      tagId: "layout",
    })
    const warningWithoutTag = getAnnotationPalette({
      warningLevel: 3,
      tagId: "none",
    })
    const layoutTag = getTagPalette("layout")

    expect(warningWithTag.cardFill).toBe(warningWithoutTag.cardFill)
    expect(warningWithTag.tagChipFill).toBe(layoutTag.tagChipFill)
    expect(isWarningHue(warningWithTag.tagChipFill)).toBe(false)
  })

  it("normalizes legacy or invalid tag and warning data", () => {
    expect(normalizeAnnotationTagId(undefined)).toBe("none")
    expect(normalizeAnnotationTagId("unknown")).toBe("none")
    expect(normalizeAnnotationTagId("content")).toBe("content")

    expect(normalizeWarningLevel(undefined)).toBe(0)
    expect(normalizeWarningLevel(-1)).toBe(0)
    expect(normalizeWarningLevel(3.4)).toBe(3)
    expect(normalizeWarningLevel("5")).toBe(5)
    expect(normalizeWarningLevel(12)).toBe(5)
  })
})
