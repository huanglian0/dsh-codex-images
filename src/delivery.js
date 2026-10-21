// Use native successful tool-result delivery; no model-supplied file paths.
export function createImageDelivery(ctx) {
  const pending = new WeakMap()
  ctx.on('tools/result', (exec, result) => {
    const delivery = pending.get(exec)
    pending.delete(exec)
    if (!delivery || result.isError) return
    try { delivery.session.append('deliverables/presented', { turn: delivery.turn, callId: exec.callId, files: delivery.files }) }
    catch { console.warn('[gpt-codex-images] Original remains saved; file-card recording failed. Do not regenerate.') }
  })
  return (value, exec) => {
    if (!exec.agent) return
    const boundary = ctx.sessionProjections.stateOf(exec.agent.session, 'turnBoundary')
    if (!boundary || boundary.openTurnStartSeq === null) return
    pending.set(exec, { session: exec.agent.session, turn: boundary.lastTurn, files: [{ path: value.path, description: value.operation === 'edit' ? 'GPT 改图原图（未缩放）' : value.operation === 'show' ? '已保存图片原图（未缩放、未重新生成）' : 'GPT 生成原图（未缩放）' }] })
  }
}
