import Taro from '@tarojs/taro'
import type { AuthResult, AuthUser, DailyStats, Friend, FriendStatistics, GroupChatMessage, GroupChatSnapshot, GroupMemberStatus, GroupSession, GroupSessionInput, GroupSessionSummary, HandInput, HandMutationResult, KnownUser, Match, MatchLobby, MatchPlayerInput, MatchSummary, PersonalStatistics, StatisticsDimension, Stats, UserProfileInput } from '@shared/types'

export const AUTH_KEY = 'mahjong-auth-token'
export const CURRENT_KEY = 'mahjong-current'

export const API_BASE_URL = process.env.TARO_APP_API_BASE || ''

export function groupChatSocketUrl(groupId: string) {
  const base = API_BASE_URL.replace(/\/$/, '').replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
  return `${base}/api/group-sessions/${encodeURIComponent(groupId)}/chat/socket`
}

export function resolveAssetUrl(value: string | null | undefined) {
  if (!value) return ''
  return /^https?:\/\//i.test(value) ? value : `${API_BASE_URL}${value}`
}

export function matchLobbyQrUrl(idOrCode: string) {
  return `${API_BASE_URL}/api/match-lobbies/${encodeURIComponent(idOrCode)}/qr`
}

type RequestError = Error & { errMsg?: string }

async function request<T>(path: string, method: keyof Taro.request.Method = 'GET', data?: unknown, adminToken = ''): Promise<T> {
  const auth = Taro.getStorageSync<string>(AUTH_KEY)
  try {
    const response = await Taro.request<T & { error?: string }>({
      url: `${API_BASE_URL}${path}`,
      method,
      data,
      timeout: 15_000,
      header: {
        'content-type': 'application/json',
        'x-match-response': 'hand-delta-v1',
        ...(auth ? { authorization: `Bearer ${auth}` } : {}),
        ...(adminToken ? { 'x-admin-token': adminToken } : {}),
      },
    })
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(response.data?.error || `请求失败（${response.statusCode}）`)
    }
    return response.data
  } catch (error) {
    const detail = error as RequestError
    throw new Error(detail.message || detail.errMsg || '网络请求失败')
  }
}

async function uploadProfileAvatar(filePath: string) {
  const auth = Taro.getStorageSync<string>(AUTH_KEY)
  if (!auth) throw new Error('请先登录')
  const response = await Taro.uploadFile({
    url: `${API_BASE_URL}/api/me/avatar`,
    filePath,
    name: 'file',
    header: { authorization: `Bearer ${auth}` },
    timeout: 15_000,
  })
  let payload: { user?: AuthUser; error?: string } = {}
  try {
    payload = JSON.parse(response.data || '{}')
  } catch {
    throw new Error('头像上传响应异常')
  }
  if (response.statusCode < 200 || response.statusCode >= 300 || !payload.user) {
    throw new Error(payload.error || `头像上传失败（${response.statusCode}）`)
  }
  return payload.user
}

async function uploadFriendAvatar(friendId: string, filePath: string) {
  const auth = Taro.getStorageSync<string>(AUTH_KEY)
  if (!auth) throw new Error('请先登录')
  const response = await Taro.uploadFile({
    url: `${API_BASE_URL}/api/me/friends/${encodeURIComponent(friendId)}/avatar`,
    filePath,
    name: 'file',
    header: { authorization: `Bearer ${auth}` },
    timeout: 15_000,
  })
  let payload: { avatarUrl?: string; error?: string } = {}
  try {
    payload = JSON.parse(response.data || '{}')
  } catch {
    throw new Error('牌友头像上传响应异常')
  }
  if (response.statusCode < 200 || response.statusCode >= 300 || !payload.avatarUrl) {
    throw new Error(payload.error || `牌友头像上传失败（${response.statusCode}）`)
  }
  return payload.avatarUrl
}

export const api = {
  me: () => request<{ user: AuthUser }>('/api/auth/me'),
  wechatLogin: (code: string) => request<AuthResult>('/api/auth/wechat', 'POST', { code }),
  logout: () => request('/api/auth/logout', 'POST'),
  updateProfile: (profile: UserProfileInput) => request<{ user: AuthUser }>('/api/me/profile', 'PUT', profile),
  uploadProfileAvatar,
  history: () => request<{ matches: MatchSummary[] }>('/api/me/matches'),
  recentMatch: () => request<{ matches: MatchSummary[] }>('/api/me/matches', 'GET', { limit: 1 }),
  dailyStatistics: (date: string, timezoneOffset: number) => request<DailyStats>(`/api/me/daily-statistics?date=${encodeURIComponent(date)}&timezoneOffset=${timezoneOffset}`),
  personalStatistics: (dimension: StatisticsDimension, value: string, timezoneOffset: number) =>
    request<PersonalStatistics>(`/api/me/statistics?dimension=${dimension}&value=${encodeURIComponent(value)}&timezoneOffset=${timezoneOffset}`),
  friends: (summary = false) => request<{ friends: Friend[] }>(`/api/me/friends${summary ? '?summary=1' : ''}`),
  createFriend: (name: string, note: string) => request<{ friend: Friend }>('/api/me/friends', 'POST', { name, note }),
  uploadFriendAvatar,
  friendStatistics: (friendId: string) => request<FriendStatistics>(`/api/me/friends/${encodeURIComponent(friendId)}/statistics`),
  userStatistics: (userId: string) => request<FriendStatistics>(`/api/me/users/${encodeURIComponent(userId)}/statistics`),
  knownUsers: () => request<{ users: KnownUser[] }>('/api/me/known-users'),
  linkFriend: (friendId: string, linkedUserId: string) => request<{ ok: true }>(`/api/me/friends/${encodeURIComponent(friendId)}/link`, 'PUT', { linkedUserId }),
  unlinkFriend: (friendId: string) => request<{ ok: true }>(`/api/me/friends/${encodeURIComponent(friendId)}/link`, 'DELETE'),
  createMatchLobby: () => request<{ lobby: MatchLobby }>('/api/match-lobbies', 'POST'),
  getMatchLobby: (idOrCode: string) => request<{ lobby: MatchLobby }>(`/api/match-lobbies/${encodeURIComponent(idOrCode)}`),
  joinMatchLobby: (idOrCode: string) => request<{ lobby: MatchLobby }>(`/api/match-lobbies/${encodeURIComponent(idOrCode)}/join`, 'POST'),
  addMatchLobbyMember: (lobbyId: string, input: { source: 'self' | 'friend' | 'guest'; friendId?: string; name?: string }) =>
    request<{ lobby: MatchLobby }>(`/api/match-lobbies/${encodeURIComponent(lobbyId)}/members`, 'POST', input),
  removeMatchLobbyMember: (lobbyId: string, memberId: string) =>
    request<{ lobby: MatchLobby }>(`/api/match-lobbies/${encodeURIComponent(lobbyId)}/members/${encodeURIComponent(memberId)}`, 'DELETE'),
  cancelMatchLobby: (lobbyId: string) => request<{ lobby: MatchLobby }>(`/api/match-lobbies/${encodeURIComponent(lobbyId)}/cancel`, 'POST'),
  startMatchLobby: (lobbyId: string, memberIds: string[]) => request<{ lobby: MatchLobby; match: Match; adminToken: string }>(`/api/match-lobbies/${encodeURIComponent(lobbyId)}/start`, 'POST', { memberIds }),
  groupSessions: () => request<{ groups: GroupSessionSummary[] }>('/api/group-sessions'),
  createGroupSession: (input: GroupSessionInput) => request<{ group: GroupSession }>('/api/group-sessions', 'POST', input),
  getGroupSession: (idOrCode: string) => request<{ group: GroupSession }>(`/api/group-sessions/${encodeURIComponent(idOrCode)}`),
  joinGroupSession: (groupId: string) => request<{ group: GroupSession }>(`/api/group-sessions/${encodeURIComponent(groupId)}/join`, 'POST'),
  leaveGroupSession: (groupId: string) => request<{ group: GroupSession }>(`/api/group-sessions/${encodeURIComponent(groupId)}/leave`, 'POST'),
  updateGroupMember: (groupId: string, memberId: string, status: GroupMemberStatus) => request<{ group: GroupSession }>(
    `/api/group-sessions/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberId)}`,
    'PUT',
    { status },
  ),
  removeGroupMember: (groupId: string, memberId: string) => request<{ group: GroupSession }>(
    `/api/group-sessions/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberId)}`,
    'DELETE',
  ),
  cancelGroupSession: (groupId: string) => request<{ group: GroupSession }>(`/api/group-sessions/${encodeURIComponent(groupId)}/cancel`, 'POST'),
  startGroupSession: (groupId: string, memberIds: string[]) => request<{ group: GroupSession; match: Match; adminToken: string }>(`/api/group-sessions/${encodeURIComponent(groupId)}/start`, 'POST', { memberIds }),
  groupChat: (groupId: string, after = 0) => request<GroupChatSnapshot>(
    `/api/group-sessions/${encodeURIComponent(groupId)}/chat${after > 0 ? `?after=${after}` : ''}`,
  ),
  sendGroupChatMessage: (groupId: string, content: string, clientMessageId: string) => request<{ message: GroupChatMessage }>(
    `/api/group-sessions/${encodeURIComponent(groupId)}/chat/messages`,
    'POST',
    { content, clientMessageId },
  ),
  markGroupChatRead: (groupId: string, sequence: number) => request<{ ok: true }>(
    `/api/group-sessions/${encodeURIComponent(groupId)}/chat/read`,
    'POST',
    { sequence },
  ),
  deleteHistoryMatch: (matchId: string) => request(`/api/me/matches/${matchId}`, 'DELETE'),
  createMatch: (players: MatchPlayerInput[]) => request<{ match: Match; adminToken: string }>('/api/matches', 'POST', { players }),
  getMatch: (idOrCode: string, includeStatistics = false, adminToken = '', readOnly = false) => {
    const query = [includeStatistics ? 'includeStatistics=1' : '', readOnly ? 'readonly=1' : ''].filter(Boolean).join('&')
    return request<{ match: Match; stats?: Stats; canEdit: boolean }>(
      `/api/matches/${encodeURIComponent(idOrCode)}${query ? `?${query}` : ''}`,
      'GET',
      undefined,
      adminToken,
    )
  },
  addHand: (matchId: string, input: HandInput, token: string) =>
    request<HandMutationResult>(`/api/matches/${matchId}/hands`, 'POST', input, token),
  updateHand: (matchId: string, handId: string, input: HandInput, token: string) =>
    request<HandMutationResult>(`/api/matches/${matchId}/hands/${handId}`, 'PUT', input, token),
  undo: (matchId: string, token: string) => request<{ match: Match }>(`/api/matches/${matchId}/hands/last`, 'DELETE', undefined, token),
  finish: (matchId: string, token: string) => request<{ match: Match }>(`/api/matches/${matchId}/finish`, 'POST', undefined, token),
  statistics: (matchId: string) => request<Stats>(`/api/matches/${matchId}/statistics`),
  claim: (matchId: string, token: string) => request(`/api/matches/${matchId}/claim`, 'POST', undefined, token),
}
