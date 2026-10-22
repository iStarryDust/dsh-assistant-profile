/**
 * 侧栏「新会话」上方的助理名。
 *
 * 侧栏外壳把品牌行、新会话按钮、面板行都握在自己手里，没有给这个位置留 slot，
 * 所以这里在按钮前面插一个自己的节点，并用 MutationObserver 在 React 重渲染把它
 * 冲掉时补回；侧栏收成 56px 图标栏时隐藏。节点是纯 DOM——它不属于任何 React 树，
 * 因此重渲染不会带上它自己的状态。
 *
 * @module @istarry/dsh-assistant-profile/client/nameplate
 */

import type { ProfileStore } from './store.ts'
import css from './ProfilePage.module.css'

/** 侧栏新会话按钮的类名后缀（外壳的 CSS Module 用 `[hash]_[local]`）。 */
const BUTTON_SELECTOR = 'button[class*="_newSession"]'

/** 外壳折叠时根节点类名里的片段。 */
const COLLAPSED = '_collapsed'

/** 兜底巡检间隔：React 换掉整个侧栏时观察器会跟着失效。 */
const WATCHDOG_MS = 1000

/**
 * 名字的首字，用作名plate的小方块。
 * @param name - 助理名。
 * @returns 首字（按码点取，中英文都对），空名返回空串。
 */
function initialOf(name: string): string {
  return Array.from(name)[0] ?? ''
}

/**
 * 把助理名挂到侧栏上。
 * @param store - 档案 store（读名称）。
 * @returns 卸载函数。
 */
export function mountNameplate(store: ProfileStore): () => void {
  let host: HTMLElement | undefined
  let row: HTMLDivElement | undefined
  let avatar: HTMLSpanElement | undefined
  let label: HTMLSpanElement | undefined
  let observer: MutationObserver | undefined

  const sync = (): void => {
    if (row === undefined) return
    const name = store.getSnapshot().values.name.trim()
    row.hidden = name === ''
    if (avatar !== undefined) avatar.textContent = initialOf(name)
    if (label !== undefined) label.textContent = name
    row.dataset.collapsed = host?.className.includes(COLLAPSED) === true ? 'true' : 'false'
  }

  const detach = (): void => {
    observer?.disconnect()
    observer = undefined
    row?.remove()
    row = undefined
    avatar = undefined
    label = undefined
    host = undefined
  }

  const attach = (): void => {
    const button = document.querySelector(BUTTON_SELECTOR)
    const parent = button?.parentElement ?? null
    if (!(button instanceof HTMLElement) || !(parent instanceof HTMLElement)) return
    if (row !== undefined && host === parent && row.isConnected) {
      sync()
      return
    }
    detach()
    host = parent
    row = document.createElement('div')
    row.className = css.nameplate
    avatar = document.createElement('span')
    avatar.className = css.nameplateAvatar
    avatar.setAttribute('aria-hidden', 'true')
    label = document.createElement('span')
    label.className = css.nameplateText
    row.append(avatar, label)
    parent.insertBefore(row, button)
    observer = new MutationObserver(() => {
      if (row === undefined || host === undefined) return
      if (!row.isConnected) {
        const anchor = host.querySelector(BUTTON_SELECTOR)
        if (anchor !== null) host.insertBefore(row, anchor)
      }
      sync()
    })
    observer.observe(parent, { childList: true, attributes: true, attributeFilter: ['class'] })
    sync()
  }

  const unsubscribe = store.subscribe(() => {
    attach()
    sync()
  })
  attach()
  const watchdog = setInterval(attach, WATCHDOG_MS)
  return () => {
    unsubscribe()
    clearInterval(watchdog)
    detach()
  }
}
