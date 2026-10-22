/**
 * 助理档案的浏览器侧状态：官方设置通道（`configForms`）上的一层薄包装。
 *
 * 档案存在 profile 的配置里，服务端一侧就是插件自己的 volatile 字段，所以这里既
 * 不写自定义 RPC，也不碰文件——`configForms.get(entryId)` 给出读快照、订阅与原子
 * 写入；页面和侧栏名plate共用这一个 store。
 *
 * @module @istarry/dsh-assistant-profile/client/store
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'

/** 设置命名空间 = profile 里的插件条目 id，两者由 cordis.patch.yml 定死。 */
export const ENTRY_ID = 'assistant-profile'

/** 档案四个字段。 */
export interface ProfileValues {
  /** 助理名：进提示词，也是侧栏显示名。 */
  readonly name: string
  /** 一句话风格。 */
  readonly style: string
  /** 回复语言。 */
  readonly language: string
  /** 人格提示词正文。 */
  readonly persona: string
}

/** 未写过任何档案时的默认值，与宿主 schema 的默认值一致。 */
export const DEFAULT_VALUES: ProfileValues = {
  name: '大肥鱼',
  style: '',
  language: '中文',
  persona: '',
}

/** 页面与名plate共用的快照。 */
export interface ProfileSnapshot {
  /** 设置通道状态。 */
  readonly status: 'loading' | 'ready' | 'unavailable'
  /** 已生效的档案。 */
  readonly values: ProfileValues
  /** Host 是否接受写入。 */
  readonly writable: boolean
  /** 是否有一次保存在飞。 */
  readonly pending: boolean
  /** 上一次保存被拒绝/抛错的原因。 */
  readonly failure: string | undefined
}

/** 保存结果。 */
export interface SaveResult {
  /** 是否已写进 Host。 */
  readonly ok: boolean
  /** 失败原因；成功时 undefined。 */
  readonly reason?: string
}

/** 浏览器侧档案服务。 */
export interface ProfileStore {
  /** @returns 当前快照（下一次变更前引用稳定）。 */
  getSnapshot(): ProfileSnapshot
  /**
   * 订阅快照变更。
   * @param listener - 变更回调。
   * @returns 取消订阅。
   */
  subscribe(listener: () => void): () => void
  /**
   * 把一份档案写回 Host：只写真正变化的字段，一次原子 mutate。
   * @param next - 页面上的草稿值。
   * @returns 保存结果。
   */
  save(next: ProfileValues): Promise<SaveResult>
}

/** 四个字段的读写顺序。 */
const FIELDS = ['name', 'style', 'language', 'persona'] as const

/**
 * 把 Host 返回值叠加到默认值上：Host 只给用户改过的字段，缺的用默认。
 * @param value - 设置通道解出的 section。
 * @returns 完整档案。
 */
function merge(value: unknown): ProfileValues {
  if (typeof value !== 'object' || value === null) return DEFAULT_VALUES
  const record = value as Record<string, unknown>
  const pick = (key: keyof ProfileValues): string => {
    const candidate = record[key]
    return typeof candidate === 'string' ? candidate : DEFAULT_VALUES[key]
  }
  return { name: pick('name'), style: pick('style'), language: pick('language'), persona: pick('persona') }
}

/**
 * 建立一个档案 store。
 * @param ctx - 浏览器根上下文（需已注入 `configForms`）。
 * @returns 只读快照 + 保存入口。
 */
export function createProfileStore(ctx: ClientContext): ProfileStore {
  const form = ctx.configForms.get<Partial<ProfileValues>>(ENTRY_ID)
  const listeners = new Set<() => void>()
  let pending = false
  let failure: string | undefined
  let snapshot: ProfileSnapshot = {
    status: 'loading',
    values: DEFAULT_VALUES,
    writable: false,
    pending: false,
    failure: undefined,
  }

  const publish = (): void => {
    const state = form.getSnapshot()
    snapshot = {
      status: state.status,
      values: merge(state.value),
      writable: state.writable,
      pending,
      failure,
    }
    for (const listener of [...listeners]) listener()
  }

  form.subscribe(publish)
  publish()

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    save: async (next) => {
      const ops = FIELDS
        .filter(field => next[field] !== snapshot.values[field])
        .map(field => ({ op: 'set' as const, path: [field], value: next[field] }))
      if (ops.length === 0) {
        failure = undefined
        publish()
        return { ok: true }
      }
      pending = true
      failure = undefined
      publish()
      try {
        // 一次 mutate = 一次修订围栏：四个字段要么一起落盘，要么都不动。
        const accepted = await form.mutate(ops as never)
        if (!accepted) {
          failure = snapshot.status === 'unavailable' ? undefined : 'refused'
          return { ok: false, reason: failure }
        }
        return { ok: true }
      } catch (error) {
        failure = String(error)
        return { ok: false, reason: failure }
      } finally {
        pending = false
        publish()
      }
    },
  }
}
