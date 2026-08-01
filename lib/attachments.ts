// Client-side attachment validation and image compression.
// All binary processing happens in the browser. No filename is ever
// transmitted to the server or recorded in logs or analytics.

export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const
export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number]

export const ACCEPTED_TYPES = [...ACCEPTED_IMAGE_TYPES, 'application/pdf'] as const

// Raw source limits
const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024 // 20 MB — beyond this, canvas resize is impractical on mobile
const MAX_PDF_BYTES = 3 * 1024 * 1024           // 3 MB raw → ~4 MB base64 → stays under Vercel's 4.5 MB limit

// Compression targets
const TARGET_OUTPUT_BYTES = 1.5 * 1024 * 1024   // 1.5 MB → ~2 MB base64
const MAX_LONG_EDGE_PX = 1920
const FALLBACK_LONG_EDGE_PX = 1280

// Total request budget: base64.length + 200 KB overhead (history JSON + framing)
// must stay below this to remain comfortably under Vercel's 4.5 MB hard limit.
export const REQUEST_BUDGET_BYTES = 4_000_000

export type AttachmentFileType = 'image' | 'pdf'

export function getFileType(file: File): AttachmentFileType | null {
  if ((ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) return 'image'
  if (file.type === 'application/pdf') return 'pdf'
  return null
}

export type ValidationError =
  | { code: 'unsupported_type'; message: string }
  | { code: 'source_too_large'; message: string }
  | { code: 'pdf_too_large'; message: string }

export function validateFile(file: File): { ok: true } | { ok: false; error: ValidationError } {
  const type = getFileType(file)

  if (!type) {
    return {
      ok: false,
      error: {
        code: 'unsupported_type',
        message: 'Unsupported file type. Attach an image (JPEG, PNG, WebP, GIF) or a PDF.',
      },
    }
  }

  if (type === 'image' && file.size > MAX_SOURCE_IMAGE_BYTES) {
    return {
      ok: false,
      error: {
        code: 'source_too_large',
        message: 'Image is too large to process. Try exporting a smaller version.',
      },
    }
  }

  if (type === 'pdf' && file.size > MAX_PDF_BYTES) {
    return {
      ok: false,
      error: {
        code: 'pdf_too_large',
        message:
          'This PDF is too large to attach. Choose a smaller file or attach screenshots of the relevant pages.',
      },
    }
  }

  return { ok: true }
}

/**
 * Compress an image using the Canvas API.
 *
 * Strategy:
 *   - Resize to max long edge 1920px, preserving aspect ratio.
 *   - PNG input: try lossless PNG first (preserves text sharpness in screenshots).
 *     If the PNG result exceeds 1.5 MB, fall through to JPEG.
 *   - All inputs: adaptive JPEG at quality 0.92 → 0.85 → 0.78.
 *   - Final fallback: resize to 1280px and encode JPEG at 0.82.
 *
 * The filename is never read or logged here.
 */
export async function compressImage(
  file: File,
): Promise<{ base64: string; mimeType: 'image/jpeg' | 'image/png' }> {
  const bitmap = await createImageBitmap(file)

  const scale = Math.min(1, MAX_LONG_EDGE_PX / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  // PNG input: try lossless first to preserve text sharpness
  if (file.type === 'image/png') {
    const pngBlob = await canvasToBlob(canvas, 'image/png')
    if (pngBlob && pngBlob.size <= TARGET_OUTPUT_BYTES) {
      return { base64: await blobToBase64(pngBlob), mimeType: 'image/png' }
    }
  }

  // Adaptive JPEG quality
  for (const quality of [0.92, 0.85, 0.78]) {
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    if (blob && blob.size <= TARGET_OUTPUT_BYTES) {
      return { base64: await blobToBase64(blob), mimeType: 'image/jpeg' }
    }
  }

  // Final fallback: smaller canvas
  const scale2 = Math.min(1, FALLBACK_LONG_EDGE_PX / Math.max(w, h))
  const canvas2 = document.createElement('canvas')
  canvas2.width = Math.round(w * scale2)
  canvas2.height = Math.round(h * scale2)
  canvas2.getContext('2d')!.drawImage(canvas, 0, 0, canvas2.width, canvas2.height)

  const blob = await canvasToBlob(canvas2, 'image/jpeg', 0.82)
  return { base64: await blobToBase64(blob!), mimeType: 'image/jpeg' }
}

/**
 * Read a PDF file and return its base64-encoded content.
 * The filename is never logged.
 */
export function readPdfAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Estimate the total request body size for a given attachment base64 string.
 * base64.length ≈ encoded byte count (ASCII, 1 char ≈ 1 byte).
 * Adds 200 KB for message history JSON and request framing overhead.
 */
export function estimateRequestBytes(base64: string): number {
  return base64.length + 200_000
}

/**
 * Estimate the combined request size for multiple attachments.
 * Sums all base64 lengths and adds a single 200 KB overhead allowance.
 */
export function estimateCombinedRequestBytes(base64Strings: string[]): number {
  return base64Strings.reduce((sum, b) => sum + b.length, 0) + 200_000
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
