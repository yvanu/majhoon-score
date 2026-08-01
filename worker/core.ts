import type { Context } from 'hono'
import type { Wind } from '../src/shared/types'
import type { Env, ErrorStatus } from './env'

const encoder = new TextEncoder()
const winds: Wind[] = ['east', 'south', 'west', 'north']

export const jsonError = (c: Context<Env>, message: string, status: ErrorStatus = 400) =>
  c.json({ error: message }, status)

export const uid = () => crypto.randomUUID()
export const now = () => new Date().toISOString()
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export function randomHex(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function safeEqual(first: string, second: string) {
  if (first.length !== second.length) return false
  let difference = 0
  for (let index = 0; index < first.length; index++) {
    difference |= first.charCodeAt(index) ^ second.charCodeAt(index)
  }
  return difference === 0
}

export async function derivePassword(password: string, saltHex: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const salt = Uint8Array.from(saltHex.match(/.{2}/g) ?? [], value => Number.parseInt(value, 16))
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    key,
    256,
  )
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function shareCode() {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, byte => characters[byte % characters.length]).join('')
}

export function nextPosition(wind: Wind, hand: number) {
  if (hand < 4) return { wind, hand: hand + 1 }
  const index = winds.indexOf(wind)
  return index < winds.length - 1
    ? { wind: winds[index + 1], hand: 1 }
    : { wind: 'north' as Wind, hand: 4 }
}

export function avatarSeed(name: string) {
  return Math.abs([...name].reduce((value, character) => value * 31 + (character.codePointAt(0) ?? 0), 7))
}
