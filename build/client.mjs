/**
 * 浏览器半端的打包预设：产出**一个 CJS 工厂**，正是 web 外壳的模块表认的那种形态：
 *
 * ```js
 * window.__ModuleLoader__.load({ id, factory: (require) => { … return module.exports } })
 * ```
 *
 * 三条不能漂移的约定：
 * 1. 外壳通过模块表共享的 specifier 必须留成 `require()`，其余全部内联——模块表答不上
 *    的 require 在 factory 执行时必抛。
 * 2. CSS Modules 在这里用 lightningcss 编译（`[hash]_[local]`），样式表以
 *    `<style data-plugin-css>` 在 factory 执行时注入。
 * 3. lightningcss 的 hash 取名**文件名**，所以交给编译器的文件名是按「包名 + 包内相对
 *    路径」合成的，绝不用绝对构建路径——换机器、换目录都能复现同样的类名。
 */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PLATFORM_MODULES } from './platform.mjs'

// 编译器装在 tooling/（发布清单里不能出现 workspace 协议），所以从那里解析。
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const toolingRequire = createRequire(resolve(projectRoot, 'tooling', 'package.json'))
const { transform } = toolingRequire('lightningcss')

export { PLATFORM_MODULES } from './platform.mjs'

const CSS_VIRTUAL_PREFIX = '\0assistant-css:'
const GLOBAL_CSS_VIRTUAL_PREFIX = '\0assistant-global-css:'
const INLINE_CSS_VIRTUAL_PREFIX = '\0assistant-inline-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'
const INLINE_CSS_QUERY = '?inline'

/**
 * 生成「注入样式 + 导出类名表」的模块源码。
 * @param id - 打在外壳 `<style>` 标签上的包名。
 * @param tagId - `${id}/${文件名}`，注入幂等用的标签身份。
 * @param css - 编译后的样式文本。
 * @param classMap - 哈希后的本地类名 → 实际类名。
 * @returns 模块源码。
 */
function styleInjectionModule(id, tagId, css, classMap) {
  const source = [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(tagId)};`,
    'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
    '  const tag = document.createElement(\'style\');',
    `  tag.dataset.plugin = ${JSON.stringify(id)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
  ]
  source.push(classMap === undefined ? 'export {};' : `export default ${JSON.stringify(classMap)};`)
  return source.join('\n')
}

/**
 * 按源码里的写法解析样式表路径。
 * @param source - 源码里写的相对 specifier。
 * @param importer - 导入方的绝对路径。
 * @returns 样式表的绝对路径。
 */
function sourceAssetPath(source, importer) {
  return isAbsolute(source) ? source : resolve(dirname(importer), source)
}

/**
 * 构造浏览器半端的 tsdown 配置。
 * @param options - 包标识、目录与哈希命名空间。
 * @returns tsdown 配置对象。
 */
export function clientConfig({ id, pkgDir, entry, hashBase, outDir = 'lib' }) {
  const requested = new Set(PLATFORM_MODULES)
  const isRequested = (specifier) => requested.has(specifier)
  const syntheticName = (fileId) =>
    `${hashBase ?? id}/${relative(pkgDir, fileId).split(sep).join('/')}`

  return {
    name: `${id}/client`,
    entry: { client: entry },
    outDir,
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: (specifier) => isRequested(specifier),
      alwaysBundle: (specifier) => !isRequested(specifier),
    },
    inputOptions: {
      resolve: {
        conditionNames: [
          (process.env.NODE_ENV ?? 'production') === 'development' ? 'development' : 'production',
          'browser', 'import', 'module', 'default',
        ],
      },
    },
    // 浏览器侧会内联读 process.env.NODE_ENV 与 import.meta.env 的依赖；CJS 产物装不下
    // import.meta，必须在这里替换掉，否则 factory 一执行就抛。
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    plugins: [
      {
        name: 'assistant-css-modules-inline',
        resolveId(source, importer) {
          if (!source.endsWith('.module.css')) return null
          const abs = importer !== undefined ? sourceAssetPath(source, importer) : source
          return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
        },
        async load(virtualId) {
          if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
          const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
          this.addWatchFile(fileId)
          const source = await readFile(fileId)
          const { code, exports: cssExports } = transform({
            filename: syntheticName(fileId),
            code: source,
            cssModules: { pattern: '[hash]_[local]' },
            minify: true,
          })
          const classMap = {}
          const entries = Object.entries(cssExports ?? {})
            .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          for (const [local, exp] of entries) classMap[local] = exp.name
          return styleInjectionModule(id, `${id}/${basename(fileId)}`, code.toString(), classMap)
        },
      },
      {
        name: 'assistant-css-text-inline',
        resolveId(source, importer) {
          if (!source.endsWith(`.css${INLINE_CSS_QUERY}`)) return null
          const stylesheet = source.slice(0, -INLINE_CSS_QUERY.length)
          const abs = importer !== undefined ? sourceAssetPath(stylesheet, importer) : stylesheet
          return INLINE_CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
        },
        async load(virtualId) {
          if (!virtualId.startsWith(INLINE_CSS_VIRTUAL_PREFIX)) return null
          const fileId = virtualId.slice(INLINE_CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
          this.addWatchFile(fileId)
          const source = await readFile(fileId)
          const { code } = transform({ filename: syntheticName(fileId), code: source, minify: true })
          return `export default ${JSON.stringify(code.toString())};`
        },
      },
      {
        name: 'assistant-css-global-inline',
        resolveId(source, importer) {
          if (!source.endsWith('.css') || source.endsWith('.module.css') || source.endsWith(INLINE_CSS_QUERY)) return null
          const abs = importer !== undefined ? sourceAssetPath(source, importer) : source
          return GLOBAL_CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
        },
        async load(virtualId) {
          if (!virtualId.startsWith(GLOBAL_CSS_VIRTUAL_PREFIX)) return null
          const fileId = virtualId.slice(GLOBAL_CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
          this.addWatchFile(fileId)
          const source = await readFile(fileId)
          const { code } = transform({ filename: syntheticName(fileId), code: source, minify: true })
          return styleInjectionModule(id, `${id}/${basename(fileId)}`, code.toString())
        },
      },
    ],
    outputOptions: {
      entryFileNames: 'client.js',
      chunkFileNames: 'client.[name].js',
      sourcemapExcludeSources: false,
      banner: (chunk) => `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, `
        + `${chunk.isEntry ? '' : `chunk: ${JSON.stringify(chunk.fileName)}, `}factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  }
}
