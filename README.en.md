# Assistant Profile · dsh-assistant-profile

One **global persona** and one **long-term memory** for DeepSeek Harness: name, language, persona prompt, and a memory that rides right behind the persona in every system prompt. Install it once and every new session opens with it at the very top of the system prompt. The sidebar shows the assistant's name above New Session.

One profile, all four modes (standard / PTC / minimal / creator). No preset duplication, no mode-picker override.

## What it does

The host half does exactly one thing: when a chat agent is created (and when a blank session is re-bound to another preset), it registers a `deployment:persona-prefix` section in that agent's **own scope**. The nearest same-named section wins, so the preset's identity line is replaced while tools, flow, and mode semantics stay untouched.

That is the same path the official subagent runtime uses for per-child personas (`dsh-subagent`'s `applyChildComposition`), which is why it works for all four presets.

The injected text looks like this (blank-line separated, each part optional):

```
Your name is 大肥鱼.

Reply in 简体中文 throughout.

<your persona prompt…>
```

- **Minimal mode** treats the persona as the complete system prompt (`complete: true`). The shadowing section mirrors that flag, so minimal mode's prompt becomes *only* your persona — still no tool instructions, exactly as that mode is designed.
- With all four fields empty it falls back to the preset's own text, i.e. native behaviour.
- **Subagents are left alone**: a delegated child keeps its own persona.

## Assistant memory

One profile means one memory: a markdown document (one `- [YYYY-MM-DD HH:mm] content` line per fact) stored with the profile alongside the persona, shared by every session.

**Where it lands**: section `memory:assistant`, order 500 — after the persona (0), before the tool catalog (1000). Memory states who the user and the assistant are, which the tool descriptions then assume.

**Three ways in**:

- **The Remember button in chat**: every assistant message's action strip (beside the official like/dislike pair) gains a ✨. It opens a picker listing the session's user/assistant messages; submit and the host runs **that session's own model** once to condense the selection into a few stable facts, appending each (an identical fact only refreshes its stamp instead of piling up).
- **Settings → Agent memory**: two switches (memory / auto memory) and an editor. Hand-written edits land on save.
- **The `memory_add` tool**: registered only while both switches are on, letting the model decide what to remember mid-conversation.

Extraction is fail-closed: an offline session, a missing model configuration, or a model that returns nothing writable leaves the store untouched and reports the reason in the dialog.

### Three pitfalls worth knowing before touching this

1. **A plugin cannot write its own config.** `Volatile` exposes `get()` only; writes must go through the settings service (`settings.update(ns, patch)`), which persists to the profile patch and lets the loader commit the new value back into the runtime reference.
2. **Write-backs must escape the HMR transaction.** A settings write runs inside `hmr.runExclusive`, and writing the result back opens another transaction — calling it inline throws `HMR transactions cannot be nested`. Every trigger therefore goes through `setTimeout(0)`.
3. **Settings writes do not emit `loader/volatile-update`** (measured: the value commits into the reference, the event never fires). The mailbox is polled every 700 ms instead — one string read, one JSON check when idle.

Because `@deepseek-ai/dsh-tools` / `dsh-llm` / `dsh-session` do not resolve from the plugin directory (only `cordis` is host-provided), the tool definition and the extraction messages are hand-built to the official wire shapes rather than imported.

## Editing the persona does not recompute history

DeepSeek context caching is prefix caching: the system prompt sits at the front, so rewriting the leading system message invalidates everything after it.

The persona text is **evaluated at every assembly**, so saving a new one changes the next request's prompt while **not touching a single byte of history**. The rest is the host's call: on a model route declaring `systemPromptUpdate: 'in-history'` (the default `deepseek-flash` entry does), the changed prompt is **appended after the cached history**, so the prefix through that history stays reusable and only the new snippet is billed as ordinary input.

The session log states the mode in `request/context`:

```json
{"provider":"deepseek-official","model":"deepseek-flash","systemPromptUpdate":"in-history"}
```

On a route without it (the default `deepseek-v4-pro` entry, for example) a mid-session edit costs one full cache miss from the first token. That is a route capability, not a plugin choice; if it matters, make the edit between sessions.

## UI

- A new **Assistant Profile** row in the sidebar, right below Plugins (order 5).
- It opens a main-area page: name, language, persona prompt, a live character counter (turns warning-coloured past 2000).
- Left of Save sits the persona row: **Default 1 / 2 / 3** (a click only fills the three fields; Save still decides what sticks) plus "Save as" copies (named after the Name field, each with a small delete button); a fresh install starts on Default 3, and the row scrolls horizontally when it overflows.
- Above the New Session button: a quiet name row (first-character chip + name). It hides when the sidebar collapses to the 56px rail and updates as soon as a new name is saved.
- Defaults: name `大肥鱼`, language `中文`.

## Where the data lives

The four fields are this plugin's profile config, read and written through the official settings channel, persisted into the profile's `cordis.patch.yml`:

```yaml
- id: assistant-profile
  name: '@istarry/dsh-assistant-profile'
  config:
    name: 小星
    language: 简体中文
    persona: 你是一个只讲证据的助理。不确定就说不确定。
```

It travels with the profile: another profile is another persona; backing up the profile backs up the persona.

## Install

```bash
dsh plugin --profile <profile> add @istarry/dsh-assistant-profile
# local tarball: build first, then pack inside dist/
node build.mjs && (cd dist && npm pack)
dsh plugin --profile <profile> add ./dist/istarry-dsh-assistant-profile-<version>.tgz
```

Restart DSH. To remove:

```bash
dsh plugin --profile <profile> remove @istarry/dsh-assistant-profile
```

Leftover config lines are harmless (nothing reads them), but deleting them is tidier.

## Relationship to dsh-agent-suite

Both shadow the same section (`deployment:persona-prefix`); **do not enable both** — the later load wins and the personas fight. Use agent-suite when you need several agents with their own personas; use this one for a single persona you carry everywhere.

## Build

```bash
cd tooling && pnpm install    # once: tsdown + lightningcss + typescript + js-yaml
cd .. && node build.mjs       # src/ → dist/ (manifest and static files included)
node build.mjs --staging      # build to .build/out only
node build.mjs --check        # build + dependency-contract check, no dist/ writes
```

The host bundle inlines `js-yaml`; at runtime it only depends on `@deepseek-ai/schemastery` (declared in `dependencies`, installed into the plugin's own node_modules by pnpm). The browser bundle only `require`s module-table entries (react / ui-primitives).

Edit `src/` only; artifacts are generated.

## Known edges

- Top-level sessions only; subagents are never injected.
- When the preset registry cannot be read, injection degrades to a plain section (no `complete` mirroring) and logs nothing.
- Saving with all three fields cleared injects nothing (native identity); a fresh install carries the Default 3 content.
- The nameplate is a DOM node inserted before the New Session button (the shell exposes no slot there); a MutationObserver puts it back if a re-render drops it.
