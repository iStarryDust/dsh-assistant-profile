# Agent助理 · dsh-assistant-profile

给 DeepSeek Harness 一份**全局人格**和**一份长期记忆**：名称、语言、人格提示词三段，装一次，之后每个新会话的系统提示最前面都从它开始；记忆紧跟在人格后面，聊天里点一下就能把选中的对话提炼进去。侧栏「新会话」上方会显示这份档案的助理名。

一个档案，四个模式通用（标准 / PTC / 极简 / 创造）。不需要复制预设，也不需要改模式选择器。

## 它做了什么

宿主半端只做一件事：每个对话 agent 创建时（以及空白会话换模式重新绑定预设时），在这个 agent **自己的作用域**里注册一段 `deployment:persona-prefix`。作用域链上最近的同名段胜出，于是预设自带的身份句被档案替换，而工具、流程、模式语义一律不动。

这正是官方给子代理发独立人格用的那条路径（`dsh-subagent` 的 `applyChildComposition`），所以它对四种预设都成立。

注入文本长这样（空行分隔，缺哪段就少哪段）：

```
Your name is 大肥鱼.

Reply in 简体中文 throughout.

<你写的人格提示词…>
```

- **极简模式**的预设把人格当作「整段系统提示只有这一句」（`complete: true`）。遮蔽段会镜像这个标记——极简模式下系统提示就**只有**你的档案，仍然没有工具说明，符合那个模式原本的设计。
- 四段全空时回落到预设原文，等于原生行为。
- **子智能体不注入**：委派出去的孩子保留它自己的人格。

## 助理记忆

单档案所以单记忆：一份 markdown（一行一条 `- [YYYY-MM-DD HH:mm] 内容`），随档案存在 profile 的同一份配置里，所有会话共享。

**注入位置**：`memory:assistant` 段，order 500 —— 排在人格（0）之后、工具目录（1000）之前。记忆描述的是「用户和我是什么关系」，工具说明会引用这些前提。

**三个入口**：

- **聊天里的「记住」按钮**：每条助手消息的动作行上（官方的点赞/点踩旁边）多一个 ✨。点开是一个勾选弹窗，列出这个会话里可提炼的用户/助手消息；勾选后提交，宿主用**该会话自己的模型**跑一次独立请求，把选中的对话压成几条稳定事实，逐条追加（同义条目只刷新时间戳，不重复堆积）。
- **设置 → Agent记忆**：两个开关（启用记忆 / 自动记忆）+ 一个编辑框。手工写、改、删都在这儿，保存即落盘。
- **`memory_add` 工具**：只在「启用记忆 + 自动记忆」都打开时注册，模型可以在对话中自己决定记什么。

**提炼是 fail-closed 的**：会话不在线、取不到这个会话的模型配置、模型没吐出一条可用条目，都不会写任何东西，只把原因回显在弹窗里。

### 三个实现上的坑（改这个功能前先看）

1. **宿主不能直接写自己的配置**。`Volatile` 只暴露 `get()`，写入必须经设置服务（`settings.update(ns, patch)`），它才会落进 profile 的 patch 并由加载器提交回运行时引用。
2. **写回要挪出 HMR 事务**。设置写入本身跑在 `hmr.runExclusive` 里，而写回结果又要经设置服务再开一个事务——直接调用会抛 `HMR transactions cannot be nested`。所以所有触发点都过一层 `setTimeout(0)`。
3. **设置写入不会触发 `loader/volatile-update`**（实测；值会提交进引用，但没有那次事件）。信箱因此靠 700ms 轮询：每次只读一个字符串字段，没有新请求时就是一次 JSON 判定。

因为插件目录里解析不到 `@deepseek-ai/dsh-tools` / `dsh-llm` / `dsh-session`（只有 `cordis` 由宿主提供），工具定义与提炼用的消息都按官方线上形状**手搭**，不 import 这几个包。

## 删除会话

侧栏任意会话行的「…」菜单里多一行**删除**（红色，带分隔线，排在「复制 Session ID」之后）。确认后删的是这个会话本身：

- **磁盘**：`<DSH_HOME>/sessions/<项目>/<会话 id>/` 整个目录（日志、分代文件一起），
- **索引**：会话查询里那一行（下次搜索不会再出现），
- **登记**：工作区里对这个会话的记账，
- **界面**：宿主发 `api-session/removed`，官方 session-controller 收到后把行从侧栏移除。

正在运行的会话会被拒绝（先停止），空闲但还开着的会话会先被摘下再删。

### 为什么不是调一个 `remove()` 就完事

这一版 harness 的 `sessionPersistence` **没有**删除方法，`locate` / `listArtifacts` 的第一个参数又是 options（里面装 `signal`）——把会话 id 传进去会走进 `signal?.throwIfAborted()`，直接把宿主带崩（实测 `fatal load failure`）。所以删除按目录布局自己做，只认 `<root>/<项目>/<会话 id>` 这一种形状；命中不到就返回「找不到」，宁可不动手。

## 改人格不会重算历史

DeepSeek 的上下文缓存是前缀缓存：系统提示在最前面，直接改写开头那条会让后面全部失效。

档案的文本是**每次组装提示词时求值**的，所以保存后下一个请求的提示词就变了，而**历史一个字节都不动**。剩下的交给宿主判定：模型路由声明了 `systemPromptUpdate: 'in-history'`（DSH 默认的 `deepseek-flash` 条目就声明了）时，变化的系统提示会被**追加在已缓存的历史之后**，历史那段前缀仍然命中，只有新增的这一小段按普通输入计费。

会话日志里的 `request/context` 会写明当前路由的模式：

```json
{"provider":"deepseek-official","model":"deepseek-flash","systemPromptUpdate":"in-history"}
```

路由不支持这个模式时（例如默认的 `deepseek-v4-pro` 条目），改人格会让下一次请求从开头失效一次——那是路由能力问题，不是插件的选择。介意的话，把改动留到新会话。

## 界面

- 侧栏「插件」下面多一行**Agent助理**（行序 5，夹在插件与自动化任务之间）。
- 点开是主区的一个页面：名称、语言、人格提示词，右下角实时字数（超过 2000 字转成提醒色）。
- 「保存」行左侧是人格预设：**默认一 / 默认二 / 默认三**（点击只把三段文本填进表单，落盘仍按「保存」）加「另存」出来的自定义（名字取自「名称」，胶囊右侧带小删除钮）；装好默认用**默认三**，放不下横向滚动。
- 「新会话」按钮上方一行小字 + 首字方块显示助理名；侧栏收成 56px 图标栏时自动隐藏；改完名称保存后立刻变。
- 名称默认 `大肥鱼`、语言默认 `中文`。

## 数据存在哪

四个字段就是本插件在 profile 里的配置，由官方设置通道读写，落进 profile 的 `cordis.patch.yml`：

```yaml
- id: assistant-profile
  name: '@istarry/dsh-assistant-profile'
  config:
    name: 小星
    language: 简体中文
    persona: 你是一个只讲证据的助理。不确定就说不确定。
```

所以它跟着 profile 走：换 profile 就是另一份档案；备份 profile 就备份了人格。

## 安装

```bash
dsh plugin --profile <profile> add @istarry/dsh-assistant-profile
# 本地包：先构建，再在 dist/ 里打包
node build.mjs && (cd dist && npm pack)
dsh plugin --profile <profile> add ./dist/istarry-dsh-assistant-profile-<version>.tgz
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

- 只注入**顶层会话**，子代理不注入（记忆段是全局的，子代理读得到）。
- **没有远程调用**：记忆、信箱、归档全都走设置通道与配置字段，所以不需要 typert 生成物。
- 读不到预设定义时（注册表异常）降级为普通注入，不镜像 `complete`，也不报错。
- 三栏全部清空再保存 = 什么都不注入（回到原生身份句）；装好时默认是默认三的内容。
- 侧栏名plate 是插在「新会话」按钮前的 DOM 节点（外壳没给这个位置留 slot），React 重渲染把它冲掉时会自动补回。

## 安装后如果插件没出现

DSH 的插件安装器会用 pnpm 的 isolated 布局装包（包在 `node_modules/.pnpm/`，
顶层 `node_modules/<包名>` 为空），而 loader 从顶层解析，于是「装了但界面里没有」。

遇到这种情况，在 profile 目录执行一次：



然后重启 DSH 即可。
