// The existing native Codex OAuth grant, with the same cross-process refresh lock
// as the chat adapter. No browser cookies, auth-file copies, or API-key fallback.
const KEY = 'llm-pi-ai/openai-codex'
function grant(record) {
  const value = record?.payload
  if (record?.kind !== 'grant' || value?.type !== 'oauth' || typeof value.access !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(value.access) || typeof value.refresh !== 'string' || !value.refresh || !Number.isFinite(value.expires)) throw new Error('未找到新版现有 Codex OAuth 登录；不会切换 API Key。请通过原生账号入口登录。')
  return value
}
function claims(value) {
  try { return JSON.parse(Buffer.from(value.access.split('.')[1], 'base64url').toString('utf8'))?.['https://api.openai.com/auth'] ?? {} } catch { return {} }
}
function identity(value) {
  const info = claims(value), accountId = value.accountId || info.chatgpt_account_id
  if (typeof accountId !== 'string' || !/^[a-zA-Z0-9_-]{3,256}$/.test(accountId)) throw new Error('Codex 登录缺少有效账号标识；没有发出图片请求。')
  const plan = info.chatgpt_plan_type
  return { token: value.access, accountId, planHint: ['pro','plus','business','enterprise','edu','free','go','team'].includes(plan) ? plan : 'unknown' }
}
export function createOAuthResolver(credentials, oauth) {
  if (!credentials?.readRecord || !credentials?.modifyRecord || typeof oauth?.refresh !== 'function') throw new Error('GPT 图片所需原生凭据服务未就绪')
  return {
    async inspect(signal) {
      signal?.throwIfAborted()
      const value = grant(await credentials.readRecord(KEY)), info = identity(value)
      return { auth: 'native-codex-oauth-only', planHint: info.planHint, expiresSoon: value.expires <= Date.now() + 30_000, refreshAttempted: false }
    },
    async resolve(signal) {
      signal?.throwIfAborted()
      let record = await credentials.readRecord(KEY), value = grant(record)
      if (value.expires <= Date.now() + 30_000) {
        try {
          record = await credentials.modifyRecord(KEY, async current => {
            const latest = grant(current)
            if (latest.expires > Date.now() + 30_000) return undefined
            signal?.throwIfAborted()
            const next = await oauth.refresh(latest, signal)
            identity(grant({ kind: 'grant', payload: next }))
            return { kind: 'grant', payload: next }
          })
        } catch {
          signal?.throwIfAborted()
          throw new Error('原生 Codex 登录刷新失败；没有发送图片请求，也没有改用 API Key。请检查原生账号登录。')
        }
        value = grant(record)
      }
      signal?.throwIfAborted()
      return identity(value)
    },
  }
}
