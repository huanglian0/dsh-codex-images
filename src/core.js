import { randomUUID } from 'node:crypto'
export const MODEL = 'gpt-image-2'
export const API = 'https://chatgpt.com/backend-api/codex'
const MAX_IMAGE = 20 * 1024 * 1024
const MAX_JSON = 32 * 1024 * 1024
export function imageType(data) {
  const b = Buffer.from(data)
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return ['image/png', 'png']
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return ['image/jpeg', 'jpg']
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return ['image/webp', 'webp']
  throw new Error('输入或输出不是支持的 PNG/JPEG/WebP 图片')
}
export async function boundedBytes(response, limit, signal) {
  const declared = response.headers.get('content-length')
  if (declared && Number(declared) > limit) { await response.body?.cancel().catch(() => {}); throw new Error('图片响应超过大小限制') }
  if (!response.body) throw new Error('图片服务返回空响应')
  const reader = response.body.getReader(), chunks = []
  let size = 0
  try {
    while (true) {
      signal?.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new Error('图片响应超过大小限制')
      chunks.push(Buffer.from(value))
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error }
  finally { reader.releaseLock() }
  return Buffer.concat(chunks, size)
}
export function buildPayload(operation, args, input) {
  if (typeof args.prompt !== 'string' || !args.prompt.trim() || args.prompt.length > 16_000) throw new Error('图片提示词必须为 1–16000 个字符')
  const quality = args.quality ?? 'auto', size = args.size ?? 'auto', background = args.background ?? 'auto'
  if (!['auto','low','medium','high'].includes(quality)) throw new Error('不支持的 quality')
  if (!['auto','1024x1024','1536x1024','1024x1536'].includes(size)) throw new Error('不支持的 size')
  if (!['auto','opaque','transparent'].includes(background)) throw new Error('不支持的 background')
  // These are Codex ImagesClient's typed JSON fields, NOT multipart API-key API.
  const body = { model: MODEL, prompt: args.prompt, n: 1, quality, size, background }
  if (operation === 'edit') {
    if (!input || input.data.byteLength > MAX_IMAGE) throw new Error('编辑输入缺失或超过 20 MiB')
    const [mediaType] = imageType(input.data)
    body.images = [{ image_url: `data:${mediaType};base64,${Buffer.from(input.data).toString('base64')}` }]
  } else if (operation !== 'generate') throw new Error('无效图片操作')
  return body
}
function errorCode(value) {
  const code = value?.error?.code ?? value?.error?.type
  return typeof code === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(code) ? code : 'request_rejected'
}
export function createImageService({ oauth, attachments, readInput, settings = {}, fetchImpl = globalThis.fetch }) {
  if (typeof oauth?.resolve !== 'function' || typeof oauth?.inspect !== 'function' || !attachments?.saveImage || !attachments?.saveFile) throw new Error('GPT 图片原生依赖未就绪')
  let busy = false, lastSuccess = null
  async function status(signal) {
    return { ...(await oauth.inspect(signal)), provider: 'codex-images', model: MODEL, generationEnabled: settings.requestsEnabled === true, usagePool: 'codex-subscription', imageEntitlementTestedInThisProcess: lastSuccess !== null, lastSuccessfulOperation: lastSuccess, apiKeyFallback: false, sentImageRequest: false, note: '只检查原生登录记录；不刷新登录、不请求生图。图片与 Codex 共享订阅用量，不是应急聊天的独立额度。' }
  }
  async function run(operation, args, exec = {}) {
    if (settings.requestsEnabled !== true) throw new Error('GPT 图片请求尚未启用；没有发送请求')
    if (busy) throw new Error('已有 GPT 图片任务执行中；请等待，不要重复提交')
    const signal = AbortSignal.any([...(exec.signal ? [exec.signal] : []), AbortSignal.timeout(300_000)])
    signal.throwIfAborted()
    busy = true
    let sent = false, returnedImage = false, originalPath, requestAuth
    try {
      let input
      if (operation === 'edit') {
        if (typeof args.image_path !== 'string' || !args.image_path.trim() || typeof readInput !== 'function') throw new Error('请提供用户指定的本地 image_path 图片')
        input = await readInput(args.image_path, exec)
        imageType(input.data)
        await attachments.validateImage(input)
      }
      const body = buildPayload(operation, args, input), auth = await oauth.resolve(signal)
      requestAuth = auth
      signal.throwIfAborted()
      const url = API + (operation === 'edit' ? '/images/edits' : '/images/generations')
      sent = true
      const response = await fetchImpl(url, { method: 'POST', redirect: 'error', signal,
        headers: { Authorization: `Bearer ${auth.token}`, 'ChatGPT-Account-ID': auth.accountId, 'Content-Type': 'application/json', Accept: 'application/json', originator: 'dsh_gpt_codex_images', 'User-Agent': 'dsh-gpt-codex-images/0.1.0', 'x-codex-image-turn-id': randomUUID() },
        body: JSON.stringify(body),
      })
      let value
      try { value = JSON.parse((await boundedBytes(response, MAX_JSON, signal)).toString('utf8')) }
      catch { signal.throwIfAborted(); throw new Error(`Codex 图片服务返回无效或过大响应（HTTP ${response.status}）；没有自动重试`) }
      if (!response.ok || value?.error) throw new Error(`Codex 图片请求失败（HTTP ${response.status}，${errorCode(value)}）；没有重试、没有切换聊天接口或 API Key。`)
      if (!Array.isArray(value.data) || value.data.length !== 1) throw new Error('Codex 未返回预期的一张图片；没有重新生成')
      const item = value.data[0], encoded = item?.b64_json
      if (typeof encoded !== 'string' || encoded.length > Math.ceil(MAX_IMAGE / 3) * 4) throw new Error('Codex 图片数据缺失或超过大小限制')
      const data = Buffer.from(encoded, 'base64')
      if (!data.length || data.byteLength > MAX_IMAGE || data.toString('base64') !== encoded) throw new Error('Codex 返回无效 base64 图片')
      const [mediaType, ext] = imageType(data)
      returnedImage = true
      signal.throwIfAborted()
      const name = `gpt-${operation}-${randomUUID()}.${ext}`
      const original = await attachments.saveFile({ data, mediaType, name })
      originalPath = attachments.fileHostPath(original)
      const image = await attachments.saveImage({ data, mediaType, name })
      lastSuccess = operation
      return { model: MODEL, operation, image, original, path: originalPath, auth: 'native-codex-oauth-only', usagePool: 'codex-subscription', quality: value.quality ?? body.quality, size: value.size ?? body.size, background: value.background ?? body.background, requestId: response.headers.get('x-codex-imagegen-request-id') ?? response.headers.get('x-request-id') ?? null, generationId: typeof item.generation_id === 'string' ? item.generation_id : null }
    } catch (error) {
      if (sent && signal.aborted) throw new Error('GPT 图片请求已中断或超时，服务端可能仍在处理；没有自动重试，请勿重复生成。')
      if (returnedImage) throw new Error('图片服务已返回结果，但本地保存或预览失败；没有重新生成。' + (originalPath ? `原图已保存：${originalPath}` : ''))
      let message = String(error?.message ?? 'GPT 图片处理失败')
      for (const secret of [requestAuth?.token, requestAuth?.accountId]) if (secret) message = message.replaceAll(secret, '[redacted]')
      message = message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]')
      throw new Error(message.slice(0, 600))
    } finally { busy = false }
  }
  async function showSaved(args, exec = {}) {
    if(typeof args.image_path!=='string' || !args.image_path.trim() || typeof readInput!=='function')throw new Error('请指定用户要展示的已保存图片 image_path')
    exec.signal?.throwIfAborted()
    const input=await readInput(args.image_path,exec)
    if(input.data.byteLength>MAX_IMAGE)throw new Error('已有图片超过 20 MiB')
    const [mediaType,ext]=imageType(input.data)
    await attachments.validateImage(input)
    const name=input.name || `saved-image.${ext}`, data=Buffer.from(input.data)
    const original=await attachments.saveFile({data,mediaType,name}),image=await attachments.saveImage({data,mediaType,name})
    return {model:'existing-local-image',operation:'show',image,original,path:attachments.fileHostPath(original),auth:'not-used',usagePool:'none-tool-local-only'}
  }
  return { status, generate: (args, exec) => run('generate', args, exec), edit: (args, exec) => run('edit', args, exec), showSaved }
}
