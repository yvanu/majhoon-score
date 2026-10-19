/** Normalize common vision-model spellings before matching 34 Mahjong tile codes. */
export function normalizeTileName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  let name = raw.trim().replace(/[\s、，。·\-]/g, '')
    .replace(/[萬万]/g, '万').replace(/[餅饼]/g, '筒')
    .replace(/[索竹]/g, '条').replace(/發/g, '发')
  const aliases: Record<string, string> = {
    万: '1万', 红中: '中', 白板: '白',
    发财: '发', 东风: '东', 南风: '南', 西风: '西', 北风: '北',
  }
  if (aliases[name]) return aliases[name]
  const cn = '一二三四五六七八九'
  return name.replace(/^[一二三四五六七八九]/, digit => String(cn.indexOf(digit) + 1))
}
