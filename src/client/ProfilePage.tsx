/**
 * 助理档案页：名称、风格、语言、人格提示词四段，一次保存原子落盘。
 *
 * 页面只编辑、不预览：真正的注入发生在宿主侧（每个新会话的系统提示首段），
 * 这里把「它会出现在哪里」写在每个字段的说明里，省掉一块会随时间漂移的假预览。
 */

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
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

/** 四个字段的遍历顺序。 */
const FIELDS = ['name', 'style', 'language', 'persona'] as const

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
  const values = draft ?? snapshot.values
  const dirty = draft !== undefined && FIELDS.some(field => draft[field] !== snapshot.values[field])
  const length = useMemo(() => Array.from(values.persona).length, [values.persona])
  const ready = snapshot.status === 'ready'
  const canSave = ready && snapshot.writable && dirty && !snapshot.pending

  // 「已保存」是一次短提示，不是状态：第一次改动或下一次保存前自动消失。
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => { setSaved(false) }, FLASH_MS)
    return () => { clearTimeout(timer) }
  }, [saved])

  const patch = (next: Partial<ProfileValues>): void => {
    setDraft({ ...values, ...next })
    setSaved(false)
  }

  const submit = async (): Promise<void> => {
    if (!canSave) return
    const result = await profile.save(values)
    if (result.ok) {
      setDraft(undefined)
      setSaved(true)
    }
  }

  const status = (): { text: string; error: boolean } => {
    if (!ready) return { text: t('unavailable'), error: false }
    if (!snapshot.writable) return { text: t('readonly'), error: false }
    if (snapshot.failure !== undefined) return { text: `${t('failed')} · ${snapshot.failure}`, error: true }
    if (saved) return { text: t('saved'), error: false }
    if (dirty) return { text: t('dirty'), error: false }
    return { text: '', error: false }
  }
  const line = status()

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
            <span className={css.label}>{t('style.label')}</span>
            <Input
              className={css.control}
              value={values.style}
              placeholder={t('style.placeholder')}
              spellCheck={false}
              onChange={(event) => { patch({ style: event.target.value }) }}
            />
            <span className={css.hint}>{t('style.hint')}</span>
          </label>

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

          <footer className={css.footer}>
            <span className={line.error ? `${css.status} ${css.statusError}` : css.status}>{line.text}</span>
            <Button
              variant="ghost"
              disabled={!dirty || snapshot.pending}
              onClick={() => { setDraft(undefined); setSaved(false) }}
            >
              {t('reset')}
            </Button>
            <Button variant="primary" type="submit" disabled={!canSave}>
              {snapshot.pending ? t('saving') : t('save')}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  )
}
