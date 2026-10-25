/**
 * 「Agent记忆」设置页的状态。
 *
 * 只走一条通道：官方设置通道（`configForms`）。记忆文本、两个开关都是本插件在
 * profile 里的配置字段，读写与持久化由它负责——不需要自定义 RPC，也就不会遇到
 * 远程命名空间挂载的问题。
 *
 * @module @istarry/dsh-assistant-profile/client/memory-store
 */

import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** 设置页用到的三个配置字段，形状与宿主 Config 对齐。 */
export interface MemoryConfig {
  /** 记忆是否注入系统提示。 */
  memoryEnabled: boolean
  /** 模型是否可以自己判断该记什么（依赖 memoryEnabled）。 */
  autoMemory: boolean
  /** 整段记忆文本。 */
  memoryText: string
}

/** 页面快照。 */
export interface MemorySectionState {
  /** 配置通道状态；`unavailable` 时控件全部禁用。 */
  status: 'loading' | 'ready' | 'unavailable'
  /** 配置里持久化的值。 */
  config: MemoryConfig
  /** 编辑框草稿（保存前只在客户端）。 */
  draft: string
  /** 保存生命周期。 */
  saveState: 'idle' | 'saving' | 'saved' | 'failed'
  /** 保存失败的说明。 */
  error: string | null
}

/** 把持久化配置解码成三个字段（形状不对时给安全默认值）。 */
export function decodeConfig(section: unknown): MemoryConfig {
  const source = typeof section === 'object' && section !== null && !Array.isArray(section)
    ? section as Record<string, unknown>
    : {}
  return {
    memoryEnabled: source.memoryEnabled === true,
    autoMemory: source.autoMemory === true,
    memoryText: typeof source.memoryText === 'string' ? source.memoryText : '',
  }
}

/** 设置页控制器（每个浏览器页面一个）。 */
export class MemorySettingsController {
  readonly store: SnapshotStore<MemorySectionState> = createSnapshotStore<MemorySectionState>({
    status: 'loading',
    config: decodeConfig(undefined),
    draft: '',
    saveState: 'idle',
    error: null,
  })

  private readonly unsubscribe: () => void

  /**
   * @param form - 本插件在设置通道里的配置表。
   */
  constructor(private readonly form: ConfigForm<MemoryConfig>) {
    this.unsubscribe = form.subscribe(() => { this.derive() })
    this.derive()
  }

  /** 释放订阅。 */
  dispose(): void {
    this.unsubscribe()
  }

  /** 切换一个开关。 */
  async toggle(field: 'memoryEnabled' | 'autoMemory', next: boolean): Promise<void> {
    await this.form.set(field, next)
  }

  /** 更新编辑框草稿（保存前不写配置）。 */
  setDraft(text: string): void {
    const snapshot = this.store.getSnapshot()
    this.store.set({ ...snapshot, draft: text, saveState: 'idle', error: null })
  }

  /** 保存草稿到 memoryText。 */
  async save(): Promise<void> {
    const snapshot = this.store.getSnapshot()
    this.store.set({ ...snapshot, saveState: 'saving', error: null })
    try {
      await this.form.set('memoryText', snapshot.draft)
      this.store.set({ ...this.store.getSnapshot(), saveState: 'saved' })
    } catch (error) {
      this.store.set({
        ...this.store.getSnapshot(),
        saveState: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /** 把配置快照映射进页面状态；用户没在编辑时，草稿跟着配置走。 */
  private derive(): void {
    const snapshot = this.form.getSnapshot()
    const config = decodeConfig(snapshot.value)
    const current = this.store.getSnapshot()
    // 草稿只在"用户改过且没保存"时保留，否则跟随配置（比如自动记忆在别处追加了条目）。
    const dirty = current.draft !== current.config.memoryText && current.saveState !== 'saved'
    this.store.set({
      status: snapshot.status === 'ready' ? 'ready' : snapshot.status === 'loading' ? 'loading' : 'unavailable',
      config,
      draft: dirty ? current.draft : config.memoryText,
      saveState: snapshot.status === 'ready' ? current.saveState : 'idle',
      error: current.error,
    })
  }
}
