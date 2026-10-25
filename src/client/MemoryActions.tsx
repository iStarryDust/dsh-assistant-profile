/**
 * 聊天里的「记住」：助理消息动作行上的一个按钮 + 一个勾选弹窗。
 *
 * 勾中的消息会按时间顺序拼成「用户：…／助手：…」的文本，交给宿主提炼成长期记忆。
 * 按钮本身不写任何东西：只有人勾选并提交，才会产生一次提炼。
 *
 * @module @istarry/dsh-assistant-profile/client/MemoryActions
 */

import { useMemo, useState, type ReactNode } from 'react'
import { Button, IconSparkleRegular, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
// 类型面：动作行插槽、聊天快照与节点形状。
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { RememberResult } from './remember.ts'
import css from './MemoryActions.module.css'

/** 一行可勾选的候选消息。 */
interface Candidate {
  /** 节点 id，用作勾选键与 React key。 */
  readonly key: string
  /** 时间线锚点，用来排序。 */
  readonly anchorSeq: number
  /** 谁说的。 */
  readonly side: 'user' | 'assistant'
  /** 弹窗里显示的一行摘要。 */
  readonly preview: string
  /** 提交给宿主的原文。 */
  readonly text: string
}

/** 助手消息里的正文块。 */
interface TextBlock {
  readonly kind?: string
  readonly type?: string
  readonly text?: string
}

/**
 * 从助手消息的块里取正文。
 * @param blocks - 消息块。
 * @returns 拼起来的正文。
 */
function assistantText(blocks: readonly TextBlock[]): string {
  return blocks.flatMap(block => (block.kind === 'text' || block.type === 'text') && typeof block.text === 'string' ? [block.text] : []).join('')
}

/**
 * 从用户消息的内容里取正文。
 * @param content - 消息内容块。
 * @returns 拼起来的正文。
 */
function contentText(content: readonly TextBlock[]): string {
  return content.flatMap(block => block.type === 'text' && typeof block.text === 'string' ? [block.text] : []).join('')
}

/**
 * 压成一行摘要。
 * @param text - 原文。
 * @param limit - 字数上限。
 * @returns 摘要。
 */
function preview(text: string, limit = 120): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit)}…`
}

/**
 * 从会话快照里挑出可提炼的消息：用户消息与已完成的助手消息，按时间线排序。
 * 运行中的回复、工具行、命令与上下文快照都没有可复用的正文，跳过。
 * @param snapshot - 当前会话的聊天快照。
 * @returns 候选列表。
 */
function candidatesOf(snapshot: unknown): Candidate[] {
  // 官方快照的 nodes 是带 `values()` 的稳定读取器（不是 Map），这里兼容三种形态，
  // 免得宿主换实现就白屏。
  const store = (snapshot as { nodes?: unknown } | undefined)?.nodes
  const nodes: readonly unknown[] = store === undefined || store === null
    ? []
    : typeof (store as { values?: unknown }).values === 'function'
      ? (store as { values(): readonly unknown[] }).values()
      : store instanceof Map
        ? [...store.values()]
        : Object.values(store as Record<string, unknown>)
  const list: Candidate[] = []
  for (const raw of nodes) {
    if (typeof raw !== 'object' || raw === null) continue
    const node = raw as {
      key?: string
      id?: string
      kind?: string
      visibility?: string
      anchorSeq?: number
      data?: { status?: string; blocks?: readonly TextBlock[]; content?: readonly TextBlock[] }
    }
    const key = node.key ?? node.id
    if (key === undefined) continue
    if (node.visibility === 'hidden') continue
    const anchorSeq = typeof node.anchorSeq === 'number' ? node.anchorSeq : 0
    if (node.kind === 'user' || node.kind === 'steering') {
      const content = node.data?.content ?? []
      const text = Array.isArray(content) ? contentText(content) : ''
      if (text.trim() === '') continue
      list.push({ key, anchorSeq, side: 'user', preview: preview(text), text })
      continue
    }
    if (node.kind === 'assistant-step') {
      if (node.data?.status === 'running') continue
      const blocks = node.data?.blocks ?? []
      const text = Array.isArray(blocks) ? assistantText(blocks) : ''
      if (text.trim() === '') continue
      list.push({ key, anchorSeq, side: 'assistant', preview: preview(text), text })
    }
  }
  return list.sort((left, right) => left.anchorSeq - right.anchorSeq)
}

/** 注入给按钮的动作。 */
export interface MemoryActionsInjected {
  /**
   * 把选中的对话文本交给宿主提炼。
   * @param text - 已带说话人前缀的对话文本。
   * @returns 提炼结果。
   */
  remember: (text: string) => Promise<RememberResult>
}

/** 完整 props。 */
export type MemoryActionsProps =
  PropsRuntime<'conversation.chat.assistant-actions'>
  & InjectFace<MemoryActionsInjected>
  & PropsLocale<'assistantProfile'>

/**
 * 动作行上的「记住」入口，以及提交成功后的短暂提示。
 * @param props - 注入的提炼动作与会话运行时。
 * @returns 按钮与可能展开的弹窗。
 */
export function MemoryActions({ useChat, remember, t }: MemoryActionsProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  return (
    <>
      <Tooltip label={t('remember.action')} side="bottom">
        <button
          type="button"
          className={css.action}
          aria-label={t('remember.action')}
          onClick={() => { setNote(null); setOpen(true) }}
        >
          <IconSparkleRegular />
        </button>
      </Tooltip>
      {note !== null && <span className={css.note} role="status">{note}</span>}
      {open && (
        <MemoryDialog
          useChat={useChat}
          remember={remember}
          t={t}
          onClose={(saved) => {
            setOpen(false)
            if (saved) setNote(t('remember.saved'))
          }}
        />
      )}
    </>
  )
}

/** 弹窗 props。 */
interface MemoryDialogProps {
  /** 会话快照选择器。 */
  readonly useChat: MemoryActionsProps['useChat']
  /** 提炼动作。 */
  readonly remember: (text: string) => Promise<RememberResult>
  /** 关闭弹窗；`saved` 决定要不要在动作行留一句「已记住」。 */
  readonly onClose: (saved: boolean) => void
  /** 本插件词典。 */
  readonly t: MemoryActionsProps['t']
}

/**
 * 消息勾选弹窗。
 * @param props - 会话选择器、提炼动作与文案。
 * @returns 弹窗元素。
 */
function MemoryDialog({ useChat, remember, onClose, t }: MemoryDialogProps): ReactNode {
  const snapshot = useChat(state => state)
  const candidates = useMemo(() => candidatesOf(snapshot), [snapshot])
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (key: string): void => {
    const next = new Set(checked)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setChecked(next)
  }

  /** 把宿主的结果原因翻成界面文案。 */
  const outcomeText = (outcome: string): string => {
    if (outcome === 'session not open') return t('remember.notOpen')
    if (outcome === 'no provider/model available') return t('remember.noModel')
    if (outcome === 'empty selection' || outcome === 'nothing worth remembering') return t('remember.nothing')
    if (outcome === 'timed out') return t('remember.timeout')
    if (outcome === 'settings write refused') return t('remember.refused')
    return outcome === '' ? t('remember.failed') : outcome
  }

  const submit = async (): Promise<void> => {
    if (busy) return
    const rows = candidates.filter(item => checked.has(item.key))
    const text = rows
      .map(item => `${item.side === 'user' ? t('remember.side.user') : t('remember.side.assistant')}：${item.text}`)
      .join('\n\n')
    if (text.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      const result = await remember(text)
      if (result.saved) {
        onClose(true)
        return
      }
      setError(outcomeText(result.outcome))
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : t('remember.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose(false) }}
      closeLabel={t('remember.cancel')}
      title={t('remember.title')}
      description={t('remember.subtitle')}
      footer={(
        <>
          {error !== null && <span className={css.error} role="alert">{error}</span>}
          <Button variant="outline" disabled={busy} onClick={() => { onClose(false) }}>
            {t('remember.cancel')}
          </Button>
          <Button variant="primary" disabled={busy || checked.size === 0} onClick={() => { void submit() }}>
            {busy ? t('remember.submitting') : t('remember.submit')}
          </Button>
        </>
      )}
    >
      <div className={css.list}>
        {candidates.length === 0 && <div className={css.empty}>{t('remember.empty')}</div>}
        {candidates.map((item) => {
          const active = checked.has(item.key)
          return (
            <label key={item.key} className={active ? `${css.row} ${css.rowChecked}` : css.row}>
              <input
                type="checkbox"
                className={css.check}
                checked={active}
                onChange={() => { toggle(item.key) }}
              />
              <span className={css.side}>
                {item.side === 'user' ? t('remember.side.user') : t('remember.side.assistant')}
              </span>
              <span className={css.preview}>{item.preview}</span>
            </label>
          )
        })}
      </div>
    </Modal>
  )
}
