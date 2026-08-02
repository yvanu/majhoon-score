export type Wind = 'east' | 'south' | 'west' | 'north'
export type MatchStatus = 'active' | 'finished'
export type HandType = 'tsumo' | 'ron' | 'draw' | 'event' | 'custom'
export type InHandEventType = '明杠' | '暗杠' | '花杠' | '被跟圈' | '四风归一'
export type MahjongTile =
  | '1m' | '2m' | '3m' | '4m' | '5m' | '6m' | '7m' | '8m' | '9m'
  | '1p' | '2p' | '3p' | '4p' | '5p' | '6p' | '7p' | '8p' | '9p'
  | '1s' | '2s' | '3s' | '4s' | '5s' | '6s' | '7s' | '8s' | '9s'
  | 'east' | 'south' | 'west' | 'north' | 'red' | 'green' | 'white'
export type StatisticsDimension = 'day' | 'month' | 'year'

export interface HandTileRecord {
  pongs: MahjongTile[]
  exposedKongs: MahjongTile[]
  concealedKongs: MahjongTile[]
  hand: MahjongTile[]
  winningTile: MahjongTile | null
}

export interface Player {
  id: string
  name: string
  avatar_seed: number
  friend_id?: string | null
  user_id?: string | null
  seat: number
  score: number
}

export interface Friend {
  id: string
  name: string
  avatar_seed: number
  jointMatches: number
  gangKaiWins: number
  gangKaiAgainst: number
  lastPlayedAt: string | null
}

export interface FriendPatternStat {
  name: string
  count: number
}

export interface FriendStatistics {
  friend: Friend
  totalHands: number
  wins: number
  ronWins: number
  tsumoWins: number
  dealIns: number
  winPatterns: FriendPatternStat[]
  dealInPatterns: FriendPatternStat[]
}

export interface MatchPlayerInput {
  name: string
  friendId?: string
  isSelf?: boolean
}

export interface HandOutcome {
  winner_player_id: string
  score: number
  note: string | null
  tile_record: HandTileRecord | null
}

export interface HandOutcomeInput {
  winnerPlayerId: string
  score: number
  note?: string
  tileRecord?: HandTileRecord
}

export interface Hand {
  id: string
  sequence: number
  wind: Wind
  hand_number: number
  result_type: HandType
  winner_player_id: string | null
  loser_player_id: string | null
  note: string | null
  tile_record: HandTileRecord | null
  outcomes: HandOutcome[]
  scores: ScoreChange[]
  created_at: string
}

export interface Match {
  id: string
  share_code: string
  status: MatchStatus
  current_wind: Wind
  current_hand: number
  created_at: string
  finished_at: string | null
  players: Player[]
  hands: Hand[]
}

export interface ScoreChange {
  playerId: string
  change: number
}

export interface HandInput {
  type: HandType
  winnerPlayerId?: string
  loserPlayerId?: string
  outcomes?: HandOutcomeInput[]
  scores: ScoreChange[]
  note?: string
  tileRecord?: HandTileRecord
}

export interface HandMutationResult {
  hand: Hand
  current_wind: Wind
  current_hand: number
}

export interface PersonalPatternStat {
  name: string
  count: number
}

export interface FeaturedBigHand {
  handId: string
  matchId: string
  resultType: 'ron' | 'tsumo'
  note: string
  score: number
  createdAt: string
  tileRecord: HandTileRecord
}

export interface PersonalStatistics {
  dimension: StatisticsDimension
  value: string
  label: string
  totalHands: number
  wins: number
  dealIns: number
  tsumoWins: number
  bigHands: number
  patterns: PersonalPatternStat[]
  featuredBigHand: FeaturedBigHand | null
}

export interface PlayerStat extends Player {
  rank: number
  wins: number
  tsumo: number
  deal_in: number
  max_gain: number
  max_loss: number
  winRate: number
  dealInRate: number
  tsumoShare: number
}

export interface Stats {
  totalHands: number
  players: PlayerStat[]
}

export interface DailyPlayerStat {
  name: string
  score: number
  wins: number
  tsumo: number
  deal_in: number
  bigHands: number
  isSelf?: boolean
}

export interface DailyStats {
  date: string
  matchCount: number
  handCount: number
  players: DailyPlayerStat[]
}

export interface AuthUser {
  id: string
  username: string
  display_name: string | null
  created_at: string
}

export interface AuthResult {
  user: AuthUser
  token: string
  expiresAt: string
}

export interface MatchSummary {
  id: string
  share_code: string
  status: MatchStatus
  current_wind: Wind
  current_hand: number
  created_at: string
  finished_at: string | null
  hand_count: number
  player_names: string[]
}
