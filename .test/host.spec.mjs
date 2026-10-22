/**
 * 宿主半端的逻辑测试：不开 DSH，用最小替身驱动 `apply` 的真实产物。
 *
 * 覆盖的是最容易出错、也最值得盯的几条：遮蔽段的名字与位置、极简模式 complete 的
 * 镜像、空档案回落到预设原文、子智能体不被动、加载器方言（`!!js`）不炸、插件重载
 * 不重复注册。
 */
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync } from 'node:fs'

// 把最新的宿主产物拷进测试目录再加载：解析链从这里出发，于是替身 schemastery
// 只在测试里生效，插件包的 node_modules 保持干净（真实运行用 profile 里装的那份）。
mkdirSync(new URL('./build/', import.meta.url), { recursive: true })
copyFileSync(new URL('../dist/lib/index.js', import.meta.url), new URL('./build/index.mjs', import.meta.url))
const { apply } = await import('./build/index.mjs')

/** readDocument 返回的两种组合（与随包预设同形）。 */
const STANDARD = `- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    suffix: Your working directory is {{cwd}}.
    prefix: You are a coding agent powered by the {{model}} model.
- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
  disabled: !!js process.platform === 'win32'
`

const MINIMAL = `- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    prefix: You are a helpful software engineer assistant.
    complete: true
    includeRuntimeContext: false
`

/** 造一个档案配置（字段是 ref：`.get()` 读当前值）。 */
function config(values) {
  const ref = key => ({ get: () => values[key] ?? '' })
  return { name: ref('name'), language: ref('language'), persona: ref('persona') }
}

/** 造一个宿主上下文替身。 */
function harness(documents) {
  const handlers = new Map()
  const registered = []
  const disposers = []
  const presetFor = { current: 'standard' }
  const agentPresets = {
    composedPreset: () => presetFor.current,
    readDocument: async (id) => {
      const content = documents[id]
      if (content === undefined) throw new Error(`unknown preset ${id}`)
      return { agentPreset: id, content }
    },
  }
  const agents = new Map()
  const ctx = {
    logger: { warn: () => {} },
    fiber: {},
    inject: (_list, fn) => { fn({ effect: f => f(), settings: { configure: () => () => {} } }) },
    effect: (fn) => { const d = fn(); disposers.push(d); return d },
    on: (event, callback) => {
      const list = handlers.get(event) ?? []
      list.push(callback)
      handlers.set(event, list)
      return () => {
        const index = list.indexOf(callback)
        if (index >= 0) list.splice(index, 1)
      }
    },
    get: (name) => {
      if (name === 'agentPresets') return agentPresets
      if (name === 'agents') return { get: id => agents.get(id) }
      return undefined
    },
  }
  const agentCtxFor = () => {
    const sections = []
    return {
      sections,
      systemPrompt: {
        section: (description) => {
          sections.push(description)
          return () => { description.disposed = true }
        },
      },
    }
  }
  const created = async (agentCtx, header = {}) => {
    for (const callback of handlers.get('agent/created') ?? []) {
      await callback({ agent: { id: 'session-x', ctx: agentCtx, session: { header } }, source: 'create' })
    }
  }
  // 模拟 cordis 重载：先收回上一次 apply 的全部 effect（监听器随之注销）。
  const reload = () => { for (const dispose of disposers.splice(0)) dispose?.() }
  // 派发一个宿主事件（注册表发的是 agent-preset/selected）。
  const emit = async (event, ...args) => {
    for (const callback of handlers.get(event) ?? []) await callback(...args)
  }
  return { ctx, created, agentCtxFor, registered, presetFor, reload, agents, emit }
}

const DOCUMENTS = { standard: STANDARD, minimal: MINIMAL, broken: 'not: a list' }

// 1. 标准模式：遮蔽段的名字/位置对，complete 不出现，四段文本按序拼好。
{
  const h = harness(DOCUMENTS)
  apply(h.ctx, config({ name: '大肥鱼', language: '简体中文', persona: '你在意证据。' }))
  const agentCtx = h.agentCtxFor()
  await h.created(agentCtx)
  assert.equal(agentCtx.sections.length, 1, '标准模式应注册一个遮蔽段')
  const section = agentCtx.sections[0]
  assert.equal(section.name, 'deployment:persona-prefix')
  assert.equal(section.order, 0)
  assert.equal(section.complete, undefined, '标准模式不该标 complete')
  assert.equal(
    section.text(),
    'Your name is 大肥鱼.\n\nReply in 简体中文 throughout.\n\n你在意证据。',
  )
  console.log('✓ 标准模式：名字/语言/人格三段就位，未标 complete')
}

// 2. 极简模式：镜像预设的 complete，文本仍是档案。
{
  const h = harness(DOCUMENTS)
  apply(h.ctx, config({ name: '大肥鱼', language: '中文', persona: '只说结论。' }))
  h.presetFor.current = 'minimal'
  const agentCtx = h.agentCtxFor()
  await h.created(agentCtx)
  const section = agentCtx.sections[0]
  assert.equal(section.complete, true, '极简模式必须镜像 complete')
  assert.equal(section.text(), 'Your name is 大肥鱼.\n\nReply in 中文 throughout.\n\n只说结论。')
  console.log('✓ 极简模式：complete 镜像成功，整段提示仍只有人格')
}

// 3. 空档案：回落到预设原文，等于原生行为。
{
  const h = harness(DOCUMENTS)
  apply(h.ctx, config({ name: '', language: '', persona: '' }))
  const agentCtx = h.agentCtxFor()
  await h.created(agentCtx)
  assert.equal(agentCtx.sections[0].text(), 'You are a coding agent powered by the {{model}} model.')
  console.log('✓ 空档案：回落预设原文')
}

// 4. 子智能体：一律不碰。
{
  const h = harness(DOCUMENTS)
  apply(h.ctx, config({ name: '大肥鱼', language: '中文', persona: 'x' }))
  const agentCtx = h.agentCtxFor()
  await h.created(agentCtx, { origin: 'subagent' })
  assert.equal(agentCtx.sections.length, 0, '子智能体不该被注入')
  console.log('✓ 子智能体：不注入')
}

// 5. 预设读不到：照常注入，只是不镜像 complete。
{
  const h = harness(DOCUMENTS)
  apply(h.ctx, config({ name: '大肥鱼', language: '中文', persona: '在。' }))
  h.presetFor.current = 'missing'
  const agentCtx = h.agentCtxFor()
  await h.created(agentCtx)
  assert.equal(agentCtx.sections.length, 1)
  assert.equal(agentCtx.sections[0].complete, undefined)
  console.log('✓ 预设缺失：降级为普通注入，不抛错')
}

// 6. 同一个 agent 上重装（插件热重载）：旧监听先注销，旧段被收回，只留一个。
{
  const h = harness(DOCUMENTS)
  apply(h.ctx, config({ name: '一号', language: '中文', persona: '' }))
  const agentCtx = h.agentCtxFor()
  await h.created(agentCtx)
  const first = agentCtx.sections[0]
  h.reload()
  apply(h.ctx, config({ name: '二号', language: '中文', persona: '' }))
  await h.created(agentCtx)
  assert.equal(first.disposed, true, '旧段应被收回')
  assert.equal(agentCtx.sections.at(-1).text(), 'Your name is 二号.\n\nReply in 中文 throughout.')
  console.log('✓ 重载：旧段收回，新段接上')
}

// 7. 实时生效：文本每次求值，改配置后同一个段立刻返回新值。
{
  const h = harness(DOCUMENTS)
  const values = { name: '一号', language: '中文', persona: '' }
  const ref = key => ({ get: () => values[key] })
  apply(h.ctx, { name: ref('name'), language: ref('language'), persona: ref('persona') })
  const agentCtx = h.agentCtxFor()
  await h.created(agentCtx)
  values.persona = '换了人格。'
  assert.equal(agentCtx.sections[0].text(), 'Your name is 一号.\n\nReply in 中文 throughout.\n\n换了人格。')
  console.log('✓ 实时生效：不重建会话也能读到新人格')
}

// 8. 空白会话换模式：按新预设重登记，把 complete 补上。
{
  const h = harness(DOCUMENTS)
  apply(h.ctx, config({ name: '小星', language: '中文', persona: '只讲证据。' }))
  const agentCtx = h.agentCtxFor()
  h.agents.set('session-x', { id: 'session-x', ctx: agentCtx, session: { header: {} } })
  await h.created(agentCtx)
  assert.equal(agentCtx.sections.at(-1).complete, undefined, '标准模式先不标 complete')
  // 用户把模式从标准换成极简：注册表重绑作用域后追加 agent-preset/selected。
  h.presetFor.current = 'minimal'
  await h.emit('agent-preset/selected', 'session-x', 'minimal')
  const section = agentCtx.sections.at(-1)
  assert.equal(section.complete, true, '换到极简后必须补上 complete')
  assert.equal(section.text(), 'Your name is 小星.\n\nReply in 中文 throughout.\n\n只讲证据。')
  console.log('✓ 换模式：按新预设重登记，complete 跟上')
}

console.log('\n全部通过（8 项）')
