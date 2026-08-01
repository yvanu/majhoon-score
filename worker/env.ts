export type Bindings = {
  DB: D1Database
  WECHAT_APP_ID: string
  WECHAT_APP_SECRET: string
}

export type Env = { Bindings: Bindings }
export type ErrorStatus = 400 | 401 | 404 | 409 | 500 | 502 | 503

export type WechatSessionResponse = {
  openid?: string
  session_key?: string
  unionid?: string
  errcode?: number
  errmsg?: string
}
