# 助理档案 · dsh-assistant-profile

给 DeepSeek Harness 一份**全局人格**：名称、风格、语言、人格提示词四段，装一次，之后每个新会话的系统提示最前面都从它开始。侧栏「新会话」上方会显示这份档案的助理名。

一个档案，四个模式通用（标准 / PTC / 极简 / 创造）。不需要复制预设，也不需要改模式选择器。

## 它做了什么

宿主半端只做一件事：每个对话 agent 创建时（以及空白会话换模式重新绑定预设时），在这个 agent **自己的作用域**里注册一段 `deployment:persona-prefix`。作用域链上最近的同名段胜出，于是预设自带的身份句被档案替换，而工具、流程、模式语义一律不动。

这正是官方给子代理发独立人格用的那条路径（`dsh-subagent` 的 `applyChildComposition`），所以它对四种预设都成立。

注入文本长这样（空行分隔，缺哪段就少哪段）：

```
Your name is 大肥鱼.

Style: 冷静、精确，先给结论

Reply in 简体中文 throughout.

<你写的人格提示词…>
```

- **极简模式**的预设把人格当作「整段系统提示只有这一句」（`complete: true`）。遮蔽段会镜像这个标记——极简模式下系统提示就**只有**你的档案，仍然没有工具说明，符合那个模式原本的设计。
- 四段全空时回落到预设原文，等于原生行为。
- **子智能体不注入**：委派出去的孩子保留它自己的人格。

## 改人格不会重算历史

DeepSeek 的上下文缓存是前缀缓存：系统提示在最前面，直接改写开头那条会让后面全部失效。

档案的文本是**每次组装提示词时求值**的，所以保存后下一个请求的提示词就变了，而**历史一个字节都不动**。剩下的交给宿主判定：模型路由声明了 `systemPromptUpdate: 'in-history'`（DSH 默认的 `deepseek-flash` 条目就声明了）时，变化的系统提示会被**追加在已缓存的历史之后**，历史那段前缀仍然命中，只有新增的这一小段按普通输入计费。

会话日志里的 `request/context` 会写明当前路由的模式：

```json
{"provider":"deepseek-official","model":"deepseek-flash","systemPromptUpdate":"in-history"}
```

路由不支持这个模式时（例如默认的 `deepseek-v4-pro` 条目），改人格会让下一次请求从开头失效一次——那是路由能力问题，不是插件的选择。介意的话，把改动留到新会话。

## 界面

- 侧栏「插件」下面多一行**助理档案**（行序 5，夹在插件与自动化任务之间）。
- 点开是主区的一个页面：名称、语言、风格、人格提示词，右下角实时字数（超过 2000 字转成提醒色），底部「保存 / 撤销改动」与状态行。
- 「新会话」按钮上方一行小字 + 首字方块显示助理名；侧栏收成 56px 图标栏时自动隐藏；改完名称保存后立刻变。
- 名称默认 `大肥鱼`、语言默认 `中文`。

## 数据存在哪

四个字段就是本插件在 profile 里的配置，由官方设置通道读写，落进 profile 的 `cordis.patch.yml`：

```yaml
- id: assistant-profile
  name: '@istarry/dsh-assistant-profile'
  config:
    name: 小星
    style: 冷静、精确，先给结论
    language: 简体中文
    persona: 你是一个只讲证据的助理。不确定就说不确定。
```

所以它跟着 profile 走：换 profile 就是另一份档案；备份 profile 就备份了人格。

## 安装

```bash
dsh plugin --profile <profile> add @istarry/dsh-assistant-profile
# 本地包：
dsh plugin --profile <profile> add E:/Plugin/发布版/dsh-assistant-profile/dist/istarry-dsh-assistant-profile-0.1.1.tgz
```

重启 DSH 后生效。卸载：

```bash
dsh plugin --profile <profile> remove @istarry/dsh-assistant-profile
```

`profile` 里残留的四行配置不会影响原生行为（插件不在了，没人读它），手工删掉更干净。

## 与 dsh-agent-suite 的关系

两者遮蔽的是同一个段（`deployment:persona-prefix`），**不要同时启用**：后加载的会赢，人格会互相覆盖。需要多个 agent 各自的人格请用 agent-suite；只要一个随身人格就用这个。

## 构建

```bash
cd tooling && pnpm install    # 首次：tsdown + lightningcss + typescript + js-yaml
cd .. && node build.mjs       # src/ → dist/（含清单与静态文件）
node build.mjs --staging      # 只构建到 .build/out
node build.mjs --check        # 构建 + 依赖契约校验，不写 dist/
```

宿主产物把 `js-yaml` 内联进去，运行时只依赖 `@deepseek-ai/schemastery`（声明在 `dependencies`，由 pnpm 装进插件自己的 node_modules）。浏览器半端只 `require` 模块表里的条目（react / ui-primitives）。

改代码只改 `src/`，产物由构建生成。

## 已知边界

- 只注入**顶层会话**，子代理不注入。
- 读不到预设定义时（注册表异常）降级为普通注入，不镜像 `complete`，也不报错。
- 「名称 / 语言 / 风格」是**进提示词**的三行结构；想让模型自称别的名字，直接写在人格里也可以。
- 侧栏名plate 是插在「新会话」按钮前的 DOM 节点（外壳没给这个位置留 slot），React 重渲染把它冲掉时会自动补回。
