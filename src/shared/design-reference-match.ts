export type ImageFingerprint = {
  width: number
  height: number
  samples: number[]
}

export type FingerprintCandidate = {
  nodeId: string
  fingerprint: ImageFingerprint
}

export type FingerprintMatch = {
  nodeId: string
  distance: number
}

const MAX_ASPECT_RATIO_DELTA = 0.03
const MAX_PIXEL_DISTANCE = 0.1
const MIN_RUNNER_UP_GAP = 0.02

export function extractFigmaNodeId(text: string): string | null {
  const match = text.match(/[?&]node-id=([^&#\s]+)/i)
  if (!match) {
    return null
  }

  try {
    return normalizeFigmaNodeId(decodeURIComponent(match[1]))
  } catch {
    return null
  }
}

export function normalizeFigmaNodeId(value: string): string | null {
  const normalized = value.trim()
  const colonMatch = normalized.match(/^(\d+):(\d+)$/)
  if (colonMatch) {
    return `${colonMatch[1]}:${colonMatch[2]}`
  }

  const hyphenMatch = normalized.match(/^(\d+)-(\d+)$/)
  return hyphenMatch ? `${hyphenMatch[1]}:${hyphenMatch[2]}` : null
}

export function findFingerprintMatch(
  pasted: ImageFingerprint,
  candidates: FingerprintCandidate[]
): FingerprintMatch | null {
  const matches = candidates
    .filter(({ fingerprint }) => hasComparableAspectRatio(pasted, fingerprint))
    .map(({ nodeId, fingerprint }) => ({
      nodeId,
      distance: fingerprintDistance(pasted, fingerprint),
    }))
    .filter((match) => Number.isFinite(match.distance))
    .sort((left, right) => left.distance - right.distance)

  const best = matches[0]
  if (!best || best.distance > MAX_PIXEL_DISTANCE) {
    return null
  }

  const runnerUp = matches[1]
  if (runnerUp && runnerUp.distance - best.distance < MIN_RUNNER_UP_GAP) {
    return null
  }

  return best
}

function hasComparableAspectRatio(
  left: ImageFingerprint,
  right: ImageFingerprint
) {
  if (
    left.width <= 0 ||
    left.height <= 0 ||
    right.width <= 0 ||
    right.height <= 0
  ) {
    return false
  }

  const leftRatio = left.width / left.height
  const rightRatio = right.width / right.height
  return (
    Math.abs(leftRatio - rightRatio) / Math.max(leftRatio, rightRatio) <=
    MAX_ASPECT_RATIO_DELTA
  )
}

function fingerprintDistance(left: ImageFingerprint, right: ImageFingerprint) {
  if (
    left.samples.length === 0 ||
    left.samples.length !== right.samples.length
  ) {
    return Number.POSITIVE_INFINITY
  }

  const totalDifference = left.samples.reduce(
    (total, value, index) => total + Math.abs(value - right.samples[index]),
    0
  )
  return totalDifference / (left.samples.length * 255)
}
