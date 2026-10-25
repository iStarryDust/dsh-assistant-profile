/**
 * 助理档案 · 浏览器半端。
 *
 * 三件事：侧栏「插件」下面多一行「助理档案」；点开是主区的一个页面（名称 / 风格 /
 * 语言 / 人格提示词）；「新会话」按钮上方显示助理名。
 *
 * 数据不经过自定义 RPC：档案就是本插件在 profile 里的配置字段，页面通过官方设置
 * 通道（`configForms`）读写，写入落进 profile 的 Cordis patch，重启后仍在。
 *
 * @module @istarry/dsh-assistant-profile/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { ProfilePage } from './ProfilePage.tsx'
import { ProfilePanelIcon } from './ProfilePanelIcon.tsx'
import { createProfileStore } from './store.ts'
import { mountNameplate } from './nameplate.ts'
import { MemorySection } from './MemorySection.tsx'
import { MemoryActions } from './MemoryActions.tsx'
import { DeleteSessionDialog, DeleteSessionMenuItem } from './DeleteSession.tsx'
import { requestDelete } from './delete.ts'
import { requestRemember } from './remember.ts'
import { MemorySettingsController, type MemoryConfig } from './memoryStore.ts'
import { en, zh, type ProfileKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 助理档案页与侧栏入口的文案。 */
    assistantProfile: ProfileKey
  }
}

/** 本插件独占的词典命名空间。 */
const NS = 'assistantProfile'

/** 侧栏行与主区面板共用的 id：也是本插件在 profile 里的条目 id。 */
const PANEL_ID = 'assistant-profile' as MainPanelId

/** 行序：插件（0）与自动化任务（10）之间。 */
const PANEL_ORDER = 5

/** 需要的服务（cordis fiber inject）。 */
export const inject = ['slots', 'locale', 'configForms']

/**
 * 挂载助理档案的界面。
 * @param ctx - 浏览器根上下文。
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'assistant-profile: dictionaries')
  const t = ctx.locale.bind(NS)

  // 本包自己产出的 Remote 贡献：在这里挂载，不依赖部署侧的共享装配。
  const profile = createProfileStore(ctx)
  ctx.effect(() => mountNameplate(profile), 'assistant-profile: nameplate')

  // 侧栏入口。外壳自己负责按钮、标签、选中态与点击后选面板，这里只给字形。
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: PANEL_ORDER,
    label: () => t('panel'),
    locale: NS,
  }, ProfilePanelIcon))

  // 主区页面。档案 store 由页面与侧栏名plate共用：改完保存，两处同时变。
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: () => ({ profile }),
  }, ProfilePage))

  // 设置页「Agent记忆」与聊天里的「记住」共用同一张配置表：两侧都只走设置通道，
  // 不引入自定义 RPC（宿主把记忆与信箱都放在 volatile 字段里）。
  const memoryForm = ctx.configForms.get<MemoryConfig>(PANEL_ID)
  const signalForm = ctx.configForms.get<Record<string, unknown>>(PANEL_ID)
  const controller = new MemorySettingsController(memoryForm)
  ctx.effect(() => () => { controller.dispose() }, 'assistant-profile: memory form')

  // 侧栏会话行菜单里的「删除」：走同一个设置通道信箱，宿主删完发 api-session/removed。
  // 确认框不能挂在菜单里（菜单一关组件就卸载了），所以单独注册到 shell.overlay。
  const deleteAction = {
    deleteSession: (sessionId: string) => requestDelete(signalForm, sessionId),
  }
  ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
    name: 'sidebar.workspaces.session.menu.item',
    id: 'assistant-profile-delete',
    // 排在「复制 Session ID」(500) 之后，带分隔线单独一行。
    order: 600,
    locale: NS,
  }, DeleteSessionMenuItem))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'assistant-profile-delete-dialog',
    order: 50,
    locale: NS,
    inject: () => deleteAction,
  }, DeleteSessionDialog))

  // 聊天动作行上的「记住」：勾选消息后请宿主用该会话的模型提炼。
  ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: 'assistant-profile-remember',
    order: 20,
    locale: NS,
    inject: (sessionId: string) => ({
      remember: (text: string) => requestRemember(signalForm, String(sessionId ?? ''), text),
    }),
  }, MemoryActions))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'assistant-memory',
    // 排在档案相关项之后：人格定义「我是谁」，记忆定义「我记得什么」。
    order: 26,
    label: () => t('memory.nav'),
    locale: NS,
    inject: () => ({
      hooks: { memorySection: controller.store },
      toggle: (field: 'memoryEnabled' | 'autoMemory', next: boolean) => controller.toggle(field, next),
      setDraft: (text: string) => { controller.setDraft(text) },
      save: () => controller.save(),
      load: () => controller.load(),
    }),
  }, MemorySection))
}
