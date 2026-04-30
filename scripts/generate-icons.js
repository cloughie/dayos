#!/usr/bin/env node
// Generates placeholder PNG icons for PWA. Run once before deploying:
//   node scripts/generate-icons.js
// Replace the output files with proper branded icons when ready.

const { deflateSync } = require('zlib')
const { writeFileSync, mkdirSync } = require('fs')
const { join } = require('path')

const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[i] = c
}
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length)
  const crc = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

// Draws a dark square with a white "D" lettermark
function makePNG(size) {
  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

  const pad = Math.round(size * 0.18)
  const stroke = Math.max(2, Math.round(size * 0.09))
  const left = pad
  const top = pad
  const bottom = size - pad
  const midY = size / 2
  // D curve centre and radii
  const cx = left + stroke * 0.5
  const rx = (size - pad - left - stroke) * 0.92
  const ry = (bottom - top) * 0.5

  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.allocUnsafe(size * 3 + 1)
    row[0] = 0
    for (let x = 0; x < size; x++) {
      let r = 9, g = 9, b = 11 // zinc-950 background

      // Vertical bar
      const inVBar = x >= left && x < left + stroke && y >= top && y < bottom
      // Top horizontal bar
      const inTop = y >= top && y < top + stroke && x >= left && x < left + rx + stroke
      // Bottom horizontal bar
      const inBot = y >= bottom - stroke && y < bottom && x >= left && x < left + rx + stroke
      // Curved part (right half of ellipse outline)
      const dx = x - (cx + rx)
      const dy = y - midY
      const outer = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)
      const innerRx = rx - stroke
      const innerRy = ry - stroke
      const inner = innerRx > 0 && innerRy > 0
        ? (dx * dx) / (innerRx * innerRx) + (dy * dy) / (innerRy * innerRy)
        : 2
      const inCurve = outer <= 1 && inner >= 1 && x >= left + stroke

      if (inVBar || inTop || inBot || inCurve) { r = 250; g = 250; b = 250 }

      row[1 + x * 3] = r
      row[1 + x * 3 + 1] = g
      row[1 + x * 3 + 2] = b
    }
    rows.push(row)
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

const publicDir = join(__dirname, '..', 'public')
mkdirSync(publicDir, { recursive: true })
writeFileSync(join(publicDir, 'icon-192.png'), makePNG(192))
writeFileSync(join(publicDir, 'icon-512.png'), makePNG(512))
writeFileSync(join(publicDir, 'apple-touch-icon.png'), makePNG(180))
console.log('Icons written to public/  (icon-192.png, icon-512.png, apple-touch-icon.png)')
