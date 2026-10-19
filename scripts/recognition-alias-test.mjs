import assert from 'node:assert/strict'
import { normalizeTileName } from '../src/mahjong/normalizeTileName.ts'

for (const [raw, expected] of [
  ['萬', '1万'], ['一萬', '1万'], ['壹萬', '壹万'],
  ['三筒', '3筒'], ['四餅', '4筒'], ['六索', '6条'],
  ['9筒', '9筒'], ['东风', '东'], ['红中', '中'], ['白板', '白'],
  ['發财', '发'], ['?', '?'],
]) {
  assert.equal(normalizeTileName(raw), expected, raw)
}
console.log('Recognition tile aliases passed')
