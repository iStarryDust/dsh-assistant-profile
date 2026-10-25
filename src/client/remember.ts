/**
 * 「记住」按钮的浏览器侧：把一次提炼请求投进宿主信箱，并等它把结果写回来。
 *
 * 本插件没有自定义 RPC，两侧唯一的通道就是设置通道里的 `rememberSignal` 字段：
 * 这里写 `{ phase: 'request' }`，宿主用该会话的模型跑一次提炼后把同一个字段改写成
 * `{ phase: 'done', ... }`。所以「等结果」= 订阅配置快照直到 id 对上。
 *
 * @module @istarry/dsh-assistant-profile/client/remember
 */

import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'

/** 提炼结果。 */
export interface RememberResult {
  /** 是否有条目落进记忆。 */
  readonly saved: boolean
  /** 落盘的条目（成功时）。 */
  readonly entries?: readonly string[]
  /** 结果或失败原因（宿主原文，失败时由界面翻译）。 */
  readonly outcome: string
}

/** 信箱字段名。 */
const SIGNAL_FIELD = 'rememberSignal'

/** 等结果的上限：提炼是一次完整模型调用，给足时间。 */
const TIMEOUT_MS = 120_000

/** 一次请求最多带多少字符，与宿主的截断保持一致。 */
const TEXT_LIMIT = 20000

/** 信箱的形状（只解自己关心的字段）。 */
interface Signal {
  readonly id?: string
  readonly phase?: 'request' | 'done'
  readonly saved?: boolean
  readonly entries?: readonly string[]
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
 * 投递一次提炼请求并等待宿主回话。
 * @param form - 本插件的设置表（`rememberSignal` 所在的命名空间）。
 * @param sessionId - 用哪个会话的模型跑这次提炼。
 * @param text - 选中的对话文本（已带「用户：/助手：」前缀）。
 * @returns 提炼结果；超时或被拒绝时给失败结果。
 */
export async function requestRemember(
  form: ConfigForm<Record<string, unknown>>,
  sessionId: string,
  text: string,
): Promise<RememberResult> {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const request = JSON.stringify({ id, phase: 'request', sessionId, text: text.slice(0, TEXT_LIMIT) })
  const accepted = await form.set(SIGNAL_FIELD, request)
  if (!accepted) return { saved: false, outcome: 'settings write refused' }

  return await new Promise<RememberResult>((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let unsubscribe: () => void = () => {}
    const finish = (value: RememberResult): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      unsubscribe()
      resolve(value)
    }
    const check = (): void => {
      const signal = parseSignal(form.getSnapshot().value?.[SIGNAL_FIELD])
      if (signal?.phase !== 'done' || signal.id !== id) return
      finish({
        saved: signal.saved === true,
        ...signal.entries === undefined ? {} : { entries: signal.entries },
        outcome: signal.outcome ?? '',
      })
    }
    unsubscribe = form.subscribe(check)
    timer = setTimeout(() => { finish({ saved: false, outcome: 'timed out' }) }, TIMEOUT_MS)
    check()
  })
}
