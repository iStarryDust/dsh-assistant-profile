/**
 * 助理档案 · 宿主半端。
 *
 * 一个档案、一份人格、四个模式通用。人格的做法只有一件事：每个对话 agent 创建时，
 * 在这个 agent **自己的上下文**里注册一段 `deployment:persona-prefix`——作用域链上最近
 * 的同名段胜出，于是预设自带的身份句被档案替换，而工具、流程、模式语义一律不动。
 * 官方给子代理发独立人格走的正是这条路径（`dsh-subagent` 的 applyChildComposition），
 * 所以它对标准 / PTC / 极简 / 创造四种预设都成立，不用复制预设组合，也不用改模式
 * 选择器与会话绑定逻辑。
 *
 * 极简模式的预设人格是「整段系统提示只有这一句」（complete: true）。遮蔽段必须镜像
 * 这个标记，否则会把它变成「全套工具说明 + 人格」，等于改掉了那个模式的定义。
 *
 * 文本是**每次组装提示词时求值**的，所以保存后已打开的会话下一句话就用新人格。
 *
 * ## 助理记忆
 *
 * 单档案所以单记忆：一份 markdown（见 `memory.ts`），以 `memory:assistant` 段注入，
 * order 500——排在人格（0）之后、工具目录（1000）之前：记忆描述的是「用户和我是什么
 * 关系」，工具说明会引用这些前提。段文本每次组装重读文件，所以编辑器保存后下一句话
 * 就带着新记忆。两个开关都是 volatile：设置页写、加载器就地提交、无需重挂。
 *
 * 模型主动记忆走 `memory_add` 工具，仅在「记忆开 + 自动记忆开」时注册；设置页重建
 * 注册靠监听 `loader/volatile-update`。按钮提取走 `rememberFromSession`：用该会话自己的
 * 模型把选中的对话文本提炼成条目后追加。
 *
 * @module @istarry/dsh-assistant-profile
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { DEFAULT_SCHEMA, Type, load as yamlLoad } from 'js-yaml'
import { Service } from '@deepseek-ai/cordis'
// 类型面：设置通道（configure）、系统提示服务、agent 生命周期与预设注册表。
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'

import { DEFAULT_PERSONA } from './presets.ts'
import { appendToText } from './memory.ts'

export * from './memory.ts'

/** Cordis 插件名。 */
export const name = 'assistant-profile'

/** 人格所在的那一段的规范名——预设与档案共用同一个名字，遮蔽才成立。 */
const PERSONA_PREFIX_SECTION = 'deployment:persona-prefix'

/** 该段在提示词里的位置（宿主 SECTION_ORDERS.DEPLOYMENT_PERSONA_PREFIX）。 */
const PERSONA_PREFIX_ORDER = 0

/** 记忆段的名字与位置：人格之后、工具目录（1000）之前。 */
export const MEMORY_SECTION = 'memory:assistant'
const MEMORY_ORDER = 500

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
  /** 是否把助理记忆注入系统提示。 */
  memoryEnabled: Volatile<boolean>
  /** 模型是否可以自己判断该记什么（`memory_add` 工具）。记忆关闭时无效。 */
  autoMemory: Volatile<boolean>
  /** 整段记忆文本：设置页编辑、注入时读取、自动记忆追加，全程走配置通道。 */
  memoryText: Volatile<string>
  /**
   * 按钮记忆的信箱。浏览器把「要提炼哪段文本」写成 JSON 放进来（`phase: request`），
   * 宿主处理完把结果写回同一个字段（`phase: done`）——本插件没有自定义 RPC，
   * 这条字段就是两侧唯一的呼叫通道。
   */
  rememberSignal: Volatile<string>
}

/**
 * 运行时 schema。字段都是 volatile：它们由「助理档案」页与「Agent记忆」设置页
 * 而不是插件配置页编辑，改动经设置通道写回 profile 的 patch，重启后仍在。默认值取
 * 内置「默认三」，所以装好就是一条带人设的鱼；三栏全部清空再保存，则什么都不注入。
 */
export const Config: z<Config> = z.object({
  name: z.string().default(DEFAULT_PERSONA.name).volatile(),
  language: z.string().default(DEFAULT_PERSONA.language).volatile(),
  persona: z.string().default(DEFAULT_PERSONA.persona).volatile(),
  customsJson: z.string().default('[]').volatile(),
  memoryEnabled: z.boolean().default(true).description('Inject the assistant memory into the system prompt').volatile(),
  autoMemory: z.boolean().default(false).description('Let the model write memories on its own judgment (requires memoryEnabled)').volatile(),
  memoryText: z.string().default('').description('The assistant memory document').volatile(),
  rememberSignal: z.string().default('').description('Browser-to-host mailbox for the remember button').volatile(),
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
 * 把档案渲染成系统提示的首段。三段空行分隔、各自可缺省；全空时返回空串，
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

/** agent 句柄的最小面（会话头、会话 id、提炼时要读的请求配置）。 */
interface AgentLike {
  readonly id: string
  readonly ctx: Context
  readonly session: {
    readonly id: string
    readonly header: { readonly origin?: 'subagent' }
    /** 该会话最近一次请求的调用配置；按钮提炼沿用它自己的 provider/model。 */
    readonly requestHeader?: () => { config?: Record<string, unknown> } | undefined
  }
}

/**
 * 给一个对话 agent 装上档案人格。子智能体不动：它们的人格属于委派方，
 * 而且 `dsh-subagent` 可能已经给这个孩子发了一份。
 * @param ctx - 插件上下文。
 * @param agent - 新建（或恢复）的 agent。
 */
async function installPersona(ctx: Context, agent: AgentLike): Promise<void> {
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

const MEMORY_ADD_DESCRIPTION =
  'Add one fact to the assistant\'s long-term memory when the conversation reveals '
  + 'something worth remembering across future sessions: stable preferences, work '
  + 'habits, durable decisions, or facts the human stated as lasting. Remember prose '
  + 'conclusions, not the raw exchange; merge related facts into one entry. Do not '
  + 'store credentials, one-off task details, or anything the human said is transient.'

/** `memory_add` 的输出结构。 */
const MEMORY_ADD_VALUE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    saved: { type: 'boolean', required: true },
    outcome: { type: 'string' },
    content: { type: 'string' },
  },
} as const

/** 把选中的对话文本提炼成记忆条目的指令（与 agent-suite 一致的规则）。 */
const REMEMBER_INSTRUCTION =
  '你是一个长期记忆提炼引擎。用户从对话中圈选了下面这段内容，明确希望把它记入助手的长期记忆。'
  + '请把这些内容提炼成简短、稳定、可跨会话复用的记忆条目。'
  + '\n规则：'
  + '\n- 每行输出一条记忆内容本身（不带时间戳、不带 "- " 前缀、不带编号）。'
  + '\n- 用户既然圈选了它，请默认提取出其中明确、稳定的信息：称呼、偏好、习惯、约定、身份事实、项目背景。'
  + '\n- 把相关事实合并成一条；不要逐字复述，只提炼结论，但保留关键名称、数字、关系。'
  + '\n- 只有当整段内容完全是临时任务细节或含凭据、密钥时，才不输出条目（此时只输出一个真正的空行）。'
  + '\n- 用与对话片段一致的语言书写（对话是中文就用中文，是英文就用英文）。'
  + '\n- 严禁输出"空行""（空行）""无""没有""none"之类的占位文字。'

/** 按钮提炼的结果：写进信箱，也回给浏览器。 */
export interface RememberValue {
  readonly saved: boolean
  readonly entries?: readonly string[]
  readonly outcome: string
}

/** 按钮记忆的信箱形状：浏览器写 `request`，宿主处理完写 `done`。 */
interface RememberSignal {
  readonly id?: string
  readonly phase?: 'request' | 'done'
  readonly sessionId?: string
  readonly text?: string
  readonly saved?: boolean
  readonly entries?: readonly string[]
  readonly outcome?: string
}

/** 设置命名空间 = 本插件在 profile 里的条目 id。 */
const SETTINGS_NS = 'assistant-profile'

/** 信箱里一次请求最多带多少字符（别把超长选区写进 profile 的 patch）。 */
const REMEMBER_TEXT_LIMIT = 20000

/** 信箱轮询间隔：0.7s 读一次字符串字段，人感觉不到延迟。 */
const MAILBOX_POLL_MS = 700

/** `memory_add` 的返回结构。 */
interface MemoryAddValue {
  readonly saved: boolean
  /** 写入结果：appended / refreshed / unchanged，或未写入的原因。 */
  readonly outcome?: string
  /** 落盘后的条目正文。 */
  readonly content?: string
}

/**
 * 一条用户消息。按线上形状手搭而不是引 `@deepseek-ai/dsh-llm`：宿主那边的包在插件
 * 目录里解析不到（只有 cordis 与 schemastery 两端共享），而消息只是 role/content/id
 * 三个字段的纯数据。
 * @param text - 消息正文。
 * @returns 可直接交给 llm.stream 的用户消息。
 */
function userMessage(text: string): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }
}

/**
 * 解析信箱字段；坏数据当空（宁可什么都不做，也不误跑一次）。
 * @param raw - 字段原文。
 * @returns 解析出的信号。
 */
function parseSignal(raw: string): RememberSignal | undefined {
  if (raw.trim() === '') return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    return parsed as RememberSignal
  } catch {
    return undefined
  }
}

/**
 * 助理档案服务：人格注入 + 单份长期记忆。
 *
 * 记忆的存储、注入、两个开关、`memory_add` 工具与按钮提炼都在这里；客户端只负责
 * 设置页、聊天里的「记住」按钮和选择弹窗。
 *
 * 按钮提炼没有自定义 RPC：浏览器把「要提炼哪段文本」写进 `rememberSignal`
 * （`phase: request`），宿主在 `loader/volatile-update` 里接手，用该会话自己的模型
 * 跑一次提炼，把结果写回同一个字段（`phase: done`）。写入统一走设置服务，所以记忆
 * 与它一样落进 profile 的 patch。
 */
export default class AssistantProfile extends Service {
  static inject = ['systemPrompt', 'tools', 'llm']

  static Config = Config

  /** `memory_add` 工具的注册 disposer，只在开关允许时存在。 */
  private toolDisposer: (() => void) | undefined

  /** 正在处理一次按钮提炼：同一时间只跑一个。 */
  private remembering = false

  /** 上一次处理过的请求 id，防止同一请求被重复执行。 */
  private lastRequestId: string | undefined

  constructor(ctx: Context, public readonly config: Config) {
    // 注册成有名服务：Service 需要一个名字（无名的 provide 会落到 undefined 上）。
    super(ctx, 'assistantProfile')
    live.config = config

    // 本插件自带编辑页，关掉配置页的自动生成（字段仍由设置通道读写）。
    ctx.inject(['settings'], (child) => {
      child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
    })

    // 记忆段：注册在根上下文，所有会话共享同一份。文本每次组装重读配置，
    // 所以编辑器保存后下一句话就带着新记忆。
    ctx.effect(() => ctx.systemPrompt.section({
      name: MEMORY_SECTION,
      order: MEMORY_ORDER,
      text: () => {
        if (config.memoryEnabled.get() !== true) return ''
        return config.memoryText.get().trim()
      },
    }), 'assistant-profile: memory section')

    // 人格：每个 agent 创建时装一次；空白会话换模式会重绑作用域，要重新登记。
    const reinstall = (agent: AgentLike): Promise<void> => installPersona(ctx, agent).catch((error: unknown) => {
      ctx.logger.warn(`assistant-profile: persona install failed: ${String(error)}`)
    })
    ctx.effect(() => ctx.on('agent/created', ({ agent }) => {
      void reinstall(agent as unknown as AgentLike)
    }), 'assistant-profile: persona')
    ctx.effect(() => ctx.on('agent-preset/selected', (sessionId: string) => {
      const agents = ctx.get('agents') as { get(id: string): AgentLike | undefined } | undefined
      const agent = agents?.get(String(sessionId))
      if (agent !== undefined) void reinstall(agent)
    }), 'assistant-profile: preset switch')

    // 两个开关与信箱都是 volatile：设置页写、加载器就地提交、无需重挂。
    this.syncTool()
    ctx.on('loader/volatile-update', () => {
      this.syncTool()
      this.schedulePump()
    })

    // 设置通道的写入在实测里并不会触发 `loader/volatile-update`（值会提交进引用，
    // 但没有那次事件），所以信箱靠一次轻量轮询来取：每 700ms 读一个字符串字段，
    // 没有新请求时就是一次 JSON 判定。
    ctx.effect(() => {
      const poller = setInterval(() => { void this.pumpRemember() }, MAILBOX_POLL_MS)
      return () => { clearInterval(poller) }
    }, 'assistant-profile: mailbox poll')

    // 插件重载时若有未处理的请求，接着处理掉。
    this.schedulePump()


  }

  /** 按当前开关注册或撤下 `memory_add` 工具。 */
  private syncTool(): void {
    // 记忆总开关关掉时，自动记忆一并失效：没有注入就不该往一个不生效的存储里写。
    const want = this.config.memoryEnabled.get() === true && this.config.autoMemory.get() === true
    if (want && this.toolDisposer === undefined) {
      this.toolDisposer = this.registerTool()
    } else if (!want && this.toolDisposer !== undefined) {
      this.toolDisposer()
      this.toolDisposer = undefined
    }
  }

  /** 注册模型侧的记忆工具，返回撤下函数。 */
  private registerTool(): () => void {
    const ctx = this.ctx
    // 直接给官方 ToolDefinition 的形状：defineTool 只是把参数说明翻成 JSON Schema
    // 再加一层参数校验，这里参数只有一个必填字符串，用不上那层机器。
    const disposer = ctx.tools.register({
      name: 'memory_add',
      description: MEMORY_ADD_DESCRIPTION,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: {
            type: 'string',
            description: 'The stable fact to remember, in its final prose form.',
          },
        },
        required: ['text'],
      },
      output: {
        schema: MEMORY_ADD_VALUE_SCHEMA,
        render: (_args: unknown, value: unknown): { type: 'text'; text: string }[] => {
          const v = value as MemoryAddValue
          if (v.saved) return [{ type: 'text', text: `记住：${v.content ?? ''}` }]
          return [{ type: 'text', text: `未记住：${v.outcome ?? '未启用'}` }]
        },
      },
      execute: async (args: unknown): Promise<MemoryAddValue> => {
        const text = typeof (args as { text?: unknown }).text === 'string' ? (args as { text: string }).text : ''
        const trimmed = text.trim()
        if (trimmed === '') return { saved: false, outcome: 'empty fact' }
        const result = appendToText(this.config.memoryText.get(), trimmed)
        await this.writeMemory(result.text)
        return {
          saved: true,
          content: result.content,
          outcome: result.appended ? 'appended' : result.refreshed ? 'refreshed' : 'unchanged',
        }
      },
    } as never)
    const teardown = () => { disposer(); this.toolDisposer = undefined }
    ctx.effect(() => teardown, 'assistant-profile: memory tool')
    return () => { disposer() }
  }

  /**
   * 把一段记忆文本落进配置。只能经设置服务写：`Volatile` 只暴露 `get()`，
   * 宿主没有权限直接改自己的配置引用；写入经它之后，加载器会把新值就地提交进
   * 运行时引用（下一次组装提示词就读到），并落进 profile 的 patch。
   * @param next - 新的整段文本。
   */
  private async writeMemory(next: string): Promise<void> {
    await this.persist({ memoryText: next })
  }

  /**
   * 经设置服务写回本插件的 volatile 字段。
   * @param patch - 要写入的字段。
   * @returns 是否写成功（失败只记日志，由调用方决定要不要重试）。
   */
  private async persist(patch: Record<string, string>): Promise<boolean> {
    const settings = this.ctx.get('settings') as
      | { update(ns: string, patch: object): Promise<void> }
      | undefined
    if (settings === undefined) return false
    try {
      await settings.update(SETTINGS_NS, patch)
      return true
    } catch (error) {
      this.ctx.logger.warn(`assistant-profile: persist failed: ${String(error)}`)
      return false
    }
  }

  /**
   * 把一次信箱处理排到当前事务之外。
   *
   * 设置写入本身跑在 HMR 事务里（`hmr.runExclusive`），而写回结果又要经设置服务再开
   * 一个事务——直接调用会撞上「HMR transactions cannot be nested」。所以触发点统一
   * 用 `setTimeout(0)` 推到事务之外，轮询那条路天然在事务外。
   */
  private schedulePump(): void {
    setTimeout(() => { void this.pumpRemember() }, 0)
  }

  /**
   * 检查信箱里有没有新请求，有就跑一次提炼并写回结果。
   *
   * 这里绝不向外抛：调用方是 `void`，一次未捕获的拒绝会被加载器当成插件加载失败。
   */
  private async pumpRemember(): Promise<void> {
    if (this.remembering) return
    const signal = parseSignal(this.config.rememberSignal.get())
    if (signal?.phase !== 'request' || signal.id === undefined) return
    if (signal.id === this.lastRequestId) return
    this.remembering = true
    this.lastRequestId = signal.id
    let result: RememberValue
    try {
      result = await this.remember(signal.sessionId ?? '', signal.text ?? '')
    } catch (error) {
      result = { saved: false, outcome: `failed: ${errorChain(error)}` }
    }
    try {
      const published = await this.publishSignal({
        id: signal.id,
        phase: 'done',
        saved: result.saved,
        entries: result.entries,
        outcome: result.outcome,
      })
      // 写不回去就忘掉这次 id，让下一轮轮询再试（例如恰好撞上 HMR 事务）。
      if (!published) this.lastRequestId = undefined
    } finally {
      this.remembering = false
    }
  }

  /**
   * 把结果写回信箱（同一个字段），浏览器据此结束等待。
   * @param signal - 带结果的信箱内容。
   */
  private async publishSignal(signal: RememberSignal): Promise<boolean> {
    return await this.persist({ rememberSignal: JSON.stringify(signal) })
  }

  /**
   * 用该会话自己的模型把选中的对话文本提炼成记忆条目并追加。
   *
   * 会话必须还在线（agent 提供模型配置）；提炼不写入对话历史，只发一次独立请求。
   * @param sessionId - 执行提炼的会话。
   * @param text - 选中的对话文本。
   * @returns 是否记住了、记住了什么、或失败原因。
   */
  private async remember(sessionId: string, text: string): Promise<RememberValue> {
    const trimmed = text.trim().slice(0, REMEMBER_TEXT_LIMIT)
    if (trimmed === '') return { saved: false, outcome: 'empty selection' }
    const agents = this.ctx.get('agents') as { get(id: unknown): AgentLike | undefined } | undefined
    const agent = agents?.get(sessionId)
    if (agent === undefined) return { saved: false, outcome: 'session not open' }
    const callConfig = agent.session.requestHeader?.()?.config
    if (callConfig === undefined) return { saved: false, outcome: 'no provider/model available' }
    const llm = this.ctx.llm as {
      stream(options: Record<string, unknown>): AsyncIterable<{
        type: string
        text?: string
        reason?: { kind?: string; failure?: unknown }
      }>
    }
    let output = ''
    let failure: string | undefined
    try {
      for await (const chunk of llm.stream({
        ...callConfig,
        messages: [userMessage(trimmed), userMessage(REMEMBER_INSTRUCTION)],
        sessionId: agent.session.id,
      })) {
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string') output += chunk.text
        else if (chunk.type === 'finish') {
          const kind = chunk.reason?.kind
          if (kind === 'error' || kind === 'aborted') failure = `analysis ${kind}: ${errorChain(chunk.reason?.failure)}`
          else if (kind === 'max-tokens') failure = 'analysis truncated at the token cap'
        }
      }
    } catch (error) {
      return { saved: false, outcome: `analysis failed: ${errorChain(error)}` }
    }
    if (failure !== undefined) return { saved: false, outcome: failure }
    const entries = splitLines(output)
    if (entries.length === 0) return { saved: false, outcome: 'nothing worth remembering' }
    let next = this.config.memoryText.get()
    for (const entry of entries) next = appendToText(next, entry).text
    await this.writeMemory(next)
    return { saved: true, entries, outcome: `remembered ${String(entries.length)}` }
  }
}

/** 把错误及其 cause 链压成一行。 */
function errorChain(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  while (typeof current === 'object' && current !== null && parts.length < 4) {
    const message = (current as { message?: unknown }).message
    if (typeof message !== 'string' || message === '') break
    parts.push(message)
    current = (current as { cause?: unknown }).cause
  }
  return parts.join(' | ')
}

/** 把模型输出拆成一行一条记忆（去列表前缀、丢空行、丢占位词）。 */
function splitLines(text: string): string[] {
  const entries: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = stripInvisible(raw.trim().replace(/^[-*]\s+/, '').trim())
    if (line === '') continue
    if (isVacuousEntry(line)) continue
    entries.push(line)
  }
  return entries
}

/** 去掉模型可能在正文周围吐出的不可见字符。 */
export function stripInvisible(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F-\u009F\u00A0\u00AD\u1680\u2000-\u200B\u2028-\u202F\u205F-\u206F\u3000\uFEFF\uFFFD]/g, '')
    .trim()
}

/** 这一行是不是「没有内容」的占位词。 */
export function isVacuousEntry(line: string): boolean {
  const cleaned = stripInvisible(line)
  if (cleaned === '') return true
  const normalized = cleaned.toLowerCase().replace(/[\s（）()「」"'　\-*—–]+/g, '')
  return normalized === ''
    || normalized === '空行'
    || normalized === '无'
    || normalized === '没有'
    || normalized === '无内容'
    || normalized === '无值得记住的内容'
    || normalized === '暂无'
    || normalized === 'none'
    || normalized === 'no'
    || normalized === 'nothing'
    || normalized === 'na'
    || normalized === 'n/a'
}
