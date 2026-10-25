/**
 * 删除一个会话：磁盘日志、投影索引、工作区登记，最后通知前端把这一行拿掉。
 *
 * 这一版 harness 的会话存储（`sessionPersistence`）**没有** remove 方法，所以删除是
 * 自己做的：按磁盘布局（`<root>/<项目>/session-<id>/`）删掉会话目录，再尽力清理上层
 * 记账（索引行、工作区登记），最后发 `api-session/removed`——官方客户端的
 * session-controller 正是靠这个事件把行从侧栏移除（`remote.$on('api-session/removed')`）。
 *
 * 三条安全线：
 * 1. 正在跑的会话直接拒绝（`agent.status === 'running'`）；
 * 2. 空闲但仍挂在注册表里的，先 detach（与 edit-regen 的做法一致）；
 * 3. 只删“路径里带这个会话 id”的目录，拿不准就不删。
 *
 * @module @istarry/dsh-assistant-profile/session-delete
 */

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'

/** 删除结果。 */
export interface DeleteOutcome {
  /** 是否真的删掉了。 */
  readonly ok: boolean
  /** 成功时 `deleted`，失败时是原因码。 */
  readonly outcome: string
}

/** 宿主侧句柄的最小面（全部用 `ctx.get` 软取，避免 fiber 注入检查）。 */
interface AgentsLike {
  get(id: string): { status?: string } | undefined
  store?: Map<string, unknown>
  detachEntered?: (entry: unknown) => void
}

/**
 * 会话持久化：只用到它的存储根目录。
 *
 * **不要**用它的 `locate` / `listArtifacts` 定位单个会话：这一版里它们的第一个参数
 * 是 options（内含 `signal`），传会话 id 会走进 `signal?.throwIfAborted()`，直接把宿主
 * 带崩（实测 `fatal load failure: TypeError: signal?.throwIfAborted is not a function`）。
 * 会话目录的形状是稳定的：`<root>/<项目目录>/session-<会话 id>/`。
 */
interface PersistenceLike {
  root?: unknown
}

/** 会话查询：内部删除索引行（公开面没有删除）。 */
interface QueryLike {
  _deleteSession?(source: 'persisted' | 'live', id: string): void
}

/** 工作区登记：把会话从列表记账里摘掉。 */
interface RegistryLike {
  deleteKnown?(id: string): void
  forgetSession?(id: string): void
}

/**
 * 存储根目录：优先问持久化服务要，退一步用 `$DSH_HOME/sessions`。
 * @param persistence - 持久化服务。
 * @returns 绝对路径，或 undefined（两处都拿不到时放弃删除）。
 */
function sessionsRootOf(persistence: PersistenceLike | undefined): string | undefined {
  const root = persistence?.root
  if (typeof root === 'string' && root !== '' && existsSync(root)) return root
  const home = process.env['DSH_HOME']
  const fallback = home === undefined || home === ''
    ? join(homedir(), '.dsh', 'sessions')
    : join(home, 'sessions')
  return existsSync(fallback) ? fallback : undefined
}

/**
 * 找出一个会话在磁盘上的所有目录（分代文件可能让一个会话占多个目录）。
 * @param root - 存储根目录。
 * @param sessionId - 会话 id。
 * @returns 命中的目录列表（通常只有一个）。
 */
function sessionDirsOf(root: string, sessionId: string): string[] {
  const found: string[] = []
  let projects: string[] = []
  try {
    projects = readdirSync(root)
  } catch {
    return found
  }
  // 目录名就是会话 id 本身（形如 `session-<uuid>`），两种写法都试一遍：
  // 不同版本对外给的 id 有的带 `session-` 前缀，有的不带。
  const names = new Set([sessionId, `session-${sessionId}`])
  if (sessionId.startsWith('session-')) names.add(sessionId.slice('session-'.length))
  for (const project of projects) {
    for (const name of names) {
      const dir = join(root, project, name)
      try {
        if (statSync(dir).isDirectory()) found.push(dir)
      } catch {
        // 这个项目下没有这个会话，继续。
      }
    }
  }
  return [...new Set(found)]
}

/**
 * 删除一个会话。
 * @param ctx - 宿主上下文。
 * @param sessionId - 要删的会话。
 * @returns 结果（失败时带原因码，由前端翻译）。
 */
export function deleteSession(ctx: Context, sessionId: string): DeleteOutcome {
  const id = sessionId.trim()
  if (id === '') return { ok: false, outcome: 'no session' }

  // 1) 运行中一律拒绝；空闲还挂着的先摘下来。
  const agents = ctx.get('agents') as AgentsLike | undefined
  const agent = agents?.get(id)
  if (agent?.status === 'running') return { ok: false, outcome: 'running' }
  if (agent !== undefined) {
    const entry = agents?.store?.get(id)
    if (entry === undefined || typeof agents?.detachEntered !== 'function') return { ok: false, outcome: 'open' }
    try {
      agents.detachEntered(entry)
    } catch {
      return { ok: false, outcome: 'open' }
    }
  }

  // 2) 磁盘：<root>/<项目>/session-<id>/（分代时可能不止一个）。
  const persistence = ctx.get('sessionPersistence') as PersistenceLike | undefined
  const root = sessionsRootOf(persistence)
  if (root === undefined) return { ok: false, outcome: 'delete failed' }
  const dirs = sessionDirsOf(root, id)
  if (dirs.length === 0) return { ok: false, outcome: 'not found' }
  const removed: string[] = []
  for (const dir of dirs) {
    try {
      rmSync(dir, { recursive: true, force: true })
      removed.push(dir)
    } catch {
      return { ok: false, outcome: 'delete failed' }
    }
  }
  if (removed.length === 0) return { ok: false, outcome: 'delete failed' }

  // 3) 上层记账：都当尽力而为，删不掉也不该让文件复活。
  try {
    (ctx.get('sessionQuery') as QueryLike | undefined)?._deleteSession?.('persisted', id)
  } catch {
    // 索引行是派生数据；删不掉最多留一条查不到的记录。
  }
  const registry = ctx.get('workspaceRegistry') as RegistryLike | undefined
  try {
    registry?.forgetSession?.(id)
  } catch {
    // ignore
  }
  try {
    registry?.deleteKnown?.(id)
  } catch {
    // ignore
  }
  try {
    ;(ctx.get('sessionProjectionCache') as { forget?(id: string): void } | undefined)?.forget?.(id)
  } catch {
    // ignore
  }

  // 4) 前端：官方 session-controller 监听这个事件把行移除。
  try {
    const bus = ctx as unknown as { emit(event: string, ...args: unknown[]): void }
    bus.emit('api-session/removed', id)
  } catch {
    return { ok: true, outcome: 'deleted (silent)' }
  }
  return { ok: true, outcome: 'deleted' }
}
