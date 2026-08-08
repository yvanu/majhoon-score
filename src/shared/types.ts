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
export type GroupSessionStatus = 'recruiting' | 'full' | 'active' | 'finished' | 'cancelled'
export type GroupMemberStatus = 'invited' | 'confirmed'
export type GroupChatStatus = 'active' | 'readonly'
export type GroupChatMessageType = 'text' | 'system'
export type MatchLobbyStatus = 'preparing' | 'started' | 'cancelled'

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
  avatar_url: string | null
  gender: UserGender | null
  friend_id?: string | null
  user_id?: string | null
  seat: number
  score: number
}

export interface Friend {
  id: string
  source?: 'manual' | 'wechat'
  name: string
  avatar_seed: number
  avatarUrl?: string | null
  note?: string | null
  linkedUserId: string | null
  wechatName: string | null
  wechatAvatarUrl: string | null
  wechatGender: UserGender | null
  jointMatches: number
  winRate?: number
  netScore: number
  gangKaiWins: number
  gangKaiAgainst: number
  lastPlayedAt: string | null
}

export interface KnownUser {
  id: string
  displayName: string
  avatarUrl: string | null
  gender: UserGender | null
  lastPlayedAt: string | null
}

export interface FriendPatternStat {
  name: string
  count: number
}

export interface ScoreTrendPoint {
  matchId: string
  createdAt: string
  score: number
  location?: string | null
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
  myWins: number
  friendWins: number
  myDealInsToFriend: number
  friendDealInsToMe: number
  netScore: number
  trend: ScoreTrendPoint[]
}

export interface MatchPlayerInput {
  name: string
  friendId?: string
  isSelf?: boolean
}

export interface MatchLobbyMember {
  id: string
  userId: string | null
  friendId: string | null
  name: string
  avatarSeed: number
  avatarUrl: string | null
  gender: UserGender | null
  joinedAt: string
}

export interface MatchLobby {
  id: string
  shareCode: string
  ownerUserId: string
  status: MatchLobbyStatus
  matchId: string | null
  members: MatchLobbyMember[]
  isOwner: boolean
  isMember: boolean
  createdAt: string
  updatedAt: string
}

export interface GroupSessionMember {
  id: string
  user_id: string | null
  friend_id: string | null
  name: string
  avatar_seed: number
  avatar_url: string | null
  gender: UserGender | null
  role: 'owner' | 'member'
  status: GroupMemberStatus
  joined_at: string
}

export interface GroupChatMessage {
  id: string
  room_id: string
  sender_user_id: string | null
  sender_name: string | null
  sequence: number
  message_type: GroupChatMessageType
  content: string
  event_type: string | null
  payload: Record<string, unknown> | null
  client_message_id: string | null
  created_at: string
  recalled_at: string | null
}

export interface GroupChatRoomSnapshot {
  id: string
  group_session_id: string
  status: GroupChatStatus
  latest_sequence: number
}

export interface GroupChatSnapshot {
  room: GroupChatRoomSnapshot
  messages: GroupChatMessage[]
}

export interface GroupSessionSummary {
  id: string
  share_code: string
  owner_user_id: string
  owner_name: string
  start_at: string
  location: string
  note: string | null
  capacity: number
  status: GroupSessionStatus
  confirmed_count: number
  invited_count: number
  match_id: string | null
  created_at: string
  updated_at: string
  chat_unread_count: number
  chat_last_message_preview: string | null
  chat_last_message_at: string | null
  members: GroupSessionMember[]
  is_owner: boolean
  is_member: boolean
}

export interface GroupSession extends GroupSessionSummary {}

export interface GroupSessionInput {
  startAt: string
  location: string
  note?: string
  friendIds?: string[]
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
  status?: MatchStatus
  finished_at?: string | null
  retained_dealer?: boolean
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

export interface BigHandRecord {
  handId: string
  matchId: string
  resultType: 'ron' | 'tsumo'
  note: string
  score: number
  createdAt: string
  tileRecord: HandTileRecord | null
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
  netScore: number
  trend: ScoreTrendPoint[]
  patterns: PersonalPatternStat[]
  featuredBigHand: FeaturedBigHand | null
  bigHandRecords: BigHandRecord[]
}

export interface UserPreferences {
  hapticFeedback: boolean
  quickScores: [number, number]
  quickAdjustStep: number
  defaultMultiRon: boolean
  clearScoreStateAfterSave: boolean
  showSettlementPreview: boolean
  autoSortTileRecord: boolean
  highlightMatchingTiles: boolean
  eventDefaults: Record<InHandEventType, number>
  defaultGroupLocation: string
  defaultGroupLeadMinutes: 30 | 60 | 120
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

export type UserGender = 'male' | 'female'

export interface AuthUser {
  id: string
  username: string
  display_name: string | null
  gender: UserGender | null
  avatar_url: string | null
  created_at: string
}

export interface UserProfileInput {
  displayName: string
  gender: UserGender
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
  is_owner: boolean
  current_wind: Wind
  current_hand: number
  created_at: string
  updated_at?: string
  finished_at: string | null
  hand_count: number
  self_score: number
  player_names: string[]
}
