/**
 * 助理记忆的存储形态：**一段 markdown 文本**，存在本插件的配置字段里
 * （`memoryText`），而不是独立的文件。
 *
 * 为什么不用文件：记忆要能被设置页读写、能随 profile 持久化、能在注入时同步取到。
 * 官方设置通道（`configForms` → profile 的 Cordis patch）对**标量字段**支持最好，
 * 而自定义 RPC 需要 typert 生成物，那条路在本插件里没走通（client 半端加载器会跳过
 * 带生成 descriptors 的 bundle）。所以把整段文本当作一个配置项：编辑器保存 = 写配置，
 * 注入 = 读配置，重启后仍在，全程不经过远程调用。
 *
 * 文本形状与 agent-suite 的 memory.md 保持一致，便于以后迁移：
 * `# 标题` 之类的自由文本由用户写，每条记忆是一行 `- [YYYY-MM-DD HH:mm] 内容`。
 *
 * @module @istarry/dsh-assistant-profile/memory
 */

/** 一条记忆：时间戳与内容。 */
export interface MemoryEntry {
  /** 记住这条事实时写入的本地 `YYYY-MM-DD HH:mm` 时间戳。 */
  readonly stamp: string
  /** 事实正文。 */
  readonly content: string
}

/** 一次追加的结果。 */
export interface MemoryAppendResult {
  /** 是否追加了新条目。 */
  readonly appended: boolean
  /** 是否刷新了同义条目的时间戳。 */
  readonly refreshed: boolean
  /** 追加之后的整段文本。 */
  readonly text: string
}

const ENTRY_RE = /^-?\s*\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\]\s*(.*)$/

/**
 * 把本地时间格式化成条目的时间戳。
 * @param date - 时间来源，测试可注入。
 * @returns `YYYY-MM-DD HH:mm`。
 */
export function stampNow(date: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 从文本里解析出所有记忆条目。
 * @param text - 整段记忆文本。
 * @returns 按出现顺序的条目。
 */
export function parseEntries(text: string): MemoryEntry[] {
  const entries: MemoryEntry[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = ENTRY_RE.exec(line)
    if (match === null) continue
    entries.push({ stamp: match[1] ?? '', content: (match[2] ?? '').trim() })
  }
  return entries
}

/**
 * 去重比较键：大小写折叠、连续空白压成一个。
 * @param content - 条目内容。
 * @returns 规范键。
 */
export function dedupeKey(content: string): string {
  return content.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * 往整段记忆文本里追加一条事实，并对已有条目去重：
 * 同义条目刷新时间戳，否则追加新行；非条目行（标题、空行）原样保留。
 * @param text - 现有整段文本。
 * @param content - 要记住的事实。
 * @param at - 时间来源。
 * @returns 追加结果，含新文本。
 */
export function appendToText(text: string, content: string, at: Date = new Date()): MemoryAppendResult {
  const trimmed = content.trim()
  if (trimmed === '') return { appended: false, refreshed: false, text }
  const stamp = stampNow(at)
  const key = dedupeKey(trimmed)
  const headerLines: string[] = []
  const entryLines: string[] = []
  for (const line of text.split(/\r?\n/)) {
    if (ENTRY_RE.test(line)) entryLines.push(line)
    else headerLines.push(line)
  }
  for (let index = 0; index < entryLines.length; index += 1) {
    const match = ENTRY_RE.exec(entryLines[index] as string)
    if (match === null) continue
    if (dedupeKey((match[2] ?? '').trim()) === key) {
      entryLines[index] = `- [${stamp}] ${trimmed}`
      return { appended: false, refreshed: true, text: compose(headerLines, entryLines) }
    }
  }
  entryLines.push(`- [${stamp}] ${trimmed}`)
  return { appended: true, refreshed: false, text: compose(headerLines, entryLines) }
}

/** 拼回整段文本，顺手收掉标题块首尾的空行（避免反复追加时越积越多）。 */
function compose(headerLines: readonly string[], entryLines: readonly string[]): string {
  const meaningful = [...headerLines]
  while (meaningful.length > 0 && /^\s*$/.test(meaningful[0] as string)) meaningful.shift()
  while (meaningful.length > 0 && /^\s*$/.test(meaningful[meaningful.length - 1] as string)) meaningful.pop()
  const body = [...meaningful, ...entryLines].join('\n')
  return body.endsWith('\n') ? body : `${body}\n`
}
