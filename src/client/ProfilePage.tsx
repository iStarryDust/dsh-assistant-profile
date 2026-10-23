/**
 * 助理档案页：名称、语言、人格提示词三段，一次保存原子落盘。
 *
 * 页面只编辑、不预览：真正的注入发生在宿主侧（每个新会话的系统提示首段），
 * 这里把「它会出现在哪里」写在每个字段的说明里，省掉一块会随时间漂移的假预览。
 *
 * 「保存」行左侧是人格预设：三个内置（默认一/二/三，点击只把整套文本填进三个字段，
 * 落盘仍由「保存」决定）加「另存」出来的自定义（名字取自「名称」，胶囊右侧带一个
 * 小删除钮）。装好默认用默认三；预设多到一行放不下时横向滚动，不换行不挤压。
 */

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { BUILTIN_PERSONAS } from '../presets.ts'
import type { ProfileStore, ProfileValues } from './store.ts'
import css from './ProfilePage.module.css'

/** 人格超过这个字数就提示偏长（只提示，不拦）。 */
const LONG_PERSONA = 2000

/** 保存成功后「已保存」停留的毫秒数。 */
const FLASH_MS = 2400

/** 页面注入面：共用同一个档案 store（侧栏名plate读的是它）。 */
export interface ProfilePageInjected {
  /** 档案读写。 */
  profile: ProfileStore
}

/** 页面 props：main 槽运行时 + 本插件词典 + 注入面。 */
export type ProfilePageProps =
  PropsRuntime<'main'>
  & PropsLocale<'assistantProfile'>
  & InjectFace<ProfilePageInjected>

/** 三段的遍历顺序。 */
const FIELDS = ['name', 'language', 'persona'] as const

/**
 * 渲染助理档案页。
 * @param props - 档案 store 与本地化文案。
 * @returns 页面元素。
 */
export function ProfilePage({ profile, t }: ProfilePageProps): ReactNode {
  const snapshot = useSyncExternalStore(profile.subscribe, profile.getSnapshot)
  // 草稿只在真正改过之后才存在：保存成功后丢弃它，页面回到 Host 的值。
  const [draft, setDraft] = useState<ProfileValues | undefined>(undefined)
  const [saved, setSaved] = useState(false)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const values = draft ?? snapshot.values
  const dirty = draft !== undefined && FIELDS.some(field => draft[field] !== snapshot.values[field])
  const length = useMemo(() => Array.from(values.persona).length, [values.persona])
  const ready = snapshot.status === 'ready'
  const writable = ready && snapshot.writable
  const busy = snapshot.pending
  const canSave = writable && dirty && !busy

  // 「已保存」是一次短提示，不是状态：第一次改动或下一次保存前自动消失。
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => { setSaved(false) }, FLASH_MS)
    return () => { clearTimeout(timer) }
  }, [saved])

  const patch = (next: Partial<ProfileValues>): void => {
    setDraft({ ...values, ...next })
    setSaved(false)
    setNotice(undefined)
  }

  const submit = async (): Promise<void> => {
    if (!canSave) return
    const result = await profile.save(values)
    if (result.ok) {
      setDraft(undefined)
      setSaved(true)
    }
  }

  /** 点一个预设 = 只把三段文本填进表单，是否落盘由用户自己按「保存」决定。 */
  const applyPreset = (preset: ProfileValues): void => {
    setDraft(preset)
    setSaved(false)
    setNotice(undefined)
  }

  /** 「另存」：以「名称」为名，把当前三段存成一份自定义人格。 */
  const saveAs = async (): Promise<void> => {
    const name = values.name.trim()
    if (name === '') {
      setNotice(t('saveas.needName'))
      return
    }
    if (!writable || busy) return
    const result = await profile.saveCustom({ name, language: values.language, persona: values.persona })
    if (result.ok) {
      setSaved(true)
      setNotice(undefined)
    }
  }

  /** 当前三段和某份预设完全一致时，胶囊才算选中。 */
  const isActive = (candidate: ProfileValues): boolean =>
    FIELDS.every(field => values[field] === candidate[field])

  const line = (): { text: string; error: boolean } => {
    if (notice !== undefined) return { text: notice, error: true }
    if (!ready) return { text: t('unavailable'), error: false }
    if (!snapshot.writable) return { text: t('readonly'), error: false }
    if (snapshot.failure !== undefined) return { text: `${t('failed')} · ${snapshot.failure}`, error: true }
    if (saved) return { text: t('saved'), error: false }
    if (dirty) return { text: t('dirty'), error: false }
    return { text: '', error: false }
  }
  const status = line()

  return (
    <div className={css.page}>
      <section className={css.section}>
        <header className={css.head}>
          <h1 className={css.title}>{t('title')}</h1>
          <p className={css.intro}>{t('intro')}</p>
        </header>

        <form
          className={css.form}
          onSubmit={(event) => { event.preventDefault(); void submit() }}
        >
          <div className={css.row}>
            <label className={css.field}>
              <span className={css.label}>{t('name.label')}</span>
              <Input
                className={css.control}
                value={values.name}
                placeholder={t('name.placeholder')}
                spellCheck={false}
                onChange={(event) => { patch({ name: event.target.value }) }}
              />
              <span className={css.hint}>{t('name.hint')}</span>
            </label>

            <label className={css.field}>
              <span className={css.label}>{t('language.label')}</span>
              <Input
                className={css.control}
                value={values.language}
                placeholder={t('language.placeholder')}
                spellCheck={false}
                onChange={(event) => { patch({ language: event.target.value }) }}
              />
              <span className={css.hint}>{t('language.hint')}</span>
            </label>
          </div>

          <label className={css.field}>
            <span className={css.label}>{t('persona.label')}</span>
            <div className={css.textareaWrap}>
              <textarea
                className={css.textarea}
                value={values.persona}
                placeholder={t('persona.placeholder')}
                rows={9}
                onChange={(event) => { patch({ persona: event.target.value }) }}
              />
              <span className={css.counter} data-long={length > LONG_PERSONA}>
                {length} {t('persona.unit')}
              </span>
            </div>
            <span className={length > LONG_PERSONA ? `${css.hint} ${css.hintWarn}` : css.hint}>
              {length > LONG_PERSONA ? t('persona.long') : t('persona.hint')}
            </span>
          </label>

          {status.text !== '' && (
            <p className={status.error ? `${css.status} ${css.statusError}` : css.status}>{status.text}</p>
          )}

          <footer className={css.footer}>
            <div className={css.presets} role="group">
              {BUILTIN_PERSONAS.map((preset, index) => {
                const candidate: ProfileValues = { name: preset.name, language: preset.language, persona: preset.persona }
                const active = isActive(candidate)
                const label = index === 0 ? t('preset.builtin1') : index === 1 ? t('preset.builtin2') : t('preset.builtin3')
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={active ? `${css.chip} ${css.chipActive}` : css.chip}
                    aria-pressed={active}
                    disabled={!writable || busy}
                    onClick={() => { applyPreset(candidate) }}
                  >
                    {label}
                  </button>
                )
              })}
              {snapshot.customs.map(custom => {
                const candidate: ProfileValues = { name: custom.name, language: custom.language, persona: custom.persona }
                const active = isActive(candidate)
                return (
                  <span key={custom.name} className={css.custom}>
                    <button
                      type="button"
                      className={active ? `${css.chip} ${css.chipActive}` : css.chip}
                      aria-pressed={active}
                      disabled={!writable || busy}
                      onClick={() => { applyPreset(candidate) }}
                    >
                      {custom.name}
                    </button>
                    <button
                      type="button"
                      className={css.customDelete}
                      aria-label={`${t('custom.delete')}：${custom.name}`}
                      title={`${t('custom.delete')}：${custom.name}`}
                      disabled={!writable || busy}
                      onClick={() => { void profile.removeCustom(custom.name) }}
                    >
                      ×
                    </button>
                  </span>
                )
              })}
            </div>
            <Button
              variant="ghost"
              disabled={!writable || busy || values.name.trim() === ''}
              onClick={() => { void saveAs() }}
            >
              {t('saveas')}
            </Button>
            <Button variant="primary" type="submit" disabled={!canSave}>
              {busy ? t('saving') : t('save')}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  )
}
