/**
 * 「Agent记忆」设置页。
 *
 * 两块：两个互锁的开关，一个记忆编辑框。全部走设置通道，保存即落盘。
 * 「从聊天记录提炼」不在这里——它在聊天消息的动作行上，属于另一件事。
 *
 * @module @istarry/dsh-assistant-profile/client/MemorySection
 */

import { useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MemorySectionState } from './memoryStore.ts'
import css from './MemorySection.module.css'

/** 注入给页面的动作。 */
export interface MemorySectionInjected {
  hooks: {
    /** 由渲染器绑定为 useMemorySection（InjectFace 把 hooks.x 展开成 useX）。 */
    memorySection: SnapshotStore<MemorySectionState>
  }
  toggle: (field: 'memoryEnabled' | 'autoMemory', next: boolean) => Promise<void>
  setDraft: (text: string) => void
  save: () => Promise<void>
}

/** 完整 props。 */
export type MemorySectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'assistantProfile'>
  & InjectFace<MemorySectionInjected>

/** 渲染设置页。 */
export function MemorySection({
  useMemorySection, toggle, setDraft, save, t,
}: MemorySectionProps): ReactNode {
  const state = useMemorySection((value) => value)
  const [busy, setBusy] = useState<'memoryEnabled' | 'autoMemory' | null>(null)

  const ready = state.status === 'ready'
  const memoryOn = state.config.memoryEnabled
  const { saveState, error } = state

  const flip = (field: 'memoryEnabled' | 'autoMemory', next: boolean): void => {
    setBusy(field)
    void toggle(field, next).finally(() => { setBusy(null) })
  }

  return (
    <section className={css.page}>
      <h2 className={css.title}>{t('memory.nav')}</h2>
      <p className={css.intro}>{t('memory.intro')}</p>

      {state.status === 'unavailable' && <p className={css.error} role="alert">{t('memory.unavailable')}</p>}

      <div className={css.group}>
        <h3 className={css.groupHead}>{t('memory.switches')}</h3>

        <div className={css.row}>
          <div className={css.rowText}>
            <span className={css.rowTitle}>{t('memory.enabled.title')}</span>
            <span className={css.rowDesc}>{t('memory.enabled.description')}</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={memoryOn}
            aria-label={t('memory.enabled.title')}
            className={memoryOn ? `${css.switch} ${css.on}` : css.switch}
            disabled={!ready || busy === 'memoryEnabled'}
            onClick={() => { flip('memoryEnabled', !memoryOn) }}
          >
            <span className={css.knob} />
          </button>
        </div>

        <div className={css.row}>
          <div className={css.rowText}>
            <span className={css.rowTitle}>{t('memory.auto.title')}</span>
            <span className={css.rowDesc}>
              {memoryOn ? t('memory.auto.description') : t('memory.auto.locked')}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={state.config.autoMemory}
            aria-label={t('memory.auto.title')}
            className={state.config.autoMemory ? `${css.switch} ${css.on}` : css.switch}
            disabled={!ready || !memoryOn || busy === 'autoMemory'}
            onClick={() => { flip('autoMemory', !state.config.autoMemory) }}
          >
            <span className={css.knob} />
          </button>
        </div>
      </div>

      <div className={css.group}>
        <h3 className={css.groupHead}>{t('memory.editor')}</h3>
        <p className={css.rowDesc}>{t('memory.editor.hint')}</p>
        <textarea
          className={css.textarea}
          value={state.draft}
          placeholder={t('memory.editor.placeholder')}
          rows={12}
          disabled={!ready || saveState === 'saving'}
          onChange={(event) => { setDraft(event.target.value) }}
        />
        <div className={css.actions}>
          <button
            type="button"
            className={css.primary}
            disabled={!ready || saveState === 'saving'}
            onClick={() => { void save() }}
          >
            {saveState === 'saving' ? t('memory.saving') : t('memory.save')}
          </button>
          {saveState === 'saved' && <span className={css.ok} role="status">{t('memory.saved')}</span>}
          {saveState === 'failed' && (
            <span className={css.error} role="alert">{error ?? t('memory.saveFailed')}</span>
          )}
        </div>
      </div>
    </section>
  )
}
