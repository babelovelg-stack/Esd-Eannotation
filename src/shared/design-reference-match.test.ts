import { describe, expect, it } from "vitest"

import {
  extractFigmaNodeId,
  findFingerprintMatch,
  type ImageFingerprint,
} from "./design-reference-match"

function fingerprint(
  samples: number[],
  width = 720,
  height = 560
): ImageFingerprint {
  return { width, height, samples }
}

describe("design reference matching", () => {
  it("extracts node ids from Figma links", () => {
    expect(
      extractFigmaNodeId(
        "https://www.figma.com/design/file/demo?node-id=123-456&t=abc"
      )
    ).toBe("123:456")
    expect(
      extractFigmaNodeId(
        "https://www.figma.com/design/file/demo?node-id=123%3A456"
      )
    ).toBe("123:456")
    expect(extractFigmaNodeId("ordinary annotation text")).toBeNull()
  })

  it("matches a visually equivalent image at another resolution", () => {
    const result = findFingerprintMatch(fingerprint([10, 80, 220]), [
      {
        nodeId: "10:1",
        fingerprint: fingerprint([12, 82, 218], 320, 249),
      },
      {
        nodeId: "10:2",
        fingerprint: fingerprint([240, 180, 20], 320, 249),
      },
    ])

    expect(result?.nodeId).toBe("10:1")
  })

  it("does not guess when two designs are visually ambiguous", () => {
    expect(
      findFingerprintMatch(fingerprint([10, 80, 220]), [
        { nodeId: "10:1", fingerprint: fingerprint([11, 81, 219]) },
        { nodeId: "10:2", fingerprint: fingerprint([12, 82, 218]) },
      ])
    ).toBeNull()
  })

  it("rejects unrelated images and aspect ratios", () => {
    expect(
      findFingerprintMatch(fingerprint([10, 80, 220]), [
        { nodeId: "10:1", fingerprint: fingerprint([240, 180, 20]) },
        {
          nodeId: "10:2",
          fingerprint: fingerprint([10, 80, 220], 560, 720),
        },
      ])
    ).toBeNull()
  })
})
