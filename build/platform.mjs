/**
 * web 外壳会预先注入模块表的这些 specifier（与 harness 的
 * `packages/client/web/src/platform.ts` 同构）。浏览器半端只能 `require()` 这些，
 * 其余依赖必须内联——模块表答不上的 require 会在 factory 执行时抛错。
 *
 * `build.mjs` 用它校验每一个产出的客户端 bundle。
 */
export const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]
