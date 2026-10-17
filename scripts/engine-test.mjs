import assert from 'node:assert/strict'
import { standardShanten, usefulDraws, rankDiscards, validateHand, afterDraw } from '../src/mahjong/engine.ts'

const ready = [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 27]
const won = [...ready, 27]
assert.equal(standardShanten(won), -1, '完整牌型必须判断为和牌')
assert.equal(standardShanten(ready), 0, '缺将牌应为听牌')
assert.deepEqual(usefulDraws(ready), [{ tile: 27, remaining: 3 }], '应只听东，剩余三张')
assert.equal(standardShanten([0, 0, 0, 1, 1, 1, 9, 9, 9, 18, 18, 18, 27, 27]), -1, '刻子和将必须支持')
assert.equal(validateHand([0, 0, 0, 0, 0]), false, '不允许五张同种牌')
const candidate = [...ready, 33]
const options = rankDiscards(candidate)
assert.equal(options[0].shanten, 0)
assert.equal(options[0].total, 3)
assert.ok(options.some(item => item.tile === 33 && item.shanten === 0 && item.total === 3))
assert.equal(standardShanten([0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 27, 27, 33, 33]), -1)
const oneAway = [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 27, 30]
assert.equal(standardShanten(oneAway), 1)
const preview = afterDraw(oneAway, 20)
assert.equal(preview?.winning, false)
assert.equal(preview?.best?.shanten, 0)
assert.deepEqual(preview?.best?.useful.map(item => item.tile), [30])
assert.deepEqual(afterDraw(ready, 27), { winning: true })
assert.equal(afterDraw(ready, 34), null)
console.log('engine tests passed')
