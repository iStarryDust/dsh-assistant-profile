/**
 * 宿主半端的逻辑测试：不开 DSH，用最小替身驱动 `dist/lib/index.js` 的产物。
 *
 * 覆盖：人格遮蔽段的名字/位置与 complete 镜像、空档案回落、子智能体跳过、换模式
 * 重登记、记忆工具开关，以及按钮记忆的信箱（请求 → 用会话模型提炼 → 写回结果 +
 * 落盘记忆）。
 */
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync } from 'node:fs'

// 插件会起一个信箱轮询定时器（真机里跑 0.7s 一次）。测试里不需要它——
// 请求由下面手动派发事件触发——把它换成空实现，免得进程挂住不退出。
globalThis.setInterval = () => 0
globalThis.clearInterval = () => {}

// 把最新的宿主产物拷进测试目录再加载：解析链从这里出发，于是替身包（cordis /
// schemastery）只在测试里生效，插件目录的 node_modules 保持干净。
mkdirSync(new URL('./build/', import.meta.url), { recursive: true })
copyFileSync(new URL('../dist/lib/index.js', import.meta.url), new URL('./build/index.mjs', import.meta.url))
const { default: AssistantProfile } = await import('./build/index.mjs')

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

/**
 * 造一份配置（字段是 ref：`.get()` 读当前值，`.set()` 改当前值）。
 * @param values - 初始值。
 * @returns 配置对象。
 */
function config(values) {
  const ref = key => ({
    get: () => values[key] ?? '',
    set: (next) => { values[key] = next },
  })
  const flag = key => ({ get: () => values[key] === true, set: (next) => { values[key] = next } })
  return {
    name: ref('name'),
    language: ref('language'),
    persona: ref('persona'),
    customsJson: ref('customsJson'),
    memoryEnabled: { get: () => values.memoryEnabled !== false, set: () => {} },
    autoMemory: flag('autoMemory'),
    memoryText: ref('memoryText'),
    rememberSignal: ref('rememberSignal'),
  }
}

/**
 * 造一个宿主上下文替身。
 * @param documents - 预设 id → 组合 YAML。
 * @returns 上下文与派发工具。
 */
function harness(documents, store = {}) {
  const handlers = new Map()
  const disposers = []
  const warnings = []
  const sections = []
  const tools = []
  const updates = []
  const llm = { lines: ['用户偏好简洁的中文回答', '用户在做 DSH 插件'], options: null }
  const presetFor = { current: 'standard' }
  const agents = new Map()
  const agentPresets = {
    composedPreset: () => presetFor.current,
    readDocument: async (id) => {
      const content = documents[id]
      if (content === undefined) throw new Error(`unknown preset ${id}`)
      return { agentPreset: id, content }
    },
  }
  const section = (description) => {
    sections.push(description)
    return () => { description.disposed = true }
  }
  const ctx = {
    logger: { warn: message => { warnings.push(String(message)) } },
    fiber: {},
    systemPrompt: { section },
    tools: {
      register: (definition) => {
        tools.push(definition)
        return () => { definition.disposed = true }
      },
    },
    llm: {
      stream: async function* (options) {
        llm.options = options
        for (const line of llm.lines) yield { type: 'text-delta', index: 0, text: `${line}\n` }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
    inject: (_list, fn) => { fn({ effect: f => f(), settings: { configure: () => () => {} } }) },
    effect: (fn) => {
      const dispose = fn()
      disposers.push(dispose)
      return dispose
    },
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
      // 设置服务落盘后，加载器会把新值就地提交进运行时引用——这里模拟那次提交。
      if (name === 'settings') {
        return {
          update: async (ns, patch) => {
            updates.push({ ns, patch })
            Object.assign(store, patch)
          },
        }
      }
      return undefined
    },
  }
  const agentCtxFor = () => ({ systemPrompt: { section } })
  const created = async (agentCtx, header = {}) => {
    for (const callback of handlers.get('agent/created') ?? []) {
      await callback({ agent: { id: 'session-x', ctx: agentCtx, session: { header } }, source: 'create' })
    }
  }
  const reload = () => { for (const dispose of disposers.splice(0)) dispose?.() }
  const emit = async (event, ...args) => {
    for (const callback of handlers.get(event) ?? []) await callback(...args)
  }
  return {
    ctx, created, agentCtxFor, presetFor, reload, emit, agents, sections, tools, updates, warnings, llm,
    personaSections: () => sections.filter(row => row.name === 'deployment:persona-prefix'),
  }
}

const DOCUMENTS = { standard: STANDARD, minimal: MINIMAL }

// 1. 标准模式：遮蔽段的名字/位置对，complete 不出现，三段文本按序拼好。
{
  const h = harness(DOCUMENTS)
  new AssistantProfile(h.ctx, config({ name: '大肥鱼', language: '简体中文', persona: '你在意证据。' }))
  const agentCtx = h.agentCtxFor()
  await h.created(agentCtx)
  const list = h.personaSections()
  assert.equal(list.length, 1, '标准模式应注册一个遮蔽段')
  assert.equal(list[0].order, 0)
  assert.equal(list[0].complete, undefined, '标准模式不该标 complete')
  assert.equal(list[0].text(), 'Your name is 大肥鱼.\n\nReply in 简体中文 throughout.\n\n你在意证据。')
  console.log('✓ 标准模式：名字/语言/人格三段就位，未标 complete')
}

// 2. 极简模式：镜像预设的 complete。
{
  const h = harness(DOCUMENTS)
  new AssistantProfile(h.ctx, config({ name: '大肥鱼', language: '中文', persona: '只说结论。' }))
  h.presetFor.current = 'minimal'
  const agentCtx = h.agentCtxFor()
  await h.created(agentCtx)
  assert.equal(h.personaSections().at(-1).complete, true, '极简模式必须镜像 complete')
  console.log('✓ 极简模式：complete 镜像成功')
}

// 3. 空档案：回落到预设原文。
{
  const h = harness(DOCUMENTS)
  new AssistantProfile(h.ctx, config({ name: '', language: '', persona: '' }))
  const agentCtx = h.agentCtxFor()
  await h.created(agentCtx)
  assert.equal(h.personaSections()[0].text(), 'You are a coding agent powered by the {{model}} model.')
  console.log('✓ 空档案：回落预设原文')
}

// 4. 子智能体：一律不碰。
{
  const h = harness(DOCUMENTS)
  new AssistantProfile(h.ctx, config({ name: '大肥鱼', language: '中文', persona: 'x' }))
  const agentCtx = h.agentCtxFor()
  await h.created(agentCtx, { origin: 'subagent' })
  assert.equal(h.personaSections().length, 0, '子智能体不该被注入')
  console.log('✓ 子智能体：不注入')
}

// 5. 换模式：按新预设重登记，complete 跟上。
{
  const h = harness(DOCUMENTS)
  new AssistantProfile(h.ctx, config({ name: '小星', language: '中文', persona: '只讲证据。' }))
  const agentCtx = h.agentCtxFor()
  h.agents.set('session-x', { id: 'session-x', ctx: agentCtx, session: { header: {} } })
  await h.created(agentCtx)
  h.presetFor.current = 'minimal'
  await h.emit('agent-preset/selected', 'session-x', 'minimal')
  assert.equal(h.personaSections().at(-1).complete, true, '换到极简后必须补上 complete')
  console.log('✓ 换模式：按新预设重登记')
}

// 6. 记忆开关：默认（自动记忆关）不注册；打开后注册 memory_add。
{
  const values = { name: 'x', language: '中文', persona: 'y' }
  const h = harness(DOCUMENTS, values)
  const cfg = config(values)
  new AssistantProfile(h.ctx, cfg)
  assert.equal(h.tools.length, 0, '自动记忆关闭时不该注册工具')
  cfg.autoMemory.set(true)
  await h.emit('loader/volatile-update')
  assert.equal(h.tools.length, 1, '打开自动记忆后应注册 memory_add')
  assert.equal(h.tools[0].name, 'memory_add')
  assert.deepEqual(h.tools[0].parameters.required, ['text'])
  console.log('✓ 记忆开关：按开关注册 / 撤下 memory_add')
}

// 7. 按钮记忆：信箱请求 → 用会话模型提炼 → 写回结果并落盘记忆。
{
  const values = { name: '大肥鱼', language: '中文', persona: 'y', memoryText: '', rememberSignal: '' }
  const h = harness(DOCUMENTS, values)
  new AssistantProfile(h.ctx, config(values))
  h.agents.set('session-1', {
    id: 'session-1',
    ctx: h.agentCtxFor(),
    session: {
      id: 'session-1',
      header: {},
      requestHeader: () => ({ config: { provider: 'mock', model: 'mock-model' } }),
    },
  })
  const request = JSON.stringify({ id: 'req-1', phase: 'request', sessionId: 'session-1', text: '用户：我更喜欢简洁的回答' })
  values.rememberSignal = request
  await h.emit('loader/volatile-update')
  // pumpRemember 异步跑：等它把结果写回。
  for (let i = 0; i < 100 && values.rememberSignal === request; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  const result = JSON.parse(values.rememberSignal)
  assert.equal(result.phase, 'done')
  assert.equal(result.id, 'req-1')
  assert.equal(result.saved, true)
  assert.deepEqual(result.entries, ['用户偏好简洁的中文回答', '用户在做 DSH 插件'])
  assert.match(values.memoryText, /用户偏好简洁的中文回答/)
  assert.match(values.memoryText, /\[20\d\d-\d\d-\d\d \d\d:\d\d\]/)
  assert.equal(h.llm.options.provider, 'mock')
  assert.equal(h.llm.options.sessionId, 'session-1')
  const persisted = h.updates.map(row => Object.keys(row.patch)).flat()
  assert.ok(persisted.includes('memoryText'), '记忆必须经设置服务落盘')
  assert.ok(persisted.includes('rememberSignal'), '结果必须写回信箱')
  console.log('✓ 按钮记忆：信箱请求 → 提炼 → 写回结果 + 落盘记忆')
}

// 8. 信箱：坏数据与已完成信号都被忽略。
{
  const values = { name: 'x', language: '', persona: '', memoryText: '', rememberSignal: 'not json' }
  const h = harness(DOCUMENTS, values)
  new AssistantProfile(h.ctx, config(values))
  await h.emit('loader/volatile-update')
  assert.equal(h.warnings.length, 0, '坏信箱不该产生告警')
  values.rememberSignal = JSON.stringify({ id: 'req-2', phase: 'done', saved: true })
  await h.emit('loader/volatile-update')
  assert.equal(h.llm.options, null, 'done 信号不该触发提炼')
  console.log('✓ 信箱：坏数据与已完成信号都被忽略')
}

console.log('\n全部通过（8 项）')
