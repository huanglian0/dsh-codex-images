import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createOAuthResolver } from './auth.js'
import { createImageService, imageType, MODEL } from './core.js'
import { createImageDelivery } from './delivery.js'
export const name = 'gpt-codex-images'
export const inject = ['tools', 'attachments', 'credentials', 'fs', 'workingDirectory', 'sessionProjections']
export function createToolDefinitions(defineTool, service, delivered = () => {}) {
  const parameters = {
    prompt: { type: 'string', required: true, description: 'The user-requested image generation/edit instruction, 1–16000 characters.' },
    quality: { type: 'string', enum: ['auto','low','medium','high'], description: 'Default auto. Uses Codex subscription usage.' },
    size: { type: 'string', enum: ['auto','1024x1024','1536x1024','1024x1536'], description: 'Default auto.' },
    background: { type: 'string', enum: ['auto','opaque','transparent'], description: 'Default auto. Select transparent for a requested cutout or transparent PNG.' },
  }
  const output = { schema: { type: 'json' }, render: (_args, value) => [
    { type: 'text', text: `${value.operation === 'show' ? '已有图片 · 仅本地展示，未重新生成' : MODEL + ' · ' + value.operation}\n图片自动显示在本轮回复下方并可点击放大，另附未缩放原图文件卡片。请简短说明结果，不要只回复路径，不必重复 present。\n后续改图使用的原图路径：${value.path}\n${value.operation === 'show' ? '此展示工具未调用任何图片 API，也未刷新账号。' : '账号：现有 ChatGPT OAuth；使用 Codex 订阅用量，不是独立应急聊天额度。'}${value.deliveryWarning ? '\n' + value.deliveryWarning : ''}` },
    { type: 'image', attachment: value.image }, { type: 'file', attachment: value.original },
  ] }
  const run = operation => async (args, exec) => {
    const value = await service[operation](args, exec)
    try { delivered(value, exec) } catch { value.deliveryWarning = '原图已保存，但文件卡片登记失败；不要重复生成，需要原图时再 present。' }
    return value
  }
  return [
    defineTool({ name: 'codex_image_show_saved', description: 'Show one specific user-authorized already-saved PNG/JPEG/WebP locally, without generating or editing it, reading OAuth, or calling any image API. Use to display a previous saved image instead of regenerating it. Never substitute it for a new generation request.', parameters: { image_path: { type: 'string', required: true, description: 'The exact saved local image the user wants to see, resolved through the native sandbox filesystem.' } }, output, timeoutMs: 30_000, isConcurrencySafe: () => true, execute: run('showSaved') }),
    defineTool({ name: 'codex_image_status', description: 'Read-only local GPT Image/Codex OAuth wiring status. Does not refresh credentials or test image entitlement, generate images, or query paid API services.', parameters: {}, output: { schema: { type: 'json' }, render: (_a, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] }, timeoutMs: 30_000, isConcurrencySafe: () => true, execute: (_args, exec) => service.status(exec.signal) }),
    defineTool({ name: 'codex_image_generate', description: 'Generate exactly one GPT Image 2 image through the official Codex image protocol and existing native ChatGPT OAuth. Use when the user selects GPT/OpenAI/Codex image generation; do not silently substitute it for Grok. Call only for an explicit image request. If plugin config has enabled image requests, do not ask for per-image quota confirmation. No automatic retries, chat fallback, API-key fallback, or attempts to evade limits.', parameters, output, timeoutMs: 300_000, isConcurrencySafe: () => false, execute: run('generate') }),
    defineTool({ name: 'codex_image_edit', description: 'Edit one user-authorized local PNG/JPEG/WebP using GPT Image 2 through Codex OAuth. Uploads only the selected image. Use for an explicit GPT/OpenAI/Codex image-edit request. No automatic retry or switch to Grok, web chat, or API keys. If plugin config has enabled image requests, do not ask for per-image quota confirmation.', parameters: { ...parameters, image_path: { type: 'string', required: true, description: 'The specific local image authorized by the user, resolved using the native sandbox filesystem.' } }, output, timeoutMs: 300_000, isConcurrencySafe: () => false, execute: run('edit') }),
  ]
}
export async function apply(ctx, config = {}) {
  if (typeof config.installRoot !== 'string' || !path.isAbsolute(config.installRoot) || typeof config.dataHome !== 'string' || !path.isAbsolute(config.dataHome)) throw new Error('GPT images require explicit installRoot and dataHome')
  const expected = path.join(path.resolve(config.dataHome), 'attachments', 'v1'), actual = ctx.attachments.root
  const norm = value => process.platform === 'win32' ? value.toLowerCase() : value
  if (typeof actual !== 'string' || norm(path.resolve(actual)) !== norm(expected)) throw new Error('GPT images refuse a mismatched attachment store')
  const sdk = p => import(pathToFileURL(path.join(config.installRoot, 'resources/app.asar/dsh/node_modules', p)).href)
  const { defineTool } = await sdk('@deepseek-ai/dsh-tools/lib/index.js')
  const { openaiCodexOAuth } = await sdk('@earendil-works/pi-ai/dist/auth/oauth/openai-codex.js')
  const oauth = createOAuthResolver(ctx.credentials, openaiCodexOAuth)
  const readInput = async (requestedPath, exec) => {
    const cwd = exec.agent ? await ctx.workingDirectory.ensure(exec.agent, exec.signal) : undefined
    const target = await ctx.fs.resolve(requestedPath, { ...(cwd ? { cwd } : {}), signal: exec.signal })
    const info = await ctx.fs.stat(target, exec.signal)
    if (!info || info.type !== 'file') throw new Error('输入图片不是可读取的普通文件')
    const data = await ctx.fs.readBytes(target, exec.signal, Math.min(20 * 1024 * 1024, ctx.attachments.imageLimits.maxImageBytes))
    const [mediaType] = imageType(data)
    ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec)
    return { data, mediaType, name: path.basename(target.displayPath) }
  }
  const service = createImageService({ oauth, attachments: ctx.attachments, readInput, settings: { requestsEnabled: config.requestsEnabled === true } })
  for (const tool of createToolDefinitions(defineTool, service, createImageDelivery(ctx))) ctx.tools.register(tool)
  console.info(`[gpt-codex-images] Registered local-show/status/generate/edit tools; image requests ${config.requestsEnabled === true ? 'enabled' : 'disabled'}.`)
}
