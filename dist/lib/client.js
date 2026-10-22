window.__ModuleLoader__.load({
	id: "@istarry/dsh-assistant-profile",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0assistant-css:E:\Plugin\发布版\dsh-assistant-profile\src\client\ProfilePage.module.css.mjs
		const css = "._2lYP0a_page{box-sizing:border-box;background:var(--dsw-alias-bg-layer-1);min-height:100%;padding:28px 32px 48px;overflow-y:auto}._2lYP0a_section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:16px;margin:0 auto;display:flex}._2lYP0a_head{flex-direction:column;gap:4px;display:flex}._2lYP0a_title{margin:0;font-size:18px;font-weight:600;line-height:26px}._2lYP0a_intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px;line-height:20px}._2lYP0a_form{border:.5px solid var(--dsw-alias-settings-card-stroke);border-radius:var(--dsw-radius-xl);background:var(--dsw-alias-settings-card-fill);flex-direction:column;gap:18px;padding:20px;display:flex}._2lYP0a_row{grid-template-columns:minmax(0,1fr) minmax(0,240px);gap:16px;display:grid}@media (width<=640px){._2lYP0a_row{grid-template-columns:minmax(0,1fr)}}._2lYP0a_field{flex-direction:column;gap:6px;min-width:0;display:flex}._2lYP0a_label{font-size:13px;font-weight:500;line-height:18px}._2lYP0a_hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}._2lYP0a_hintWarn{color:var(--dsw-alias-state-warn-label)}._2lYP0a_control{width:100%}._2lYP0a_chips{gap:6px;display:flex}._2lYP0a_chip{border:.5px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:999px;padding:2px 9px;font-size:12px;line-height:18px;transition:background .12s,border-color .12s,color .12s}._2lYP0a_chip:hover{background:var(--dsw-alias-interactive-bg-hover)}._2lYP0a_chipActive{border-color:var(--dsw-static-neutral-bluish-400);background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary)}._2lYP0a_textareaWrap{position:relative}._2lYP0a_textarea{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);width:100%;min-height:168px;color:var(--dsw-alias-label-primary);resize:vertical;outline:none;padding:9px 12px 26px;font-family:inherit;font-size:13px;line-height:21px;display:block}._2lYP0a_textarea::placeholder{color:var(--dsw-alias-label-dimmed)}._2lYP0a_textarea:focus-visible{border-color:var(--dsw-alias-state-business-primary)}._2lYP0a_counter{color:var(--dsw-alias-label-tertiary);pointer-events:none;font-size:11px;line-height:14px;position:absolute;bottom:8px;right:10px}._2lYP0a_counter[data-long=true]{color:var(--dsw-alias-state-warn-label)}._2lYP0a_footer{align-items:center;gap:10px;padding-top:2px;display:flex}._2lYP0a_status{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:12px;line-height:18px;overflow:hidden}._2lYP0a_statusError{color:var(--dsw-alias-state-error-primary)}._2lYP0a_nameplate{box-sizing:border-box;color:var(--dsw-alias-label-secondary);flex:none;align-items:center;gap:8px;margin:2px 2px 0;padding:6px 10px 2px;display:flex}._2lYP0a_nameplate[data-collapsed=true]{display:none}._2lYP0a_nameplateAvatar{border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-3);width:20px;height:20px;color:var(--dsw-alias-label-secondary);user-select:none;border-radius:6px;flex:none;justify-content:center;align-items:center;font-size:11px;font-weight:500;line-height:1;display:inline-flex}._2lYP0a_nameplateText{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:13px;font-weight:500;line-height:20px;overflow:hidden}";
		const tagId = "@istarry/dsh-assistant-profile/ProfilePage.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@istarry/dsh-assistant-profile";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var ProfilePage_module_css_default = {
			"chip": "_2lYP0a_chip",
			"chipActive": "_2lYP0a_chipActive",
			"chips": "_2lYP0a_chips",
			"control": "_2lYP0a_control",
			"counter": "_2lYP0a_counter",
			"field": "_2lYP0a_field",
			"footer": "_2lYP0a_footer",
			"form": "_2lYP0a_form",
			"head": "_2lYP0a_head",
			"hint": "_2lYP0a_hint",
			"hintWarn": "_2lYP0a_hintWarn",
			"intro": "_2lYP0a_intro",
			"label": "_2lYP0a_label",
			"nameplate": "_2lYP0a_nameplate",
			"nameplateAvatar": "_2lYP0a_nameplateAvatar",
			"nameplateText": "_2lYP0a_nameplateText",
			"page": "_2lYP0a_page",
			"row": "_2lYP0a_row",
			"section": "_2lYP0a_section",
			"status": "_2lYP0a_status",
			"statusError": "_2lYP0a_statusError",
			"textarea": "_2lYP0a_textarea",
			"textareaWrap": "_2lYP0a_textareaWrap",
			"title": "_2lYP0a_title"
		};
		//#endregion
		//#region ../src/client/ProfilePage.tsx
		/**
		* 助理档案页：名称、风格、语言、人格提示词四段，一次保存原子落盘。
		*
		* 页面只编辑、不预览：真正的注入发生在宿主侧（每个新会话的系统提示首段），
		* 这里把「它会出现在哪里」写在每个字段的说明里，省掉一块会随时间漂移的假预览。
		*/
		/** 人格超过这个字数就提示偏长（只提示，不拦）。 */
		const LONG_PERSONA = 2e3;
		/** 保存成功后「已保存」停留的毫秒数。 */
		const FLASH_MS = 2400;
		/** 四个字段的遍历顺序。 */
		const FIELDS$1 = [
			"name",
			"style",
			"language",
			"persona"
		];
		/**
		* 渲染助理档案页。
		* @param props - 档案 store 与本地化文案。
		* @returns 页面元素。
		*/
		function ProfilePage({ profile, t }) {
			const snapshot = (0, react.useSyncExternalStore)(profile.subscribe, profile.getSnapshot);
			const [draft, setDraft] = (0, react.useState)(void 0);
			const [saved, setSaved] = (0, react.useState)(false);
			const values = draft ?? snapshot.values;
			const dirty = draft !== void 0 && FIELDS$1.some((field) => draft[field] !== snapshot.values[field]);
			const length = (0, react.useMemo)(() => Array.from(values.persona).length, [values.persona]);
			const ready = snapshot.status === "ready";
			const canSave = ready && snapshot.writable && dirty && !snapshot.pending;
			(0, react.useEffect)(() => {
				if (!saved) return;
				const timer = setTimeout(() => {
					setSaved(false);
				}, FLASH_MS);
				return () => {
					clearTimeout(timer);
				};
			}, [saved]);
			const patch = (next) => {
				setDraft({
					...values,
					...next
				});
				setSaved(false);
			};
			const submit = async () => {
				if (!canSave) return;
				if ((await profile.save(values)).ok) {
					setDraft(void 0);
					setSaved(true);
				}
			};
			const status = () => {
				if (!ready) return {
					text: t("unavailable"),
					error: false
				};
				if (!snapshot.writable) return {
					text: t("readonly"),
					error: false
				};
				if (snapshot.failure !== void 0) return {
					text: `${t("failed")} · ${snapshot.failure}`,
					error: true
				};
				if (saved) return {
					text: t("saved"),
					error: false
				};
				if (dirty) return {
					text: t("dirty"),
					error: false
				};
				return {
					text: "",
					error: false
				};
			};
			const line = status();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: ProfilePage_module_css_default.page,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: ProfilePage_module_css_default.section,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: ProfilePage_module_css_default.head,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
							className: ProfilePage_module_css_default.title,
							children: t("title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: ProfilePage_module_css_default.intro,
							children: t("intro")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
						className: ProfilePage_module_css_default.form,
						onSubmit: (event) => {
							event.preventDefault();
							submit();
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: ProfilePage_module_css_default.row,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: ProfilePage_module_css_default.field,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: ProfilePage_module_css_default.label,
											children: t("name.label")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
											className: ProfilePage_module_css_default.control,
											value: values.name,
											placeholder: t("name.placeholder"),
											spellCheck: false,
											onChange: (event) => {
												patch({ name: event.target.value });
											}
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: ProfilePage_module_css_default.hint,
											children: t("name.hint")
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: ProfilePage_module_css_default.field,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: ProfilePage_module_css_default.label,
											children: t("language.label")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
											className: ProfilePage_module_css_default.control,
											value: values.language,
											placeholder: t("language.placeholder"),
											spellCheck: false,
											onChange: (event) => {
												patch({ language: event.target.value });
											}
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: ProfilePage_module_css_default.chips,
											children: ["zh", "en"].map((id) => {
												const text = id === "zh" ? t("language.quick.zh") : t("language.quick.en");
												const active = values.language.trim() === text;
												return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: active ? `${ProfilePage_module_css_default.chip} ${ProfilePage_module_css_default.chipActive}` : ProfilePage_module_css_default.chip,
													"aria-pressed": active,
													onClick: () => {
														patch({ language: text });
													},
													children: text
												}, id);
											})
										})
									]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: ProfilePage_module_css_default.field,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ProfilePage_module_css_default.label,
										children: t("style.label")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
										className: ProfilePage_module_css_default.control,
										value: values.style,
										placeholder: t("style.placeholder"),
										spellCheck: false,
										onChange: (event) => {
											patch({ style: event.target.value });
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ProfilePage_module_css_default.hint,
										children: t("style.hint")
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: ProfilePage_module_css_default.field,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ProfilePage_module_css_default.label,
										children: t("persona.label")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: ProfilePage_module_css_default.textareaWrap,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
											className: ProfilePage_module_css_default.textarea,
											value: values.persona,
											placeholder: t("persona.placeholder"),
											rows: 9,
											onChange: (event) => {
												patch({ persona: event.target.value });
											}
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: ProfilePage_module_css_default.counter,
											"data-long": length > LONG_PERSONA,
											children: [
												length,
												" ",
												t("persona.unit")
											]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: length > LONG_PERSONA ? `${ProfilePage_module_css_default.hint} ${ProfilePage_module_css_default.hintWarn}` : ProfilePage_module_css_default.hint,
										children: length > LONG_PERSONA ? t("persona.long") : t("persona.hint")
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
								className: ProfilePage_module_css_default.footer,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: line.error ? `${ProfilePage_module_css_default.status} ${ProfilePage_module_css_default.statusError}` : ProfilePage_module_css_default.status,
										children: line.text
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "ghost",
										disabled: !dirty || snapshot.pending,
										onClick: () => {
											setDraft(void 0);
											setSaved(false);
										},
										children: t("reset")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "primary",
										type: "submit",
										disabled: !canSave,
										children: snapshot.pending ? t("saving") : t("save")
									})
								]
							})
						]
					})]
				})
			});
		}
		//#endregion
		//#region ../src/client/ProfilePanelIcon.tsx
		/**
		* 按侧栏要求的边长渲染图标。
		* @param props - 侧栏给出的图标面：边长与是否选中。
		* @returns 图标元素。
		*/
		function ProfilePanelIcon({ size }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPersonalizationOutlineRegular, { size });
		}
		//#endregion
		//#region ../src/client/store.ts
		/** 设置命名空间 = profile 里的插件条目 id，两者由 cordis.patch.yml 定死。 */
		const ENTRY_ID = "assistant-profile";
		/** 未写过任何档案时的默认值，与宿主 schema 的默认值一致。 */
		const DEFAULT_VALUES = {
			name: "大肥鱼",
			style: "",
			language: "中文",
			persona: ""
		};
		/** 四个字段的读写顺序。 */
		const FIELDS = [
			"name",
			"style",
			"language",
			"persona"
		];
		/**
		* 把 Host 返回值叠加到默认值上：Host 只给用户改过的字段，缺的用默认。
		* @param value - 设置通道解出的 section。
		* @returns 完整档案。
		*/
		function merge(value) {
			if (typeof value !== "object" || value === null) return DEFAULT_VALUES;
			const record = value;
			const pick = (key) => {
				const candidate = record[key];
				return typeof candidate === "string" ? candidate : DEFAULT_VALUES[key];
			};
			return {
				name: pick("name"),
				style: pick("style"),
				language: pick("language"),
				persona: pick("persona")
			};
		}
		/**
		* 建立一个档案 store。
		* @param ctx - 浏览器根上下文（需已注入 `configForms`）。
		* @returns 只读快照 + 保存入口。
		*/
		function createProfileStore(ctx) {
			const form = ctx.configForms.get(ENTRY_ID);
			const listeners = /* @__PURE__ */ new Set();
			let pending = false;
			let failure;
			let snapshot = {
				status: "loading",
				values: DEFAULT_VALUES,
				writable: false,
				pending: false,
				failure: void 0
			};
			const publish = () => {
				const state = form.getSnapshot();
				snapshot = {
					status: state.status,
					values: merge(state.value),
					writable: state.writable,
					pending,
					failure
				};
				for (const listener of [...listeners]) listener();
			};
			form.subscribe(publish);
			publish();
			return {
				getSnapshot: () => snapshot,
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				save: async (next) => {
					const ops = FIELDS.filter((field) => next[field] !== snapshot.values[field]).map((field) => ({
						op: "set",
						path: [field],
						value: next[field]
					}));
					if (ops.length === 0) {
						failure = void 0;
						publish();
						return { ok: true };
					}
					pending = true;
					failure = void 0;
					publish();
					try {
						if (!await form.mutate(ops)) {
							failure = snapshot.status === "unavailable" ? void 0 : "refused";
							return {
								ok: false,
								reason: failure
							};
						}
						return { ok: true };
					} catch (error) {
						failure = String(error);
						return {
							ok: false,
							reason: failure
						};
					} finally {
						pending = false;
						publish();
					}
				}
			};
		}
		//#endregion
		//#region ../src/client/nameplate.ts
		/** 侧栏新会话按钮的类名后缀（外壳的 CSS Module 用 `[hash]_[local]`）。 */
		const BUTTON_SELECTOR = "button[class*=\"_newSession\"]";
		/** 外壳折叠时根节点类名里的片段。 */
		const COLLAPSED = "_collapsed";
		/** 兜底巡检间隔：React 换掉整个侧栏时观察器会跟着失效。 */
		const WATCHDOG_MS = 1e3;
		/**
		* 名字的首字，用作名plate的小方块。
		* @param name - 助理名。
		* @returns 首字（按码点取，中英文都对），空名返回空串。
		*/
		function initialOf(name) {
			return Array.from(name)[0] ?? "";
		}
		/**
		* 把助理名挂到侧栏上。
		* @param store - 档案 store（读名称）。
		* @returns 卸载函数。
		*/
		function mountNameplate(store) {
			let host;
			let row;
			let avatar;
			let label;
			let observer;
			const sync = () => {
				if (row === void 0) return;
				const name = store.getSnapshot().values.name.trim();
				row.hidden = name === "";
				if (avatar !== void 0) avatar.textContent = initialOf(name);
				if (label !== void 0) label.textContent = name;
				row.dataset.collapsed = host?.className.includes(COLLAPSED) === true ? "true" : "false";
			};
			const detach = () => {
				observer?.disconnect();
				observer = void 0;
				row?.remove();
				row = void 0;
				avatar = void 0;
				label = void 0;
				host = void 0;
			};
			const attach = () => {
				const button = document.querySelector(BUTTON_SELECTOR);
				const parent = button?.parentElement ?? null;
				if (!(button instanceof HTMLElement) || !(parent instanceof HTMLElement)) return;
				if (row !== void 0 && host === parent && row.isConnected) {
					sync();
					return;
				}
				detach();
				host = parent;
				row = document.createElement("div");
				row.className = ProfilePage_module_css_default.nameplate;
				avatar = document.createElement("span");
				avatar.className = ProfilePage_module_css_default.nameplateAvatar;
				avatar.setAttribute("aria-hidden", "true");
				label = document.createElement("span");
				label.className = ProfilePage_module_css_default.nameplateText;
				row.append(avatar, label);
				parent.insertBefore(row, button);
				observer = new MutationObserver(() => {
					if (row === void 0 || host === void 0) return;
					if (!row.isConnected) {
						const anchor = host.querySelector(BUTTON_SELECTOR);
						if (anchor !== null) host.insertBefore(row, anchor);
					}
					sync();
				});
				observer.observe(parent, {
					childList: true,
					attributes: true,
					attributeFilter: ["class"]
				});
				sync();
			};
			const unsubscribe = store.subscribe(() => {
				attach();
				sync();
			});
			attach();
			const watchdog = setInterval(attach, WATCHDOG_MS);
			return () => {
				unsubscribe();
				clearInterval(watchdog);
				detach();
			};
		}
		//#endregion
		//#region ../src/client/locales.ts
		/**
		* 词典：助理档案页与侧栏入口的文案。
		*
		* 只放界面文案——人格、风格、语言是用户自己的内容，不进词典。
		*/
		/** 中文词典（键的来源）。 */
		const zh = {
			"panel": "助理档案",
			"title": "助理档案",
			"intro": "这份人格会出现在每个新会话的系统提示最前面，标准 / PTC / 极简 / 创造四个模式通用。",
			"name.label": "名称",
			"name.placeholder": "例如：大肥鱼",
			"name.hint": "侧栏「新会话」上方显示它，也会作为「你的名字是…」进入提示词。",
			"style.label": "风格",
			"style.placeholder": "例如：冷静、精确，先给结论再给理由",
			"style.hint": "一句话的说话方式，会作为 Style 一行加在人格前面。",
			"language.label": "语言",
			"language.placeholder": "例如：简体中文",
			"language.hint": "模型跟你说话用的语言。",
			"language.quick.zh": "中文",
			"language.quick.en": "English",
			"persona.label": "人格提示词",
			"persona.placeholder": "写下它是谁、怎么做事、在意什么。留空就用原生 DSH 的身份句。",
			"persona.hint": "原样放在系统提示最前面，四个模式都从这段开始。",
			"persona.unit": "字",
			"persona.long": "偏长，会挤占上下文",
			"save": "保存",
			"saving": "保存中…",
			"saved": "已保存",
			"dirty": "有未保存的改动",
			"reset": "撤销改动",
			"failed": "保存失败",
			"unavailable": "设置通道还没就绪，稍后再试。",
			"readonly": "当前 profile 不可写。"
		};
		/** 英文词典：与中文键一一对应。 */
		const en = {
			"panel": "Assistant Profile",
			"title": "Assistant Profile",
			"intro": "This persona opens every new session: it rides the very top of the system prompt and applies to all four modes.",
			"name.label": "Name",
			"name.placeholder": "e.g. Big Fat Fish",
			"name.hint": "Shown above New Session in the sidebar, and injected as \"Your name is …\".",
			"style.label": "Style",
			"style.placeholder": "e.g. calm and precise; conclusion first",
			"style.hint": "One line about how it talks. Added as a Style line before the persona.",
			"language.label": "Language",
			"language.placeholder": "e.g. Simplified Chinese",
			"language.hint": "The language it replies in.",
			"language.quick.zh": "中文",
			"language.quick.en": "English",
			"persona.label": "Persona prompt",
			"persona.placeholder": "Who it is, how it works, what it cares about. Leave empty to keep the native DSH identity.",
			"persona.hint": "Injected verbatim at the top of the system prompt, in every mode.",
			"persona.unit": "chars",
			"persona.long": "Long; it will eat into the context",
			"save": "Save",
			"saving": "Saving…",
			"saved": "Saved",
			"dirty": "Unsaved changes",
			"reset": "Discard",
			"failed": "Save failed",
			"unavailable": "The settings channel is not ready yet; try again in a moment.",
			"readonly": "This profile is read-only."
		};
		//#endregion
		//#region ../src/client/index.ts
		/** 本插件独占的词典命名空间。 */
		const NS = "assistantProfile";
		/** 侧栏行与主区面板共用的 id：也是本插件在 profile 里的条目 id。 */
		const PANEL_ID = "assistant-profile";
		/** 行序：插件（0）与自动化任务（10）之间。 */
		const PANEL_ORDER = 5;
		/** 需要的服务（cordis fiber inject）。 */
		const inject = [
			"slots",
			"locale",
			"configForms"
		];
		/**
		* 挂载助理档案的界面。
		* @param ctx - 浏览器根上下文。
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "assistant-profile: dictionaries");
			const t = ctx.locale.bind(NS);
			const profile = createProfileStore(ctx);
			ctx.effect(() => mountNameplate(profile), "assistant-profile: nameplate");
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: PANEL_ID,
				order: PANEL_ORDER,
				label: () => t("panel"),
				locale: NS
			}, ProfilePanelIcon));
			ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_ID,
				locale: NS,
				inject: () => ({ profile })
			}, ProfilePage));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map