import { useMemo } from 'react'
import Taro from '@tarojs/taro'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import type {
  AuthUser,
  BigHandRecord,
  PersonalStatistics,
  StatisticsDimension,
  UserPreferences,
} from '@shared/types'
import { MasterBackGlyph, MasterRightChevronGlyph, getPageTopInset } from './shared'
import type { SyncStatus } from './shared'
import { IdentityAvatar } from './identity-avatar'
import { ScoreTrendChart } from './score-trend-chart'

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function deriveMasterPlayStyle(statistics: PersonalStatistics | null) {
  if (!statistics || statistics.totalHands < 4) {
    return {
      title: '等待更多牌局',
      tag: '数据积累中',
      attack: 50,
      stability: 50,
      risk: 50,
      features: ['再打几局后生成更稳定的牌风判断', '牌风只基于真实牌局数据', '数据越多，描述越准确'],
    }
  }
  const total = Math.max(1, statistics.totalHands)
  const winRate = statistics.wins / total
  const dealRate = statistics.dealIns / total
  const bigRate = statistics.bigHands / total
  const attack = clamp(44 + winRate * 105 + bigRate * 90 - dealRate * 28)
  const stability = clamp(78 + winRate * 24 - dealRate * 95)
  const risk = clamp(30 + dealRate * 150 + bigRate * 70)
  const title = stability >= 70 && attack >= 58
    ? '稳中偏攻'
    : attack >= 72
      ? '主动进攻'
      : risk >= 66
        ? '敢打敢冲'
        : stability >= 72
          ? '稳健控场'
          : '均衡牌风'
  const features = [
    attack >= 60 ? '更倾向主动做大牌' : '更倾向先保证成牌效率',
    stability >= 70 ? '领先时收得更稳' : '比分变化时调整较积极',
    risk >= 60 ? '点炮后下一局仍敢进攻' : '点炮后下一局显得更保守',
  ]
  return { title, tag: `${title}型牌风`, attack, stability, risk, features }
}

function BackTitle({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return <View className='master-profile-nav'>
    <Button hoverClass='none' onClick={onBack}><MasterBackGlyph /></Button>
    <View><Text>{title}</Text>{subtitle && <Text>{subtitle}</Text>}</View>
  </View>
}

function percent(part: number, total: number) {
  if (!total) return '0%'
  return `${Math.round(part / total * 100)}%`
}

function relativeTime(value: string) {
  const date = new Date(value)
  const now = new Date()
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  if (date.toDateString() === now.toDateString()) return `今天 ${time}`
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}

export function ProfileScreen({ user, statistics, statisticsLoading, onSettings, onPersonalStatistics, onLogin, onPlayStyle, onPreferences }: {
  user: AuthUser | null
  statistics: PersonalStatistics | null
  statisticsLoading: boolean
  syncStatus: SyncStatus
  onSettings: () => void
  onPersonalStatistics: () => void
  onLogin: () => void
  onPlayStyle: () => void
  onPreferences: () => void
}) {
  const style = deriveMasterPlayStyle(statistics)
  const matches = statistics?.trend.length || 0
  const score = statistics?.netScore || 0

  if (!user) return <View className='master-profile-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='master-profile-header'><Text>我的</Text><Text>个人数据与偏好</Text></View>
    <View className='master-profile-login'><Text>登录后查看自己的牌风与战绩</Text><Button hoverClass='none' onClick={onLogin}>微信登录</Button></View>
  </View>

  return <View className='master-profile-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <View className='master-profile-header'><Text>我的</Text><Text>个人数据与偏好</Text></View>
    <View className='master-profile-user-card'>
      <View className='master-profile-avatar'><IdentityAvatar name={user.display_name || user.username} gender={user.gender} avatarUrl={user.avatar_url} /></View>
      <View className='master-profile-user-copy'><Text>{user.display_name || user.username}</Text><Text>{statisticsLoading && !statistics ? '统计加载中…' : `本月 ${matches} 将 · ${score > 0 ? '+' : ''}${score}`}</Text><Text>{style.tag}</Text></View>
      <View className='master-profile-stats-link' onClick={onPersonalStatistics}><Text>我的战绩</Text><MasterRightChevronGlyph /></View>
    </View>

    <Text className='master-profile-section-title'>我的牌风</Text>
    <View className='master-profile-style-card' onClick={onPlayStyle}>
      <Text>{style.title}</Text>
      <Text>进攻指数 {style.attack} · 风险偏好 {style.risk >= 65 ? '偏高' : style.risk >= 45 ? '中等' : '偏低'}</Text>
      <View className='master-profile-style-link'><Text>查看牌风分析</Text><MasterRightChevronGlyph /></View>
    </View>

    <Text className='master-profile-section-title quick'>快捷入口</Text>
    <View className='master-profile-link' onClick={onPreferences}><View><Text>个人偏好</Text><Text>默认分值、录分习惯</Text></View><MasterRightChevronGlyph /></View>
    <View className='master-profile-link' onClick={onSettings}><View><Text>设置</Text><Text>账号、隐私、显示</Text></View><MasterRightChevronGlyph /></View>
  </View>
}

export function PersonalStatisticsScreen({ statistics, loading, onBack, onChange, onBigHands }: {
  statistics: PersonalStatistics
  loading: boolean
  autoSortTileRecord: boolean
  onBack: () => void
  onChange: (dimension: StatisticsDimension, value: string) => void
  onBigHands: () => void
}) {
  const dimensions: Array<{ value: StatisticsDimension; label: string }> = [
    { value: 'day', label: '日' },
    { value: 'month', label: '月' },
    { value: 'year', label: '年' },
  ]
  const recentBig = statistics.bigHandRecords?.[0] || null

  function changeDimension(dimension: StatisticsDimension) {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const value = dimension === 'day' ? `${year}-${month}-${day}` : dimension === 'month' ? `${year}-${month}` : String(year)
    onChange(dimension, value)
  }

  return <ScrollView scrollY className='master-stats-scroll' showScrollbar={false}>
    <View className='master-stats-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
      <BackTitle title='我的战绩' subtitle='按日 / 月 / 年查看' onBack={onBack} />
      <View className='master-stats-period'>{dimensions.map(item => <View className={statistics.dimension === item.value ? 'active' : ''} key={item.value} onClick={() => changeDimension(item.value)}><Text>{item.label}</Text></View>)}</View>
      <View className='master-stats-today'>
        <Text>{statistics.dimension === 'day' ? '今日战绩' : statistics.dimension === 'month' ? '本月战绩' : '本年战绩'}</Text>
        <Text className={statistics.netScore >= 0 ? 'positive' : 'negative'}>{statistics.netScore > 0 ? '+' : ''}{statistics.netScore}</Text>
        <Text>{statistics.totalHands} 局 · 胡 {statistics.wins} · 自摸 {statistics.tsumoWins}</Text>
        <Button hoverClass='none' onClick={onBigHands}>看详情</Button>
      </View>
      <View className='master-stats-metrics'>
        <View><Text>总局数</Text><Text>{statistics.totalHands} 局</Text><Text>当前周期</Text></View>
        <View><Text>胡牌率</Text><Text>{percent(statistics.wins, statistics.totalHands)}</Text><Text>胡 {statistics.wins} 次</Text></View>
        <View><Text>自摸率</Text><Text>{percent(statistics.tsumoWins, statistics.totalHands)}</Text><Text>自摸 {statistics.tsumoWins} 次</Text></View>
        <View><Text>点炮率</Text><Text>{percent(statistics.dealIns, statistics.totalHands)}</Text><Text>点炮 {statistics.dealIns} 次</Text></View>
      </View>
      <Text className='master-stats-section-title'>近 {Math.min(7, statistics.trend.length || 7)} 场趋势</Text>
      <View className='master-stats-trend'><Text>近{Math.min(7, statistics.trend.length || 7)}场 {statistics.netScore > 0 ? '+' : ''}{statistics.netScore}</Text><ScoreTrendChart points={statistics.trend.slice(-7)} /></View>
      <Text className='master-stats-section-title big'>最近大胡</Text>
      {recentBig ? <View className='master-stats-big-hand' onClick={onBigHands}><View><Text>{recentBig.note?.split('、').join(' · ') || '大胡'} · {recentBig.resultType === 'tsumo' ? '自摸' : '点炮胡'}</Text><Text>{relativeTime(recentBig.createdAt)} · {recentBig.score > 0 ? '+' : ''}{recentBig.score}</Text></View>{recentBig.tileRecord && <Text>牌谱</Text>}</View>
        : <View className='master-stats-big-empty'><Text>当前周期暂无大胡</Text></View>}
      {loading && <Text className='master-stats-loading'>更新中…</Text>}
    </View>
  </ScrollView>
}

export function MyStyleScreen({ statistics, onBack }: { statistics: PersonalStatistics | null; onBack: () => void }) {
  const style = deriveMasterPlayStyle(statistics)
  return <View className='master-style-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <BackTitle title='我的牌风' subtitle='近 90 天数据生成' onBack={onBack} />
    <View className='master-style-summary'><Text>{style.title}</Text><Text>综合牌风标签</Text><View><View><Text>进攻</Text><Text>{style.attack}</Text></View><View><Text>稳定</Text><Text>{style.stability}</Text></View><View><Text>冒险</Text><Text>{style.risk}</Text></View></View></View>
    <Text className='master-style-section-title'>特征</Text>
    <View className='master-style-features'>{style.features.map(feature => <View key={feature}><Text>{feature}</Text></View>)}</View>
  </View>
}

export function PreferencesScreen({ preferences, onChange, onBack }: {
  preferences: UserPreferences
  onChange: (preferences: UserPreferences) => void
  onBack: () => void
}) {
  async function chooseScores() {
    try {
      const options: Array<[number, number]> = [[50, 70], [50, 100], [70, 100], [100, 200]]
      const result = await Taro.showActionSheet({ itemList: options.map(item => `${item[0]} / ${item[1]}`) })
      onChange({ ...preferences, quickScores: options[result.tapIndex] })
    } catch {}
  }
  async function chooseStep() {
    try {
      const options = [5, 10, 20]
      const result = await Taro.showActionSheet({ itemList: options.map(value => `±${value}`) })
      onChange({ ...preferences, quickAdjustStep: options[result.tapIndex] })
    } catch {}
  }
  return <View className='master-preferences-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <BackTitle title='个人偏好' subtitle='只保留高频配置' onBack={onBack} />
    <View className='master-pref-list'>
      <View onClick={() => { void chooseScores() }}><Text>推荐分数</Text><Text>{preferences.quickScores[0]} / {preferences.quickScores[1]}</Text></View>
      <View onClick={() => { void chooseStep() }}><Text>快捷调整步长</Text><Text>±{preferences.quickAdjustStep}</Text></View>
      <View onClick={() => onChange({ ...preferences, defaultMultiRon: !preferences.defaultMultiRon })}><Text>默认一炮多响</Text><Text>{preferences.defaultMultiRon ? '开启' : '关闭'}</Text></View>
      <View onClick={() => onChange({ ...preferences, clearScoreStateAfterSave: !preferences.clearScoreStateAfterSave })}><Text>录分后清空状态</Text><Text>{preferences.clearScoreStateAfterSave ? '开启' : '关闭'}</Text></View>
      <View onClick={() => onChange({ ...preferences, showSettlementPreview: !preferences.showSettlementPreview })}><Text>显示结算预览</Text><Text>{preferences.showSettlementPreview ? '开启' : '关闭'}</Text></View>
    </View>
  </View>
}

export function ScoringSettingsScreen({ preferences, onBack, onPreferences }: { preferences: UserPreferences; onBack: () => void; onPreferences: () => void }) {
  const rows = [
    { name: '明杠', copy: '放杠者单独给分', value: String(preferences.eventDefaults['明杠']) },
    { name: '暗杠', copy: '其余三家每家给分', value: `每家${preferences.eventDefaults['暗杠']}` },
    { name: '花杠', copy: '其余三家每家给分', value: `每家${preferences.eventDefaults['花杠']}` },
    { name: '四风归一', copy: '其余三家每家给分', value: `每家${preferences.eventDefaults['四风归一']}` },
    { name: '被跟圈', copy: '被跟圈者直接扣分', value: '-30' },
  ]
  return <ScrollView scrollY className='master-scoring-scroll' showScrollbar={false}>
    <View className='master-scoring-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
      <BackTitle title='南京麻将规则' subtitle='当前产品默认记分规则' onBack={onBack} />
      <Text className='master-scoring-section-title'>录分习惯入口</Text>
      <View className='master-scoring-pref-link' onClick={onPreferences}><View><Text>个人偏好</Text><Text>推荐分、步长与录分习惯</Text></View><View className='master-scoring-enter'><Text>进入</Text><MasterRightChevronGlyph /></View></View>
      <Text className='master-scoring-section-title events'>局内事件规则</Text>
      <View className='master-scoring-event-list'>{rows.map(row => <View key={row.name}><View><Text>{row.name}</Text><Text>{row.copy}</Text></View><Text>{row.value}</Text></View>)}</View>
      <View className='master-scoring-note'><Text>补充规则</Text><Text>庄家胡牌、一炮多响、外包、流局不过庄。</Text><Text>北4 发生大胡 / 跟圈 / 花杠 / 四风归一时也不过庄。</Text></View>
    </View>
  </ScrollView>
}

export function SettingsScreen({ onBack, onEditProfile, onScoringSettings, onInfo }: {
  user: AuthUser
  preferences: UserPreferences
  loading: boolean
  syncStatus: SyncStatus
  onBack: () => void
  onEditProfile: () => void
  onPreferencesChange: (preferences: UserPreferences) => void
  onLogout: () => void
  onScoringSettings: () => void
  onInfo: (title: string) => void
}) {
  const rows = [
    { title: '账号与资料', subtitle: '微信昵称、头像', action: onEditProfile },
    { title: '记分设置', subtitle: '默认分值与快捷操作', action: onScoringSettings },
    { title: '通知', subtitle: '组局和群聊提醒', action: () => onInfo('通知') },
    { title: '显示', subtitle: '字号与界面偏好', action: () => onInfo('显示') },
    { title: '隐私', subtitle: '数据与授权', action: () => onInfo('隐私') },
  ]
  return <View className='master-settings-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
    <BackTitle title='设置' onBack={onBack} />
    <View className='master-settings-list'>{rows.map(row => <View key={row.title} onClick={row.action}><View><Text>{row.title}</Text><Text>{row.subtitle}</Text></View><MasterRightChevronGlyph /></View>)}</View>
  </View>
}

export function BigHandsScreen({ statistics, onBack }: { statistics: PersonalStatistics; onBack: () => void }) {
  const records = statistics.bigHandRecords || []
  const patterns = statistics.patterns.slice(0, 4)
  const mostRecent = records[0]
  async function openRecord(record: BigHandRecord) {
    if (!record.tileRecord) {
      await Taro.showToast({ title: `${record.note || '大胡'} · ${record.score > 0 ? '+' : ''}${record.score}`, icon: 'none' })
      return
    }
    await Taro.showModal({ title: record.note || '大胡牌谱', content: `本次得分 ${record.score > 0 ? '+' : ''}${record.score}，已保存牌谱。`, showCancel: false })
  }
  return <ScrollView scrollY className='master-big-hands-scroll' showScrollbar={false}>
    <View className='master-big-hands-screen' style={{ paddingTop: `${getPageTopInset()}px` }}>
      <BackTitle title='我的大胡' subtitle={`近 30 天共 ${statistics.bigHands} 次`} onBack={onBack} />
      <View className='master-big-summary'><Text>本月大胡</Text><Text>{statistics.bigHands} 次</Text><Text>{mostRecent ? `最近一次 ${mostRecent.score > 0 ? '+' : ''}${mostRecent.score}` : '暂无记录'}</Text></View>
      <Text className='master-big-section-title'>胡型统计</Text>
      <View className='master-big-patterns'>{patterns.length ? patterns.map(pattern => <Text key={pattern.name}>{pattern.name} {pattern.count}</Text>) : <Text>暂无</Text>}</View>
      <Text className='master-big-section-title records'>记录</Text>
      <View className='master-big-record-list'>{records.map(record => <View key={record.handId} onClick={() => { void openRecord(record) }}>
        <View><Text>{relativeTime(record.createdAt)}</Text><Text>{record.note?.split('、').join(' · ') || '大胡'}{record.resultType === 'tsumo' ? ' · 自摸' : ' · 点炮胡'}</Text></View>
        <View>{record.tileRecord && <Text>有牌谱</Text>}<Text className={record.score >= 0 ? 'positive' : 'negative'}>{record.score > 0 ? '+' : ''}{record.score}</Text></View>
        <MasterRightChevronGlyph />
      </View>)}</View>
      {!records.length && <View className='master-big-empty'><Text>当前周期还没有大胡记录</Text></View>}
    </View>
  </ScrollView>
}
