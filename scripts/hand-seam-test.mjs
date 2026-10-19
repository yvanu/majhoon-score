import assert from 'node:assert/strict'
import { detectTileBorders } from '../src/mahjong/detectTileBorders.ts'

function stripeImage(tileCount) {
  const width = 1280, height = 234
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 247
    data[i + 1] = 247
    data[i + 2] = 247
    data[i + 3] = 255
  }
  for (let j = 0; j <= tileCount; j++) {
    const x = 11 + Math.round(j * 1253 / tileCount)
    for (let y = 6; y < 61; y++) {
      for (let dx = 0; dx < 3; dx++) {
        const i = (y * width + x + dx) * 4
        data[i] = data[i + 1] = data[i + 2] = 92
      }
    }
  }
  return { width, height, data }
}

for (const n of [13, 14]) {
  const { data, width, height } = stripeImage(n)
  const borders = detectTileBorders(data, width, height)
  assert.equal(borders.length, n + 1, `should find ${n} tiles`)
  assert.ok(borders.every((x, i) => i === 0 || x > borders[i - 1]))
}
const blank = new Uint8ClampedArray(1280 * 234 * 4)
assert.deepEqual(detectTileBorders(blank, 1280, 234), [])
console.log('Hand seam detection: 13/14 tiles detected; no segmentation on blank photo')
