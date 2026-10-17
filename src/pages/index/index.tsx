import { useMemo, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Image, Text, View } from '@tarojs/components'
import { TILE_GROUPS, TILE_NAMES, rankDiscards, shantenLabel, standardShanten, usefulDraws, afterDraw, type Draw, type Tile } from '../../mahjong/engine'
import './index.scss'

const SAMPLE: Tile[] = [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 27, 33]
const TILE_STYLE = ['man', 'pin', 'sou', 'honor']
const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九']

function TileFace({ tile, small = false, onClick, faded = false }: { tile: Tile; small?: boolean; onClick?: () => void; faded?: boolean }) {
  const group = Math.floor(tile / 9) > 2 ? 3 : Math.floor(tile / 9)
  const honor = tile >= 27
  return <View
    className={`mg-tile ${TILE_STYLE[group]} ${small ? 'mg-tile-small' : ''} ${faded ? 'mg-tile-faded' : ''}`}
    onClick={onClick}
    aria-label={TILE_NAMES[tile]}
  >
    <Text className='mg-tile-face'>{honor ? TILE_NAMES[tile] : CN[tile % 9]}</Text>
    {!honor && <Text className='mg-tile-suit'>{['萬', '筒', '索'][group]}</Text>}
    {onClick && <Text className='mg-tile-minus'>×</Text>}
  </View>
}

function TileList({ tiles, selected, onSelect }: { tiles: Draw[]; selected?: Tile | null; onSelect?: (tile: Tile) => void }) {
  if (!tiles.length) return <Text className='mg-muted'>暂无有效进张</Text>
  return <View className='mg-draw-list'>
    {tiles.map(({ tile, remaining }) => <View className={`mg-draw ${selected === tile ? 'selected' : ''}`} key={tile} onClick={() => onSelect?.(tile)}>
      <TileFace tile={tile} small />
      <Text className='mg-draw-count'>约 {remaining} 张</Text>
    </View>)}
  </View>
}

export default function Index() {
  const [hand, setHand] = useState<Tile[]>([])
  const [group, setGroup] = useState(0)
  const [page, setPage] = useState<'analyze' | 'guide'>('analyze')
  const [photo, setPhoto] = useState('')
  const [photoNotice, setPhotoNotice] = useState(false)
  const [selectedDraw, setSelectedDraw] = useState<Tile | null>(null)
  const counts = useMemo(() => {
    const result = Array(34).fill(0) as number[]
    hand.forEach(tile => result[tile]++)
    return result
  }, [hand])
  const analysis = useMemo(() => {
    if (hand.length < 13) return null
    const shanten = standardShanten(hand)
    return {
      shanten,
      draws: hand.length === 13 ? usefulDraws(hand) : [],
      discards: hand.length === 14 ? rankDiscards(hand) : [],
    }
  }, [hand])

  function add(tile: Tile) {
    if (hand.length >= 14 || counts[tile] >= 4) {
      void Taro.showToast({ title: hand.length >= 14 ? '最多录入14张手牌' : '同种麻将最多4张', icon: 'none' })
      return
    }
    setHand(list => [...list, tile].sort((a, b) => a - b))
  }
  function remove(index: number) {
    setHand(list => list.filter((_, i) => i !== index))
  }
  async function choosePhoto() {
    try {
      const selected = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['camera', 'album'] })
      const filepath = selected.tempFilePaths[0]
      if (!filepath) return
      setPhoto(filepath)
      setPhotoNotice(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message && !/cancel/i.test(message)) void Taro.showToast({ title: '打开相机失败，请手动选牌', icon: 'none' })
    }
  }

  const best = analysis?.discards[0]
  const effective = analysis ? analysis.draws.reduce((sum, item) => sum + item.remaining, 0) : 0
  const preview = useMemo(() => hand.length === 13 && selectedDraw !== null && analysis?.draws.some(item => item.tile === selectedDraw)
    ? afterDraw(hand, selectedDraw) : null, [hand, selectedDraw, analysis])

  return <View className='mg-app'>
    <View className='mg-top'>
      <View className='mg-top-row'>
        <View className='mg-logo'><Text>听</Text></View>
        <View className='mg-brand'><Text>牌路</Text><Text className='mg-brand-en'>MAHJONG MATE</Text></View>
        <View className='mg-edition'>新手友好版 <Text>↗</Text></View>
      </View>
      {page === 'analyze' ? <View className='mg-hero'>
        <Text className='mg-hero-kicker'>YOUR MAHJONG CO-PILOT</Text>
        <Text className='mg-hero-title'>下一张怎么打，<Text>心里有数。</Text></Text>
        <Text className='mg-hero-subtitle'>看懂牌型 · 计算向听 · 找出更好的舍牌</Text>
        <View className='mg-hero-decoration' aria-hidden='true'>
          <View className='mg-deco-tile d1'><Text>發</Text></View>
          <View className='mg-deco-tile d2'><Text>一</Text><Text className='mg-deco-small'>萬</Text></View>
          <View className='mg-deco-tile d3'><Text>中</Text></View>
        </View>
        <Button className='mg-camera-button' onClick={() => { void choosePhoto() }}>
          <Text className='mg-camera-icon'>◎</Text><Text>拍张手牌</Text><Text className='mg-camera-arrow'>↗</Text>
        </Button>
        <Text className='mg-hero-hint'>拍照留档后可对照照片选牌 · 自动图像识别正在开发</Text>
      </View> : <View className='mg-guide-hero'>
        <Text className='mg-hero-kicker'>A LITTLE GUIDE</Text>
        <Text className='mg-hero-title'>少一点摸索，<Text>多一点把握。</Text></Text>
        <Text className='mg-hero-subtitle'>不用背术语，也能看懂自己的手牌。</Text>
      </View>}
    </View>

    {page === 'analyze' ? <View className='mg-content'>
      <View className='mg-progress'>
        <View className='mg-progress-step'><Text>01</Text> 录入手牌</View>
        <Text className='mg-progress-line'>────</Text>
        <View className='mg-progress-step'><Text>02</Text> 牌型分析</View>
        <Text className='mg-progress-line'>────</Text>
        <View className='mg-progress-step'><Text>03</Text> 出牌建议</View>
      </View>

      {photo && <View className='mg-photo-panel'>
        <Image className='mg-photo-thumb' src={photo} mode='aspectFill' onClick={() => { void Taro.previewImage({ urls: [photo] }) }} />
        <View className='mg-photo-copy'>
          <Text className='mg-photo-title'>手牌照片已保存</Text>
          <Text>对照照片点击下方牌面录入。照片仅保存在本次页面中。</Text>
        </View>
        <Text className='mg-photo-close' onClick={() => { setPhoto(''); setPhotoNotice(false) }}>×</Text>
      </View>}
      {photoNotice && <View className='mg-notice'><Text>识别模型尚未接入，目前请手动核对并录入牌面。</Text><Text onClick={() => setPhotoNotice(false)}>知道了</Text></View>}

      <View className='mg-section-header'>
        <View>
          <Text className='mg-eyebrow'>MY HAND / 手牌</Text>
          <Text className='mg-section-title'>我的手牌</Text>
        </View>
        <View className='mg-hand-length'><Text>{hand.length}</Text> / 14 张</View>
      </View>
      <View className='mg-hand-card'>
        {hand.length ? <View className='mg-hand-tiles'>
          {hand.map((tile, index) => <TileFace key={`${tile}-${index}`} tile={tile} onClick={() => remove(index)} />)}
        </View> : <View className='mg-empty-hand'>
          <View className='mg-empty-stacks'><Text>🀇</Text><Text>🀙</Text><Text>🀐</Text></View>
          <Text className='mg-empty-title'>还没有录入麻将牌</Text>
          <Text>从下方选择你的手牌，或试试示例</Text>
        </View>}
        <View className='mg-hand-footer'>
          <Text>点已选中的牌即可移除 · 支持 13 / 14 张</Text>
          <View className='mg-hand-actions'>
            <Text onClick={() => setHand(SAMPLE)}>示例</Text>
            <Text className='mg-divider'>/</Text>
            <Text onClick={() => setHand([])}>清空</Text>
          </View>
        </View>
      </View>

      <View className='mg-section-header mg-picker-header'>
        <View>
          <Text className='mg-eyebrow'>CHOOSE TILES / 选牌</Text>
          <Text className='mg-section-title'>添加麻将牌</Text>
        </View>
        <Text className='mg-picker-caption'>每种牌最多 4 张</Text>
      </View>
      <View className='mg-picker-card'>
        <View className='mg-suit-tabs'>
          {TILE_GROUPS.map((item, index) => <View key={item.label} className={`mg-suit-tab ${group === index ? 'active' : ''}`} onClick={() => setGroup(index)}>
            <Text>{item.short}</Text><Text>{item.label}</Text>
          </View>)}
        </View>
        <View className='mg-palette'>
          {Array.from({ length: TILE_GROUPS[group].end - TILE_GROUPS[group].start }, (_, i) => {
            const tile = TILE_GROUPS[group].start + i
            return <View className='mg-palette-option' key={tile} onClick={() => add(tile)}>
              <TileFace tile={tile} faded={counts[tile] >= 4 || hand.length >= 14} />
              <Text className='mg-stock'>{counts[tile]}/4</Text>
            </View>
          })}
        </View>
      </View>

      <View className='mg-section-header mg-results-header'>
        <View>
          <Text className='mg-eyebrow'>HAND INSIGHTS / 分析</Text>
          <Text className='mg-section-title'>牌路建议</Text>
        </View>
        <Text className='mg-analyze-tag'>实时计算</Text>
      </View>
      {!analysis ? <View className='mg-result-placeholder'>
        <Text className='mg-result-placeholder-icon'>✧</Text>
        <Text className='mg-result-placeholder-title'>再录入 {13 - hand.length} 张，就能开始分析</Text>
        <Text>13 张分析进张和听牌；14 张推荐打哪张。</Text>
        <Button className='mg-example-button' onClick={() => setHand(SAMPLE)}>体验示例牌型 →</Button>
      </View> : <View className='mg-results'>
        <View className='mg-result-status'>
          <View><Text className='mg-status-caption'>{hand.length === 14 && analysis.shanten !== -1 ? '当前手牌 · 推荐舍牌后' : '当前手牌'}</Text>
            <Text className='mg-status-large'>{analysis.shanten === -1 ? '已和牌' : shantenLabel(best?.shanten ?? analysis.shanten)}</Text>
            <Text className='mg-status-sub'>{analysis.shanten === -1 ? '已满足普通和牌结构' : best ? '按向听数优先、有效进张次优排序' : analysis.shanten === 0 ? '再摸到一张和牌张即可和牌' : '以下是能够改善牌型的进张'}</Text>
          </View>
          <View className='mg-status-stamp'>✓<Text>已计算</Text></View>
        </View>
        {analysis.shanten === -1 ? <View className='mg-advice-box'><Text className='mg-advice-label'>好牌！</Text><Text className='mg-advice-title'>这副牌已经满足普通和牌结构。</Text><Text>仅判定结构，不判断地方规则与番数。</Text></View>
          : hand.length === 13 ? <View className='mg-advice-box'>
            <View className='mg-advice-header'><Text className='mg-advice-label'>{analysis.shanten === 0 ? '听牌张' : '有效进张'}</Text><Text className='mg-advice-metric'>理论 {effective} 张</Text></View>
            <TileList tiles={analysis.draws} selected={selectedDraw} onSelect={setSelectedDraw} />
            <Text className='mg-advice-foot'>点击一张有效进张，可预览摸入后的舍牌与听牌。</Text>
            {preview && <View className='mg-draw-preview'>
              <Text className='mg-preview-title'>摸入 {TILE_NAMES[selectedDraw!]} 后</Text>
              {preview.winning ? <Text className='mg-preview-copy'>这副牌符合普通和牌结构</Text>
                : preview.best && <View><Text className='mg-preview-copy'>建议打出 {TILE_NAMES[preview.best.tile]}，打出后 {shantenLabel(preview.best.shanten)}</Text><TileList tiles={preview.best.useful} /></View>}
            </View>}
            <Text className='mg-advice-foot'>此处「张数」仅扣除自己手里的牌，不代表牌墙剩余。</Text>
          </View> : <>
            {best && <View className='mg-advice-box'>
              <View className='mg-advice-header'><Text className='mg-advice-label'>首选舍牌</Text><Text className='mg-advice-metric'>有效进张 {best.total} 张</Text></View>
              <View className='mg-recommend'><TileFace tile={best.tile} /><View><Text className='mg-recommend-title'>建议打出 {TILE_NAMES[best.tile]}</Text><Text className='mg-recommend-sub'>打出后 {shantenLabel(best.shanten)}</Text></View><Text className='mg-best-tag'>推荐</Text></View>
              <Text className='mg-small-head'>打出后，关注这些牌</Text>
              <TileList tiles={best.useful} />
              <Text className='mg-advice-foot'>有效张数只扣除了自己的手牌；暂未考虑公开牌、对手与番数。</Text>
            </View>}
            {analysis.discards.length > 1 && <View className='mg-alternatives'><Text className='mg-alternatives-title'>其他舍牌选择</Text>
              {analysis.discards.slice(1, 5).map(item => <View className='mg-alt-row' key={item.tile}>
                <TileFace tile={item.tile} small />
                <Text className='mg-alt-name'>打 {TILE_NAMES[item.tile]}</Text>
                <Text className='mg-alt-shanten'>{shantenLabel(item.shanten)}</Text>
                <Text className='mg-alt-remaining'>{item.total} 张进张</Text>
              </View>)}
            </View>}
          </>}
      </View>}
      <View className='mg-disclaimer'>只计算普通牌型（四组面子＋一对将），暂不支持七对、吃碰杠及地方番型。建议仅供学习参考。</View>
    </View> : <View className='mg-guide-content'>
      <View className='mg-guide-card'><Text className='mg-guide-no'>01 / SHANTEN</Text><Text className='mg-guide-title'>什么是「向听」？</Text><Text>向听数代表距离听牌还有多远。0 向听就是已经听牌，1 向听表示通常还需要一步改善牌型。</Text></View>
      <View className='mg-guide-card'><Text className='mg-guide-no'>02 / EFFECTIVE TILES</Text><Text className='mg-guide-title'>什么是「有效进张」？</Text><Text>摸到后能降低向听数的牌。有效进张理论张数越多，通常越容易推进牌型，但还要考虑别人打出和已知的牌。</Text></View>
      <View className='mg-guide-card'><Text className='mg-guide-no'>03 / DISCARD</Text><Text className='mg-guide-title'>为什么推荐打这张？</Text><Text>软件先比较打出各张牌后的向听数，再比较有效进张数量。它不等于实战必胜建议，也不含攻守判断。</Text></View>
      <View className='mg-guide-card'><Text className='mg-guide-no'>04 / CURRENT SCOPE</Text><Text className='mg-guide-title'>当前支持哪些规则？</Text><Text>先支持13～14张暗手的普通和牌结构，不考虑番数，不判断七对子、吃碰杠和特殊地方规则。</Text></View>
      <Button className='mg-guide-back' onClick={() => setPage('analyze')}>开始分析我的手牌 ↗</Button>
    </View>}

    <View className='mg-footer-nav'>
      <View className={`mg-nav-item ${page === 'analyze' ? 'active' : ''}`} onClick={() => setPage('analyze')}><Text className='mg-nav-symbol'>▦</Text><Text>牌型分析</Text></View>
      <View className={`mg-nav-item ${page === 'guide' ? 'active' : ''}`} onClick={() => setPage('guide')}><Text className='mg-nav-symbol'>◫</Text><Text>新手指南</Text></View>
    </View>
  </View>
}
