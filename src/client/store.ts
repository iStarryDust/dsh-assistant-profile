/**
 * Agent助理的浏览器侧状态：官方设置通道（`configForms`）上的一层薄包装。
 *
 * 档案存在 profile 的配置里，服务端一侧就是插件自己的 volatile 字段，所以这里既
 * 不写自定义 RPC，也不碰文件——`configForms.get(entryId)` 给出读快照、订阅与原子
 * 写入；页面和侧栏名plate共用这一个 store。
 *
 * 自定义人格（「另存」产物）整体序列化成 JSON 存在 `customsJson` 一个标量字段里，
 * 每次增删都整包写回：设置通道对标量最稳，嵌套结构由这里负责。
 *
 * @module @istarry/dsh-assistant-profile/client/store
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'

/** 设置命名空间 = profile 里的插件条目 id，两者由 cordis.patch.yml 定死。 */
export const ENTRY_ID = 'assistant-profile'

/** 档案三个字段。 */
export interface ProfileValues {
  /** 助理名：进提示词，也是侧栏显示名。 */
  readonly name: string
  /** 回复语言。 */
  readonly language: string
  /** 人格提示词正文。 */
  readonly persona: string
}

/** 一份「另存」的自定义人格。 */
export interface CustomPersona {
  /** 保存时的「名称」，也是列表里显示的名字。 */
  readonly name: string
  readonly language: string
  readonly persona: string
}

/** 三栏全空的档案（没有任何内容可注入时的形态）。 */
export const EMPTY_VALUES: ProfileValues = { name: '', language: '', persona: '' }

/** 页面与名plate共用的快照。 */
export interface ProfileSnapshot {
  /** 设置通道状态。 */
  readonly status: 'loading' | 'ready' | 'unavailable'
  /** 已生效的档案。 */
  readonly values: ProfileValues
  /** 「另存」的自定义人格，按保存顺序。 */
  readonly customs: readonly CustomPersona[]
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
  /**
   * 「另存」：把当前草稿存成一份自定义人格，重名覆盖。
   * @param entry - 以「名称」为名的完整档案。
   * @returns 保存结果。
   */
  saveCustom(entry: CustomPersona): Promise<SaveResult>
  /**
   * 删除一份自定义人格。
   * @param name - 要删除的那份的名字。
   * @returns 保存结果。
   */
  removeCustom(name: string): Promise<SaveResult>
}

/** 档案三字段的读写顺序。 */
const FIELDS = ['name', 'language', 'persona'] as const

/** 从设置通道的 section 里读自定义人格数组；坏数据一律当空。 */
function customsOf(section: unknown): CustomPersona[] {
  if (typeof section !== 'object' || section === null) return []
  const raw = (section as Record<string, unknown>)['customsJson']
  if (typeof raw !== 'string' || raw.trim() === '') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const list: CustomPersona[] = []
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue
      const record = item as Record<string, unknown>
      const name = record['name']
      if (typeof name !== 'string' || name.trim() === '') continue
      list.push({
        name,
        language: typeof record['language'] === 'string' ? record['language'] : '',
        persona: typeof record['persona'] === 'string' ? record['persona'] : '',
      })
    }
    return list
  } catch {
    return []
  }
}

/**
 * 把 Host 返回值读成档案：Host 只给写过的字段，缺的当空。
 * @param value - 设置通道解出的 section。
 * @returns 完整档案。
 */
function merge(value: unknown): ProfileValues {
  if (typeof value !== 'object' || value === null) return EMPTY_VALUES
  const record = value as Record<string, unknown>
  const pick = (key: keyof ProfileValues): string => {
    const candidate = record[key]
    return typeof candidate === 'string' ? candidate : EMPTY_VALUES[key]
  }
  return { name: pick('name'), language: pick('language'), persona: pick('persona') }
}

/**
 * 建立一个档案 store。
 * @param ctx - 浏览器根上下文（需已注入 `configForms`）。
 * @returns 只读快照 + 保存入口。
 */
export function createProfileStore(ctx: ClientContext): ProfileStore {
  const form = ctx.configForms.get<Record<string, unknown>>(ENTRY_ID)
  const listeners = new Set<() => void>()
  let pending = false
  let failure: string | undefined
  let snapshot: ProfileSnapshot = {
    status: 'loading',
    values: EMPTY_VALUES,
    customs: [],
    writable: false,
    pending: false,
    failure: undefined,
  }

  const publish = (): void => {
    const state = form.getSnapshot()
    snapshot = {
      status: state.status,
      values: merge(state.value),
      customs: customsOf(state.value),
      writable: state.writable,
      pending,
      failure,
    }
    for (const listener of [...listeners]) listener()
  }

  form.subscribe(publish)
  publish()

  /** 原子写一批操作，统一落错误信息。 */
  const commit = async (ops: readonly { op: 'set'; path: string[]; value: string }[]): Promise<SaveResult> => {
    pending = true
    failure = undefined
    publish()
    try {
      // 一次 mutate = 一次修订围栏：这批字段要么一起落盘，要么都不动。
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
  }

  const writeCustoms = (customs: readonly CustomPersona[]): Promise<SaveResult> =>
    commit([{ op: 'set', path: ['customsJson'], value: JSON.stringify(customs) }])

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
      return commit(ops)
    },
    saveCustom: async (entry) => {
      const customs = snapshot.customs.filter(item => item.name !== entry.name)
      customs.push(entry)
      return writeCustoms(customs)
    },
    removeCustom: async (name) => {
      const customs = snapshot.customs.filter(item => item.name !== name)
      if (customs.length === snapshot.customs.length) return { ok: true }
      return writeCustoms(customs)
    },
  }
}
