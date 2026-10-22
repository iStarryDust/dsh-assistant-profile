/**
 * tsdown 入口：构建器（build.mjs）每个目标调用一次，用环境变量选择要产出哪一半。
 * 标识、入口、输出目录全部来自环境，避免出现第二份会漂移的构建配置。
 *
 * 环境：
 * - `ASSISTANT_TARGET` `host` | `client`（默认 `host`）
 * - `ASSISTANT_ENTRY`  该目标的入口，绝对路径
 * - `ASSISTANT_OUT`    输出目录，绝对路径（默认包内 `lib`）
 * - `ASSISTANT_HASH_BASE` 可选，CSS 类名哈希的命名空间前缀
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clientConfig } from './client.mjs'
import { hostConfig } from './host.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'))
const id = manifest.name
const target = process.env.ASSISTANT_TARGET ?? 'host'
const outDir = process.env.ASSISTANT_OUT ?? 'lib'
const entry = process.env.ASSISTANT_ENTRY
if (entry === undefined) throw new Error('build: ASSISTANT_ENTRY is required')

export default () => {
  switch (target) {
    case 'host':
      // 宿主半端从 tsc 的产物打包，绝不直接吃 TypeScript 源码：rolldown 不认识
      // 插件用的标准装饰器与 `using`，直接喂 TS 会把它们原样留在产物里。
      return [hostConfig({ id, pkgDir: projectRoot, entry, outDir })]
    case 'client':
      return [clientConfig({
        id,
        pkgDir: projectRoot,
        entry,
        hashBase: process.env.ASSISTANT_HASH_BASE,
        outDir,
      })]
    default:
      throw new Error(`build: unknown target "${target}"`)
  }
}
