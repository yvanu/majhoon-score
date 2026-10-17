// 标准型麻将：仅计算「四组面子 + 一对将」，不含七对、番型与明牌。
export type Tile = number
export type Draw = { tile: Tile; remaining: number }
export type Discard = { tile: Tile; shanten: number; useful: Draw[]; total: number }

export const TILE_NAMES: string[] = [
  ...Array.from({ length: 9 }, (_, i) => `${i + 1}万`),
  ...Array.from({ length: 9 }, (_, i) => `${i + 1}筒`),
  ...Array.from({ length: 9 }, (_, i) => `${i + 1}条`),
  '东', '南', '西', '北', '中', '发', '白',
]
export const TILE_GROUPS = [
  { label: '万子', short: '万', start: 0, end: 9, color: 'man' },
  { label: '筒子', short: '筒', start: 9, end: 18, color: 'pin' },
  { label: '条子', short: '条', start: 18, end: 27, color: 'sou' },
  { label: '字牌', short: '字', start: 27, end: 34, color: 'honor' },
]

const shantenCache = new Map<string, number>()

export function validateHand(hand: Tile[]): boolean {
  if (hand.length > 14) return false
  const counts = Array(34).fill(0)
  for (const tile of hand) {
    if (!Number.isInteger(tile) || tile < 0 || tile > 33 || ++counts[tile] > 4) return false
  }
  return true
}

/**
 * 标准向听数：-1=和牌，0=听牌，1=一向听。
 * 穷举刻子/顺子/搭子/雀头；搭子最多计至4减面子数。
 * 对缺张与多一张的手牌也可计算，外部仅使用13或14张结果。
 */
export function standardShanten(hand: Tile[]): number {
  if (!validateHand(hand)) throw new Error('非法手牌：最多14张，且同一种牌最多4张')
  const key = [...hand].sort((a, b) => a - b).join(',')
  const cached = shantenCache.get(key)
  if (cached !== undefined) return cached
  const c = Array(34).fill(0) as number[]
  for (const tile of hand) c[tile]++
  let best = 8

  function dfs(index: number, melds: number, taatsu: number, pair: number) {
    while (index < 34 && c[index] === 0) index++
    if (index === 34) {
      const blocks = Math.min(taatsu, 4 - melds)
      best = Math.min(best, 8 - melds * 2 - blocks - pair)
      return
    }
    if (melds > 4 || taatsu > 4 || pair > 1) return

    // 刻子
    if (c[index] >= 3) {
      c[index] -= 3
      dfs(index, melds + 1, taatsu, pair)
      c[index] += 3
    }
    // 顺子
    if (index < 27 && index % 9 <= 6 && c[index + 1] && c[index + 2]) {
      c[index]--; c[index + 1]--; c[index + 2]--
      dfs(index, melds + 1, taatsu, pair)
      c[index]++; c[index + 1]++; c[index + 2]++
    }
    if (c[index] >= 2) {
      c[index] -= 2
      if (!pair) dfs(index, melds, taatsu, 1)
      if (taatsu < 4) dfs(index, melds, taatsu + 1, pair)
      c[index] += 2
    }
    if (taatsu < 4 && index < 27) {
      if (index % 9 <= 7 && c[index + 1]) {
        c[index]--; c[index + 1]--
        dfs(index, melds, taatsu + 1, pair)
        c[index]++; c[index + 1]++
      }
      if (index % 9 <= 6 && c[index + 2]) {
        c[index]--; c[index + 2]--
        dfs(index, melds, taatsu + 1, pair)
        c[index]++; c[index + 2]++
      }
    }
    // 不取当前牌：留作孤张。
    c[index]--
    dfs(index, melds, taatsu, pair)
    c[index]++
  }
  dfs(0, 0, 0, 0)
  if (shantenCache.size > 8000) shantenCache.clear()
  shantenCache.set(key, best)
  return best
}

/** 对13张手牌，枚举摸入后会降低向听数的牌。数量仅扣除自己的手牌。 */
export function usefulDraws(hand: Tile[]): Draw[] {
  if (hand.length !== 13 || !validateHand(hand)) return []
  const previous = standardShanten(hand)
  const counts = Array(34).fill(0) as number[]
  hand.forEach(tile => counts[tile]++)
  const draws: Draw[] = []
  for (let tile = 0; tile < 34; tile++) {
    if (counts[tile] === 4) continue
    if (standardShanten([...hand, tile]) < previous) {
      draws.push({ tile, remaining: 4 - counts[tile] })
    }
  }
  return draws
}

/** 对14张手牌分别尝试舍牌，向听数越低、有效进张越多，排名越靠前。 */
export function rankDiscards(hand: Tile[]): Discard[] {
  if (hand.length !== 14 || !validateHand(hand)) return []
  if (standardShanten(hand) === -1) return []
  const options: Discard[] = []
  for (const tile of new Set(hand)) {
    const copy = [...hand]
    copy.splice(copy.indexOf(tile), 1)
    const useful = usefulDraws(copy)
    options.push({
      tile,
      shanten: standardShanten(copy),
      useful,
      total: useful.reduce((sum, draw) => sum + draw.remaining, 0),
    })
  }
  return options.sort((a, b) => a.shanten - b.shanten || b.total - a.total || a.tile - b.tile)
}

export function shantenLabel(value: number): string {
  if (value < 0) return '可以和牌'
  if (value === 0) return '已听牌'
  return `${value} 向听`
}

/** 摸牌后的具体路径：先摸，再求当前14张的最优舍牌。 */
export function afterDraw(hand: Tile[], draw: Tile): { winning: boolean; best?: Discard } | null {
  if (hand.length !== 13 || !validateHand([...hand, draw])) return null
  const fourteen = [...hand, draw]
  if (standardShanten(fourteen) === -1) return { winning: true }
  const best = rankDiscards(fourteen)[0]
  return best ? { winning: false, best } : null
}
