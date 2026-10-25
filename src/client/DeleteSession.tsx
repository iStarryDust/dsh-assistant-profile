/**
 * 侧栏会话行菜单里的「删除」：删的是这个会话本身——磁盘日志、索引、工作区登记，
 * 以及前端的那一行。
 *
 * 菜单项和确认框必须分开：菜单一关，菜单里的组件就整棵卸载了，弹窗会跟着消失。
 * 所以菜单项只把「想删谁」写进模块级的 pending，确认框挂在 `shell.overlay` 上读它——
 * 官方「停止并归档」也是这个结构。
 *
 * @module @istarry/dsh-assistant-profile/client/DeleteSession
 */

import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { Button, IconTrashOutlineRegular, MenuItemButton, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { DeleteResult } from './delete.ts'
import css from './DeleteSession.module.css'

/** 注入给两个组件的动作。 */
export interface DeleteSessionInjected {
  /**
   * 请宿主删除一个会话。
   * @param sessionId - 要删除的会话。
   */
  deleteSession: (sessionId: string) => Promise<DeleteResult>
}

/** 待确认的删除目标。 */
interface PendingDelete {
  /** 要删的会话。 */
  readonly sessionId: string
  /** 行上显示的标题，写进确认框。 */
  readonly title: string
}

/** 模块级待办：菜单项写，确认框读（两个插槽不共享 React 树）。 */
let pending: PendingDelete | undefined
const listeners = new Set<() => void>()

/** 通知订阅者。 */
function publish(): void {
  for (const listener of [...listeners]) listener()
}

/**
 * 记下要删的会话并唤起确认框。
 * @param sessionId - 目标会话。
 * @param title - 行标题。
 */
function askDelete(sessionId: string, title: string): void {
  pending = { sessionId, title }
  publish()
}

/** 关掉确认框。 */
function dismiss(): void {
  pending = undefined
  publish()
}

/**
 * 订阅待办。
 * @param listener - 变更回调。
 * @returns 取消订阅。
 */
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** @returns 当前待办（引用稳定，只有开关时变）。 */
const snapshot = (): PendingDelete | undefined => pending

/** 菜单行 props：行主数据 + 菜单开合 + 词典。 */
export type DeleteSessionMenuItemProps =
  PropsRuntime<'sidebar.workspaces.session.menu.item'>
  & PropsLocale<'assistantProfile'>

/**
 * 菜单行（order 600，带分隔线）。只负责关菜单并把目标交给确认框。
 * @param props - 会话 id、标题、菜单开合与文案。
 * @returns 一行「删除」。
 */
export function DeleteSessionMenuItem({
  sessionId, displayTitle, useMenuOpenState, t,
}: DeleteSessionMenuItemProps): ReactNode {
  const [, setMenuOpen] = useMenuOpenState()
  return (
    <MenuItemButton
      danger
      separatorBefore
      icon={<IconTrashOutlineRegular size={14} />}
      onSelect={() => {
        setMenuOpen(false)
        askDelete(sessionId, displayTitle)
      }}
    >
      {t('delete.menu')}
    </MenuItemButton>
  )
}

/** 确认框 props。 */
export type DeleteSessionDialogProps =
  PropsRuntime<'shell.overlay'>
  & InjectFace<DeleteSessionInjected>
  & PropsLocale<'assistantProfile'>

/**
 * `shell.overlay` 上的确认框。
 * @param props - 删除动作与文案。
 * @returns 弹窗；没有待办时什么都不渲染。
 */
export function DeleteSessionDialog({ deleteSession, t }: DeleteSessionDialogProps): ReactNode {
  const target = useSyncExternalStore(subscribe, snapshot)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (target === undefined) return null

  /** 把宿主的原因码翻成界面文案。 */
  const reasonOf = (outcome: string): string => {
    if (outcome === 'running') return t('delete.running')
    if (outcome === 'open') return t('delete.open')
    if (outcome === 'not found') return t('delete.notFound')
    if (outcome === 'delete failed') return t('delete.ioError')
    if (outcome === 'timed out') return t('delete.timeout')
    if (outcome === 'settings write refused') return t('delete.refused')
    return outcome === '' ? t('delete.failed') : outcome
  }

  const close = (): void => {
    if (busy) return
    setError(null)
    dismiss()
  }

  const submit = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await deleteSession(target.sessionId)
      if (result.ok) {
        // 宿主已经发了 api-session/removed，那一行会被移除。
        dismiss()
        return
      }
      setError(reasonOf(result.outcome))
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t('delete.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={t('delete.title')}
      closeLabel={t('delete.cancel')}
      onClose={close}
      footer={(
        <>
          {error !== null && <span className={css.error} role="alert">{error}</span>}
          <Button variant="outline" disabled={busy} onClick={close}>
            {t('delete.cancel')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => { void submit() }}>
            {busy ? t('delete.busy') : t('delete.confirm')}
          </Button>
        </>
      )}
    >
      <p className={css.body}>{t('delete.body', { title: target.title })}</p>
      <p className={css.hint}>{t('delete.hint')}</p>
    </Modal>
  )
}
