/**
 * 助理档案 · 宿主半端。
 *
 * 一个档案、一份人格、四个模式通用。做法只有一件事：每个对话 agent 创建时，在这个
 * agent **自己的上下文**里注册一段 `deployment:persona-prefix`——作用域链上最近的
 * 同名段胜出，于是预设自带的身份句被档案替换，而工具、流程、模式语义一律不动。
 * 官方给子代理发独立人格走的正是这条路径（`dsh-subagent` 的 applyChildComposition），
 * 所以它对标准 / PTC / 极简 / 创造四种预设都成立，不用复制预设组合，也不用改模式
 * 选择器与会话绑定逻辑。
 *
 * 极简模式的预设人格是「整段系统提示只有这一句」（complete: true）。遮蔽段必须镜像
 * 这个标记，否则会把它变成「全套工具说明 + 人格」，等于改掉了那个模式的定义。
 *
 * 文本是**每次组装提示词时求值**的，所以保存后已打开的会话下一句话就用新人格。是否
 * 因此重算前缀缓存由宿主判定：路由声明 `systemPromptUpdate: 'in-history'` 时，变化的
 * 系统提示会被追加在已缓存的历史之后，历史那段前缀仍然命中；否则从开头失效。
 *
 * @module @istarry/dsh-assistant-profile
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { DEFAULT_SCHEMA, Type, load as yamlLoad } from 'js-yaml'
// 类型面：设置通道（configure）、系统提示服务与 agent 生命周期事件。
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'

import { DEFAULT_PERSONA } from './presets.ts'

/** Cordis 插件名。 */
export const name = 'assistant-profile'

/** 人格所在的那一段的规范名——预设与档案共用同一个名字，遮蔽才成立。 */
const PERSONA_PREFIX_SECTION = 'deployment:persona-prefix'

/** 该段在提示词里的位置（宿主 SECTION_ORDERS.DEPLOYMENT_PERSONA_PREFIX）。 */
const PERSONA_PREFIX_ORDER = 0

/** 人格插件的包名，兼容没有 `id` 的旧写法。 */
const PERSONA_PLUGIN_NAME = '@deepseek-ai/dsh-persona'

/** 档案字段。 */
export interface Config {
  /** 助理名：进提示词，也是侧栏「新会话」上方的显示名。 */
  name: Volatile<string>
  /** 回复语言：作 `Reply in … throughout.` 一行。 */
  language: Volatile<string>
  /** 人格提示词正文，原样注入。 */
  persona: Volatile<string>
  /**
   * 用户「另存」的自定义人格，JSON 数组序列化成字符串存取——设置通道对
   * 标量字段最稳，嵌套结构交给客户端自己 parse。
   */
  customsJson: Volatile<string>
}

/**
 * 运行时 schema。字段都是 volatile：它们由「助理档案」页而不是插件配置页编辑，
 * 改动经设置通道写回 profile 的 patch，重启后仍在。默认值取内置「默认三」，
 * 所以装好就是一条带人设的鱼；三栏全部清空再保存，则什么都不注入。
 */
export const Config: z<Config> = z.object({
  name: z.string().default(DEFAULT_PERSONA.name).volatile(),
  language: z.string().default(DEFAULT_PERSONA.language).volatile(),
  persona: z.string().default(DEFAULT_PERSONA.persona).volatile(),
  customsJson: z.string().default('[]').volatile(),
})

/** 跨插件重载共享的当前配置引用：旧闭包也能读到新值。 */
const LIVE = Symbol.for('dsh.assistant-profile.config')

/** 挂在 agent ctx 上的已注册段 disposer：重载后能收回上一次的注册。 */
const INSTALLED = Symbol.for('dsh.assistant-profile.installed')

/** 全局持有者。 */
interface Live {
  config: Config | undefined
}

const live: Live = ((globalThis as Record<symbol, Live>)[LIVE] ??= { config: undefined })

/** 一个预设自带的身份信息。 */
interface BasePersona {
  /** 该预设是否把人格当作整段系统提示。 */
  readonly complete: boolean
  /** 预设原有的人格前缀；档案为空时用它兜底，等于原生行为。 */
  readonly prefix: string
}

/** 按预设 id 缓存的身份信息。 */
const basePersonas = new Map<string, BasePersona>()

/**
 * 取一段非空文本，或 undefined。
 * @param value - 原始值。
 * @returns 去掉首尾空白后的文本。
 */
function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

/**
 * 把档案渲染成系统提示的首段。四段空行分隔、各自可缺省；全空时返回空串，
 * 由调用方回落到预设自带的身份。
 * @returns 人格文本。
 */
export function renderPersona(): string {
  const config = live.config
  if (config === undefined) return ''
  const name = text(config.name.get())
  const language = text(config.language.get())
  const persona = text(config.persona.get())
  const lines = [
    ...name === undefined ? [] : [`Your name is ${name}.`],
    ...language === undefined ? [] : [`Reply in ${language} throughout.`],
    ...persona === undefined ? [] : [persona],
  ]
  return lines.join('\n\n')
}

/** 能容忍加载器方言（`!!js` 条件）的 YAML schema。 */
const LOADER_SCHEMA = DEFAULT_SCHEMA.extend([
  new Type('tag:yaml.org,2002:js', {
    kind: 'scalar',
    construct: data => data,
  }),
])

/**
 * 在一份组合里找到人格行。组行（`cordis:group`）的成员挂在 `config` 下，所以递归。
 * @param value - 已解析的组合。
 * @returns 人格行，或 undefined。
 */
function personaRowOf(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = personaRowOf(item)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (record.id === 'persona' || record.name === PERSONA_PLUGIN_NAME) return record
  return personaRowOf(record.config)
}

/**
 * 读一个预设自带的身份信息，按 id 缓存。
 * @param ctx - 宿主上下文（取预设注册表）。
 * @param agentPreset - 预设 id。
 * @returns 身份信息；读不到时 undefined。
 */
async function basePersonaOf(ctx: Context, agentPreset: string): Promise<BasePersona | undefined> {
  const cached = basePersonas.get(agentPreset)
  if (cached !== undefined) return cached
  const registry = ctx.get('agentPresets')
  if (registry === undefined) return undefined
  try {
    const document = await registry.readDocument(agentPreset)
    const row = personaRowOf(yamlLoad(document.content, { schema: LOADER_SCHEMA }))
    const config = row?.config
    const record = typeof config === 'object' && config !== null ? config as Record<string, unknown> : {}
    const value: BasePersona = {
      complete: record.complete === true,
      prefix: typeof record.prefix === 'string' ? record.prefix : '',
    }
    basePersonas.set(agentPreset, value)
    return value
  } catch {
    // 读不到就当没有自带身份：档案照常注入，只是不镜像 complete。
    return undefined
  }
}

/** agent 句柄的最小面（只用得到会话头与它自己的上下文）。 */
interface AgentLike {
  readonly id: string
  readonly ctx: Context
  readonly session: { readonly header: { readonly origin?: 'subagent' } }
}

/**
 * 给一个对话 agent 装上档案人格。子智能体不动：它们的人格属于委派方，
 * 而且 `dsh-subagent` 可能已经给这个孩子发了一份。
 * @param ctx - 插件上下文。
 * @param agent - 新建（或恢复）的 agent。
 */
async function install(ctx: Context, agent: AgentLike): Promise<void> {
  if (agent.session.header.origin === 'subagent') return
  const agentCtx = agent.ctx as Context & { [INSTALLED]?: () => void }
  const presetId = ctx.get('agentPresets')?.composedPreset(agentCtx)
  const base = presetId === undefined ? undefined : await basePersonaOf(ctx, presetId)
  const own = renderPersona()
  // 档案全空且读不到预设身份：什么都不做，保持原生行为。
  if (own === '' && base === undefined) {
    agentCtx[INSTALLED]?.()
    agentCtx[INSTALLED] = undefined
    return
  }
  const fallback = base?.prefix ?? ''
  agentCtx[INSTALLED]?.()
  agentCtx[INSTALLED] = agentCtx.systemPrompt.section({
    name: PERSONA_PREFIX_SECTION,
    order: PERSONA_PREFIX_ORDER,
    // 每次组装求值：保存后已打开的会话下一句话就换人格，而历史一个字节都不动。
    text: () => renderPersona() || fallback,
    ...base?.complete === true ? { complete: true } : {},
  })
}

/**
 * 挂载宿主半端：把人格装到每个新建 agent 上，并登记自己的设置入口。
 * @param ctx - 宿主根上下文。
 * @param config - 档案四个字段。
 */
export function apply(ctx: Context, config: Config): void {
  live.config = config
  // 本插件自带编辑页，关掉配置页的自动生成（字段仍由设置通道读写）。
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
  const reinstall = (agent: AgentLike): Promise<void> => install(ctx, agent as unknown as AgentLike).catch((error: unknown) => {
    // 创建监听是串行的：这里抛错会让整个会话起不来，所以只记日志。
    ctx.logger.warn(`assistant-profile: persona install failed: ${String(error)}`)
  })
  ctx.effect(() => ctx.on('agent/created', ({ agent }) => reinstall(agent as unknown as AgentLike)),
    'assistant-profile: persona')
  // 空白会话换模式 = 把 agent 的作用域重新绑到另一个预设。极简模式的「整段提示只有
  // 人格」是预设自带的标记，重绑之后必须按新预设重新登记，否则它会退化成带工具说明的
  // 普通提示。事件在重绑之后才追加，此刻读到的就是新预设。
  ctx.effect(() => ctx.on('agent-preset/selected', (sessionId: string) => {
    const agents = ctx.get('agents') as { get(id: string): AgentLike | undefined } | undefined
    const agent = agents?.get(String(sessionId))
    if (agent !== undefined) void reinstall(agent)
  }), 'assistant-profile: preset switch')
}
