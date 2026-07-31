import Taro from '@tarojs/taro'
import type { AuthResult, AuthUser, DailyStats, HandInput, Match, MatchSummary, Stats } from '@shared/types'

export const AUTH_KEY = 'mahjong-auth-token'
export const CURRENT_KEY = 'mahjong-current'

const baseUrl = process.env.TARO_APP_API_BASE || ''

type RequestError = Error & { errMsg?: string }

async function request<T>(path: string, method: keyof Taro.request.Method = 'GET', data?: unknown, adminToken = ''): Promise<T> {
  const auth = Taro.getStorageSync<string>(AUTH_KEY)
  try {
    const response = await Taro.request<T & { error?: string }>({
      url: `${baseUrl}${path}`,
      method,
      data,
      timeout: 15_000,
      header: {
        'content-type': 'application/json',
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
  login: (username: string, password: string, register: boolean) =>
    request<AuthResult>(register ? '/api/auth/register' : '/api/auth/login', 'POST', { username, password }),
  logout: () => request('/api/auth/logout', 'POST'),
  history: () => request<{ matches: MatchSummary[] }>('/api/me/matches'),
  dailyStatistics: () => request<DailyStats>('/api/me/daily-statistics'),
  deleteHistoryMatch: (matchId: string) => request(`/api/me/matches/${matchId}`, 'DELETE'),
  createMatch: (players: string[]) => request<{ match: Match; adminToken: string }>('/api/matches', 'POST', { players }),
  getMatch: (idOrCode: string) => request<{ match: Match }>(`/api/matches/${encodeURIComponent(idOrCode)}`),
  addHand: (matchId: string, input: HandInput, token: string) =>
    request<{ match: Match }>(`/api/matches/${matchId}/hands`, 'POST', input, token),
  undo: (matchId: string, token: string) => request<{ match: Match }>(`/api/matches/${matchId}/hands/last`, 'DELETE', undefined, token),
  finish: (matchId: string, token: string) => request<{ match: Match }>(`/api/matches/${matchId}/finish`, 'POST', undefined, token),
  statistics: (matchId: string) => request<Stats>(`/api/matches/${matchId}/statistics`),
  claim: (matchId: string, token: string) => request(`/api/matches/${matchId}/claim`, 'POST', undefined, token),
}
