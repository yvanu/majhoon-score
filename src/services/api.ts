import Taro from '@tarojs/taro'
import type { AuthResult, AuthUser, DailyStats, Friend, FriendStatistics, GroupMemberStatus, GroupSession, GroupSessionInput, GroupSessionSummary, HandInput, HandMutationResult, Match, MatchPlayerInput, MatchSummary, PersonalStatistics, StatisticsDimension, Stats } from '@shared/types'

export const AUTH_KEY = 'mahjong-auth-token'
export const CURRENT_KEY = 'mahjong-current'

export const API_BASE_URL = process.env.TARO_APP_API_BASE || ''

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

export const api = {
  me: () => request<{ user: AuthUser }>('/api/auth/me'),
  wechatLogin: (code: string) => request<AuthResult>('/api/auth/wechat', 'POST', { code }),
  logout: () => request('/api/auth/logout', 'POST'),
  updateProfile: (displayName: string) => request<{ user: AuthUser }>('/api/me/profile', 'PUT', { displayName }),
  history: () => request<{ matches: MatchSummary[] }>('/api/me/matches'),
  recentMatch: () => request<{ matches: MatchSummary[] }>('/api/me/matches', 'GET', { limit: 1 }),
  dailyStatistics: () => request<DailyStats>('/api/me/daily-statistics'),
  personalStatistics: (dimension: StatisticsDimension, value: string, timezoneOffset: number) =>
    request<PersonalStatistics>(`/api/me/statistics?dimension=${dimension}&value=${encodeURIComponent(value)}&timezoneOffset=${timezoneOffset}`),
  friends: (summary = false) => request<{ friends: Friend[] }>(`/api/me/friends${summary ? '?summary=1' : ''}`),
  friendStatistics: (friendId: string) => request<FriendStatistics>(`/api/me/friends/${encodeURIComponent(friendId)}/statistics`),
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
  startGroupSession: (groupId: string) => request<{ group: GroupSession; match: Match; adminToken: string }>(`/api/group-sessions/${encodeURIComponent(groupId)}/start`, 'POST'),
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
