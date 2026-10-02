// Face embedding + matching, computed entirely on the device.
//
// The embedding here is a lightweight 128-dimension appearance vector: the photo is
// center-cropped, reduced to an 8×16 grayscale grid, then mean-centred and L2-normalised.
// It reliably re-identifies the same registration photo and keeps the whole pipeline
// realistic (vector out, Euclidean distance in). For true biometric matching across
// different photos, swap `embedImage` for a face model such as face-api.js or InsightFace —
// nothing else needs to change.

export const EMBEDDING_SIZE = 128
// Distance below which two embeddings count as the same person (vectors are unit length, so 0–2)
export const MATCH_THRESHOLD = 0.5

export function normalise(v: number[]): number[] {
  const mean = v.reduce((a, b) => a + b, 0) / v.length
  const centred = v.map((x) => x - mean)
  const norm = Math.hypot(...centred) || 1
  return centred.map((x) => x / norm)
}

export function embedImage(source: CanvasImageSource, width: number, height: number): number[] {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 16
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  // Centre crop with a 1:2 portrait aspect around the middle of the frame (where a face sits)
  const cropH = Math.min(height, width * 2) * 0.8
  const cropW = cropH / 2
  ctx.drawImage(source, (width - cropW) / 2, (height - cropH) / 2, cropW, cropH, 0, 0, 8, 16)
  const { data } = ctx.getImageData(0, 0, 8, 16)
  const gray: number[] = []
  for (let i = 0; i < data.length; i += 4) gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
  return normalise(gray)
}

export function euclidean(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < EMBEDDING_SIZE; i++) sum += ((a[i] ?? 0) - (b[i] ?? 0)) ** 2
  return Math.sqrt(sum)
}

// A live capture of a known person: their stored vector plus camera/lighting noise
export function simulateCapture(vector: number[], noise = 0.02): number[] {
  return normalise(vector.map((x) => x + gaussian() * noise))
}

export function randomFace(): number[] {
  return normalise(Array.from({ length: EMBEDDING_SIZE }, gaussian))
}

function gaussian() {
  const u = 1 - Math.random()
  const v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Load an image file, return both its embedding and a small JPEG thumbnail
export async function processPhotoFile(file: File): Promise<{ vector: number[]; thumbnail: string }> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return fromSource(img, img.naturalWidth, img.naturalHeight)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function fromSource(source: CanvasImageSource, w: number, h: number) {
  const vector = embedImage(source, w, h)
  const canvas = document.createElement('canvas')
  const size = 160
  canvas.width = size
  canvas.height = size
  const side = Math.min(w, h)
  canvas.getContext('2d')!.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size)
  return { vector, thumbnail: canvas.toDataURL('image/jpeg', 0.7) }
}
