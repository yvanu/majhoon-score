/**
 * 在紧密横排手牌的浅色牌顶，寻找每张牌间的竖向接缝。
 * 成功时返回 14/15 条边界线（对应 13/14 张牌）；不确定时返回空数组，绝不强切牌面。
 */
export function detectTileBorders(data: Uint8ClampedArray, width: number, height: number): number[] {
  if (width < 260 || height < 45 || data.length < width * height * 4) return []
  const startY = Math.max(1, Math.floor(height * 0.02))
  const endY = Math.min(height, Math.floor(height * 0.29))
  const gradient = new Float32Array(width)
  let rows = 0
  for (let y = startY; y < endY; y += 2) {
    let prev = (y * width) * 4
    for (let x = 1; x < width; x++) {
      const curr = prev + 4
      const left = (data[prev] + data[prev + 1] + data[prev + 2]) / 3
      const right = (data[curr] + data[curr + 1] + data[curr + 2]) / 3
      gradient[x] += Math.abs(right - left)
      prev = curr
    }
    rows++
  }
  const smooth = new Float32Array(width)
  for (let x = 3; x < width - 3; x++) {
    let sum = 0
    for (let delta = -2; delta <= 2; delta++) sum += gradient[x + delta] / rows
    smooth[x] = sum / 5
  }

  const candidates: Array<{ x: number; strength: number }> = []
  for (let x = 5; x < width - 5; x++) {
    if (smooth[x] < 1.15 || smooth[x] < smooth[x - 1] || smooth[x] <= smooth[x + 1]) continue
    let leftMin = smooth[x], rightMin = smooth[x]
    for (let n = 1; n <= 13; n++) {
      leftMin = Math.min(leftMin, smooth[x - n] || 0)
      rightMin = Math.min(rightMin, smooth[x + n] || 0)
    }
    if (smooth[x] - Math.max(leftMin, rightMin) >= 0.85) {
      candidates.push({ x, strength: smooth[x] })
    }
  }
  const separation = Math.floor(width / 19)
  const selected: number[] = []
  for (const candidate of candidates.sort((a, b) => b.strength - a.strength)) {
    if (selected.every(x => Math.abs(x - candidate.x) >= separation)) selected.push(candidate.x)
  }
  selected.sort((a, b) => a - b)
  const numberOfTiles = selected.length - 1
  if (numberOfTiles !== 13 && numberOfTiles !== 14) return []
  if (selected[0] > width * 0.07 || selected[selected.length - 1] < width * 0.93) return []
  const expectedWidth = (selected[selected.length - 1] - selected[0]) / numberOfTiles
  for (let i = 1; i < selected.length; i++) {
    const gap = selected[i] - selected[i - 1]
    if (gap < expectedWidth * 0.55 || gap > expectedWidth * 1.5) return []
  }
  return selected
}
