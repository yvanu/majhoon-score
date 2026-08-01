export type Wind = 'east' | 'south' | 'west' | 'north'
export type MatchStatus = 'active' | 'finished'
export type HandType = 'tsumo' | 'ron' | 'draw' | 'custom'

export interface Player {
  id: string
  name: string
  avatar_seed: number
  friend_id?: string | null
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

export interface Hand {
  id: string
  sequence: number
  wind: Wind
  hand_number: number
  result_type: HandType
  winner_player_id: string | null
  loser_player_id: string | null
  note: string | null
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
  scores: ScoreChange[]
  note?: string
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
