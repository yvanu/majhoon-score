export type Wind = 'east' | 'south' | 'west' | 'north'
export type MatchStatus = 'active' | 'finished'
export type HandType = 'tsumo' | 'ron' | 'draw' | 'custom'

export interface Player {
  id: string
  name: string
  avatar_seed: number
  seat: number
  score: number
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
export interface ScoreChange { playerId: string; change: number }
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
export interface Stats { totalHands: number; players: PlayerStat[] }
