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
}
