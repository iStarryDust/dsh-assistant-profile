#!/usr/bin/env node
/**
 * 助理档案插件的构建入口：`src/` → `dist/`。
 *
 *   node build.mjs              # 全量构建 + 部署到 dist/（含清单与静态文件）
 *   node build.mjs --staging    # 只构建到 .build/out，不动 dist/
 *   node build.mjs --check      # 只构建 + 校验依赖契约，不写 dist/
 *
 * 两个打包目标：
 * 1. `host`   `src/index.ts`        → `dist/lib/index.js`（先 tsc 降级装饰器/using，再交 rolldown）
 * 2. `client` `src/client/index.ts`  → `dist/lib/client.js`（CJS 工厂壳 + CSS Modules）
 *
 * 本插件没有自定义 RPC，所以不需要 typert 清单那两步。
 */
import { createHash } from 'node:crypto'
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { isBuiltin } from 'node:module'
import { PLATFORM_MODULES } from './build/platform.mjs'

const projectRoot = dirname(fileURLToPath(import.meta.url))
const distRoot = join(projectRoot, 'dist')
const buildRoot = join(projectRoot, '.build')
const emitDir = join(buildRoot, 'tsc')
const outRoot = join(buildRoot, 'out')
const toolingRoot = join(projectRoot, 'tooling')

/**
 * 构建期需要、但本包不拥有的依赖：宿主产物要内联 `js-yaml`（预设组合是 YAML），
 * 编辑器要 `@types/*`。都 junction 到 `node_modules/`，让 rolldown 与 TypeScript
 * 按普通 Node 规则解析——不复制、不为库配路径别名。
 */
const BUILD_RUNTIME_MODULES = ['js-yaml', '@types/node', '@types/react', '@types/react-dom']

/** 发布清单里只属于「作者侧」的字段。 */
const AUTHORING_ONLY = ['devDependencies', 'scripts']

/** 要跟着产物一起发出去的静态文件。 */
const STATIC_FILES = ['cordis.patch.yml', 'icon.svg', 'README.md', 'LICENSE']

const flags = new Set(process.argv.slice(2).filter(arg => arg.startsWith('--')))

ensureToolchain()

rmSync(buildRoot, { recursive: true, force: true })
mkdirSync(emitDir, { recursive: true })
mkdirSync(outRoot, { recursive: true })

const manifest = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
console.log(`\n▸ ${manifest.name}@${manifest.version}`)

emitHost()
bundleClient()

report()
if (!validate()) process.exit(1)

if (flags.has('--check')) {
  console.log('\n校验通过（--check：未写 dist/）')
  process.exit(0)
}
if (flags.has('--staging')) {
  console.log(`\n构建产物留在 ${outRoot}（未部署）`)
  process.exit(0)
}

deploy()
console.log(`\n部署完成 → ${distRoot}`)
console.log('本地联调：node ../link.mjs ' + distRoot.replaceAll('\\', '/') + ' --profile <名字>')

/* ────────────────────────────── 以下为内部实现 ────────────────────────────── */

/** 工具链没装时提前给出可执行的提示，并把构建期库 junction 进来。 */
function ensureToolchain() {
  if (!existsSync(join(toolingRoot, 'node_modules', 'tsdown', 'dist', 'run.mjs'))) {
    console.error('缺少构建工具链：先执行 `cd tooling && pnpm install`。')
    process.exit(1)
  }
  const linkDir = join(projectRoot, 'node_modules')
  mkdirSync(linkDir, { recursive: true })
  for (const name of BUILD_RUNTIME_MODULES) {
    const link = join(linkDir, ...name.split('/'))
    if (existsSync(link)) continue
    const physical = toolingPackageDir(name)
    if (physical === undefined) {
      console.error(`工具链缺少 ${name}：把它加进 tooling/package.json 后重装。`)
      process.exit(1)
    }
    mkdirSync(dirname(link), { recursive: true })
    // junction 指向**物理**目录：tooling/node_modules/<name> 本身是 pnpm 的符号链接，
    // 指向符号链接的 junction 在 Windows 上解析不到任何东西。
    symlinkSync(realpathSync(physical), link, 'junction')
    console.log(`⊕ node_modules/${name} → tooling（仅供构建期解析）`)
  }
}

/**
 * 在 tooling 安装里定位一个包。pnpm 的 isolated 布局不保证提供顶层链接
 * （带作用域的 `@types` 会留下空目录），所以也查虚拟存储。
 * @param name - 包名，允许作用域。
 * @returns 包的物理目录；未安装时 undefined。
 */
function toolingPackageDir(name) {
  const direct = join(toolingRoot, 'node_modules', ...name.split('/'))
  if (existsSync(join(direct, 'package.json'))) return realpathSync(direct)
  const virtualStore = join(toolingRoot, 'node_modules', '.pnpm')
  if (!existsSync(virtualStore)) return undefined
  const prefix = `${name.replace('/', '+')}@`
  const entry = readdirSync(virtualStore).find(candidate => candidate.startsWith(prefix))
  if (entry === undefined) return undefined
  const nested = join(virtualStore, entry, 'node_modules', ...name.split('/'))
  return existsSync(nested) ? nested : undefined
}

/**
 * 宿主半端先用 tsc 把 TypeScript 降级成 JavaScript。
 *
 * 这一步不可省：宿主用的是标准装饰器与 `using` 声明，rolldown 只认 legacy 装饰器。
 * `--noCheck` 让它变成纯代码变换：本树里没有 harness 那些包的类型，构建不能依赖它们。
 */
function emitHost() {
  const run = spawnSync(process.execPath, [
    join(toolingRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    '--project', join(projectRoot, 'tsconfig.host.json'),
    '--outDir', emitDir,
    '--rootDir', 'src',
    '--noEmit', 'false',
    '--noCheck',
    // 源码里写的是 `./x.ts`，emit 出来的必须叫 `./x.js`。
    '--rewriteRelativeImportExtensions',
    '--declaration', 'false',
    '--sourceMap', 'false',
  ], { cwd: projectRoot, encoding: 'utf8' })
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim()
  if (run.status !== 0 || /error TS\d+/u.test(output)) {
    console.error(output === '' ? `tsc 退出码 ${String(run.status)}` : output)
    console.error('✗ 宿主半端的 tsc 预编译失败')
    process.exit(1)
  }
  runTsdown({ target: 'host', entry: join(emitDir, 'index.js'), out: join(outRoot, 'lib') })
}

/** 浏览器半端。 */
function bundleClient() {
  runTsdown({ target: 'client', entry: join(projectRoot, 'src', 'client', 'index.ts'), out: join(outRoot, 'lib') })
}

/**
 * 跑一次 tsdown。
 * @param options - 目标、入口与输出目录。
 */
function runTsdown({ target, entry, out }) {
  console.log(`\n▸ ${target}`)
  const run = spawnSync(process.execPath, [
    join(toolingRoot, 'node_modules', 'tsdown', 'dist', 'run.mjs'),
    '--config', join(projectRoot, 'build', 'tsdown.mjs'),
    '--log-level', 'warn',
  ], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, ASSISTANT_TARGET: target, ASSISTANT_ENTRY: entry, ASSISTANT_OUT: out },
  })
  if (run.status !== 0) {
    console.error(`✗ ${target} 构建失败（exit ${String(run.status)}）`)
    process.exit(run.status ?? 1)
  }
}

/** 逐行打印产出的体积与摘要。 */
function report() {
  console.log('')
  const lib = join(outRoot, 'lib')
  if (!existsSync(lib)) return
  for (const file of readdirSync(lib).sort()) {
    const full = join(lib, file)
    if (statSync(full).isDirectory()) continue
    console.log(`  ${String(statSync(full).size).padStart(8)}  ${hash(full)}  lib/${file}`)
  }
}

/**
 * 校验两条运行时契约：
 * 1. 宿主 bundle 只 import 得动「已声明的生产依赖」与内置模块——否则装到别处就是
 *    MODULE_NOT_FOUND（js-yaml 已被内联，不该出现在 import 里）；
 * 2. 浏览器 bundle 只 `require()` 模块表里有的名字——否则打开页面就是空白。
 * @returns 全部通过时 true。
 */
function validate() {
  const table = new Set(PLATFORM_MODULES)
  const hostManifest = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
  const declared = new Set([
    ...Object.keys(hostManifest.dependencies ?? {}),
    ...Object.keys(hostManifest.peerDependencies ?? {}),
    ...Object.keys(hostManifest.optionalDependencies ?? {}),
  ])
  let ok = true
  for (const [file, extension] of [['index.js', 'mjs'], ['client.js', 'cjs']]) {
    const artifact = join(outRoot, 'lib', file)
    if (!existsSync(artifact)) {
      console.error(`  ✗ 缺少产物 lib/${file}`)
      ok = false
      continue
    }
    // 先查语法：带着运行时读不懂的语法（没降级的 `@decorator`、没转译的 `using`）
    // 就是一个死插件。
    const probe = join(outRoot, 'lib', `.syntax-check.${extension}`)
    copyFileSync(artifact, probe)
    const check = spawnSync(process.execPath, ['--check', probe], { encoding: 'utf8' })
    rmSync(probe, { force: true })
    if (check.status !== 0) {
      console.error(`  ✗ lib/${file} 无法被 Node 解析：${(check.stderr ?? '').trim().split('\n')[0]}`)
      ok = false
      continue
    }
    if (file === 'client.js') {
      for (const specifier of bareSpecifiers(readFileSync(artifact, 'utf8'), /require\("([^".][^"]*)"\)/gu)) {
        if (!table.has(specifier)) {
          console.error(`  ✗ lib/client.js require("${specifier}") 不在模块表里——运行时会抛错`)
          ok = false
        }
      }
      continue
    }
    for (const specifier of bareSpecifiers(readFileSync(artifact, 'utf8'), /from\s+"([^".][^"]*)"/gu)) {
      if (isBuiltin(specifier)) continue
      const name = packageNameOf(specifier)
      if (!declared.has(name)) {
        console.error(`  ✗ lib/${file} 依赖 ${specifier}，但 package.json 的 dependencies/peerDependencies 里没有 ${name}`)
        ok = false
      }
    }
  }
  if (ok) console.log('\n✓ 依赖契约通过（宿主只引用已声明的包，浏览器只 require 模块表条目）')
  return ok
}

/**
 * 取 `pattern` 第一捕获组的全部不同匹配。
 * @param source - 文件内容。
 * @param pattern - 带一个捕获组的全局正则。
 * @returns 去重后的 specifier，按首次出现顺序。
 */
function bareSpecifiers(source, pattern) {
  const found = new Set()
  for (const match of source.matchAll(pattern)) found.add(match[1])
  return [...found]
}

/**
 * specifier 里的包名：`@scope/name/sub` → `@scope/name`。
 * @param specifier - import specifier。
 * @returns 包名。
 */
function packageNameOf(specifier) {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

/** 把产物、清单与静态文件写到 `dist/`。 */
function deploy() {
  const libSource = join(outRoot, 'lib')
  const libTarget = join(distRoot, 'lib')
  mkdirSync(libTarget, { recursive: true })
  for (const file of readdirSync(libSource)) {
    const full = join(libSource, file)
    if (statSync(full).isDirectory()) continue
    // 旧产物先删掉：pnpm 装的副本可能和源共用一个 inode。
    rmSync(join(libTarget, file), { force: true })
    copyFileSync(full, join(libTarget, file))
  }
  // 清单：去掉作者侧字段，其余原样（发布清单里不留 workspace/file 协议）。
  const shipped = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
  for (const field of AUTHORING_ONLY) delete shipped[field]
  writeFileSync(join(distRoot, 'package.json'), `${JSON.stringify(shipped, null, 2)}\n`)
  for (const file of STATIC_FILES) {
    if (existsSync(join(projectRoot, file))) copyFileSync(join(projectRoot, file), join(distRoot, file))
  }
  const localeSource = join(projectRoot, 'locale')
  if (existsSync(localeSource)) {
    mkdirSync(join(distRoot, 'locale'), { recursive: true })
    for (const file of readdirSync(localeSource)) {
      copyFileSync(join(localeSource, file), join(distRoot, 'locale', file))
    }
  }
}

/**
 * 报告用的短摘要。
 * @param file - 绝对路径。
 * @returns sha256 的前 8 个十六进制字符。
 */
function hash(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8)
}
