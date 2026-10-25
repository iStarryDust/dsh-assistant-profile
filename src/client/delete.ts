/**
 * 删除会话的浏览器侧：把请求投进宿主信箱，等它把结果写回来。
 *
 * 与「记住」共用同一套信箱协议（`phase: request` / `done` + id 对账）：本插件没有
 * 自定义 RPC，设置通道里的一个字符串字段就是两侧唯一的通道。删除成功后宿主会发
 * `api-session/removed`，官方 session-controller 据此把侧栏那一行移除——这里不需要
 * 自己动列表。
 *
 * @module @istarry/dsh-assistant-profile/client/delete
 */

import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'

/** 删除结果。 */
export interface DeleteResult {
  /** 是否真的删掉了。 */
  readonly ok: boolean
  /** 成功时 `deleted`；失败时是原因码（界面负责翻译）。 */
  readonly outcome: string
}

/** 信箱字段名。 */
const SIGNAL_FIELD = 'deleteSignal'

/** 等结果的上限：删文件是毫秒级的，给足余量但不至于让人干等。 */
const TIMEOUT_MS = 20_000

/** 信箱形状（只解自己关心的字段）。 */
interface Signal {
  readonly id?: string
  readonly phase?: 'request' | 'done'
  readonly ok?: boolean
  readonly outcome?: string
}

/**
 * 解析信箱字段。
 * @param value - 字段原文。
 * @returns 解析结果；坏数据当空。
 */
function parseSignal(value: unknown): Signal | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    return parsed as Signal
  } catch {
    return undefined
  }
}

/**
 * 请求删除一个会话并等待宿主回话。
 * @param form - 本插件的设置表（`deleteSignal` 所在命名空间）。
 * @param sessionId - 要删除的会话。
 * @returns 删除结果。
 */
export async function requestDelete(
  form: ConfigForm<Record<string, unknown>>,
  sessionId: string,
): Promise<DeleteResult> {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const accepted = await form.set(SIGNAL_FIELD, JSON.stringify({ id, phase: 'request', sessionId }))
  if (!accepted) return { ok: false, outcome: 'settings write refused' }

  return await new Promise<DeleteResult>((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let unsubscribe: () => void = () => {}
    const finish = (value: DeleteResult): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      unsubscribe()
      resolve(value)
    }
    const check = (): void => {
      const signal = parseSignal(form.getSnapshot().value?.[SIGNAL_FIELD])
      if (signal?.phase !== 'done' || signal.id !== id) return
      finish({ ok: signal.ok === true, outcome: signal.outcome ?? '' })
    }
    unsubscribe = form.subscribe(check)
    timer = setTimeout(() => { finish({ ok: false, outcome: 'timed out' }) }, TIMEOUT_MS)
    check()
  })
}
