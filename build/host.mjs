/**
 * 宿主半端的打包预设：每个目标一个 ESM 文件，插件清单里声明的生产依赖留成 import。
 *
 * 宿主跑在真实安装里，声明过的依赖就在产物旁边的 node_modules 上，必须保持 import
 * （把 `@deepseek-ai/dsh-attachment` 这类服务类复制进插件包，会让进程里出现第二份）；
 * 其余（本插件自带的 wire 层）全部内联。Node 内置模块两边都不管，tsdown 自己保留。
 *
 * `deps` 的取值规则：dependencies ∪ peerDependencies ∪ optionalDependencies 之外
 * 一律内联——这就是 `bundle: true` 目标（比如预生成的 typert 清单，要把 zod 一起打进去）
 * 的实现方式。
 */
import { readFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { join } from 'node:path'

/**
 * 构造宿主半端的 tsdown 配置。
 * @param options - 包标识、目录、入口与输出目录。
 * @returns tsdown 配置对象。
 */
export function hostConfig({ id, pkgDir, entry, outDir = 'lib' }) {
  const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
  const names = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ])
  const patterns = [...names].sort().map(name => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/|$)`))
  const isProduction = (specifier) => patterns.some(pattern => pattern.test(specifier))

  return {
    name: `${id}/host`,
    entry: { index: entry },
    outDir,
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    // 宿主半端不带 sourcemap：和 harness 自己的 node 半端一样，一个可读的 bundle。
    sourcemap: false,
    deps: {
      neverBundle: (specifier) => isProduction(specifier),
      alwaysBundle: (specifier) => !isBuiltin(specifier) && !isProduction(specifier),
    },
    outputOptions: {
      entryFileNames: 'index.js',
    },
  }
}

/**
 * 自足打包预设：**什么都内联**（连 zod 一起），产出单个 ESM 文件。
 * 预生成的 typert 清单要靠它变成一个不依赖任何 node_modules 的产物——typert loader
 * 会在宿主启动时直接 `import()` 这个文件。
 * @param options - 包标识、入口、输出目录与文件名。
 * @returns tsdown 配置对象。
 */
export function bundleConfig({ id, entry, outDir = 'lib', fileName }) {
  return {
    name: `${id}/${fileName}`,
    entry: { [fileName.replace(/\.js$/u, '')]: entry },
    outDir,
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    sourcemap: false,
    deps: {
      neverBundle: (specifier) => isBuiltin(specifier),
      alwaysBundle: (specifier) => !isBuiltin(specifier),
    },
    outputOptions: {
      entryFileNames: fileName,
    },
  }
}
