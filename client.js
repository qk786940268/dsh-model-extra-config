/**
 * dsh-model-extra-config — Client half.
 *
 * Adds a request-override editor to every provider card on the Models
 * settings page: a global body/header override for the provider route plus
 * per-model overrides that win over the global level. The values are read and
 * written through the settings transport (`ctx.configForms`) under this
 * plugin's own entry id, so they persist exactly like every other setting.
 *
 * @module dsh-model-extra-config/client
 */
window.__ModuleLoader__.load({
	id: "dsh-model-extra-config",
	factory(require) {
		const React = require("react");
		const h = React.createElement;
		const { useEffect, useMemo, useState } = React;

		/** Locale namespace for this plugin's UI strings. */
		const NS = "model-extra-config";
		/** The settings namespace this plugin's entry owns. */
		const ENTRY_ID = "dsh-model-extra-config";
		/** Settings namespaces that carry provider profiles. */
		const PI_AI_NS = "llm-pi-ai";
		const DEEPSEEK_NS = "llm-deepseek";

		const zh = {
			sectionTitle: "请求覆盖（Body / Header）",
			sectionBadge: "已配置",
			bodyLabel: "Body 覆盖（JSON，与请求深合并）",
			headersLabel: "Header 覆盖（JSON）",
			globalHint: "对该 provider 的所有模型生效；嵌套对象逐层合并，null 删除字段。",
			modelLevel: "模型级覆盖（优先于全局）",
			addModel: "添加模型覆盖",
			pickModel: "选择模型",
			remove: "删除",
			save: "保存",
			saving: "保存中…",
			saved: "已保存",
			failed: "保存失败，请重试",
			invalidJson: "存在无效 JSON，未保存",
			readonly: "当前连接不接受写入",
			noModels: "该 provider 尚未配置模型",
			notConfigured: "保存该 provider 后可配置请求覆盖",
			bodyPlaceholder: '{"provider":{"only":["GPT Hub 3"]}}',
			headersPlaceholder: '{"X-My-Header":"value"}',
		};

		const en = {
			sectionTitle: "Request overrides (Body / Header)",
			sectionBadge: "configured",
			bodyLabel: "Body override (JSON, deep-merged into requests)",
			headersLabel: "Header override (JSON)",
			globalHint: "Applies to every model of this provider; nested objects merge per key, null deletes a field.",
			modelLevel: "Model-level overrides (win over global)",
			addModel: "Add model override",
			pickModel: "Select a model",
			remove: "Remove",
			save: "Save",
			saving: "Saving…",
			saved: "Saved",
			failed: "The save did not land; try again.",
			invalidJson: "Some JSON is invalid; nothing was saved.",
			readonly: "This connection does not accept writes.",
			noModels: "This provider has no configured models yet.",
			notConfigured: "Available once the provider is saved.",
			bodyPlaceholder: '{"provider":{"only":["GPT Hub 3"]}}',
			headersPlaceholder: '{"X-My-Header":"value"}',
		};

		const CSS = [
			".mec-root{display:flex;flex-direction:column;gap:10px;border-top:.5px solid var(--dsw-alias-border-l2);padding-top:10px;margin-top:12px}",
			".mec-summary{cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px;display:inline-flex;align-items:center;gap:6px;list-style:none}",
			".mec-summary::-webkit-details-marker{display:none}",
			".mec-summary:before{content:\"\";border-bottom:1.5px solid;border-right:1.5px solid;width:5px;height:5px;transition:transform .12s;transform:rotate(-45deg) translate(-1px,-1px)}",
			".mec-root[open]>.mec-summary:before{transform:rotate(45deg) translate(-1px,-1px)}",
			".mec-summary:hover{color:var(--dsw-alias-label-primary)}",
			".mec-badge{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-xs);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;padding:1px 6px}",
			".mec-field{display:flex;flex-direction:column;gap:4px;min-width:0}",
			".mec-label{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px}",
			".mec-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:0}",
			".mec-textarea{box-sizing:border-box;width:100%;min-height:60px;resize:vertical;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:12px/1.5 var(--ds-font-family-code,monospace);padding:6px 10px}",
			".mec-textarea:focus{border-color:var(--dsw-alias-state-business-primary);outline:none}",
			".mec-textarea.mec-invalid{border-color:var(--dsw-alias-state-error-primary)}",
			".mec-models{display:flex;flex-direction:column;gap:8px}",
			".mec-models-head{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px}",
			".mec-model{border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);padding:8px;display:flex;flex-direction:column;gap:6px}",
			".mec-model-head{display:flex;align-items:center;gap:8px;min-width:0}",
			".mec-model-id{font-family:var(--ds-font-family-code,monospace);font-size:12px;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere;flex:1 1 auto;min-width:0}",
			".mec-select{border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;height:28px;max-width:220px;padding:0 8px}",
			".mec-button{border:.5px solid var(--dsw-alias-border-l3);background:none;color:var(--dsw-alias-label-primary);border-radius:var(--dsw-radius-sm);height:28px;padding:0 10px;font:inherit;font-size:12px;line-height:18px;cursor:pointer;display:inline-flex;align-items:center;gap:4px}",
			".mec-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
			".mec-button:disabled{opacity:.4;cursor:default}",
			".mec-button.mec-danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}",
			".mec-primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border:none}",
			".mec-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}",
			".mec-actions{display:flex;align-items:center;gap:8px;justify-content:flex-end}",
			".mec-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}",
			".mec-status.mec-ok{color:var(--dsw-alias-state-success-primary)}",
			".mec-status.mec-error{color:var(--dsw-alias-state-error-primary)}",
		].join("\n");

		function injectStyles() {
			if (typeof document === "undefined") return;
			if (document.querySelector("style[data-plugin-css=model-extra-config]") !== null) return;
			const style = document.createElement("style");
			style.setAttribute("data-plugin-css", "model-extra-config");
			style.textContent = CSS;
			document.head.append(style);
		}

		/** Parse object JSON, or undefined when the text is not one. */
		function parseObjectJson(text) {
			const trimmed = text.trim();
			if (trimmed.length === 0) return undefined;
			try {
				const parsed = JSON.parse(trimmed);
				return parsed === null || typeof parsed !== "object" || Array.isArray(parsed) ? undefined : parsed;
			} catch {
				return undefined;
			}
		}

		/** One JSON object textarea with per-field validity. */
		function JsonObjectField(props) {
			const { label, value, onChange, placeholder } = props;
			const valid = parseValidity(value) !== false;
			return h("div", { className: "mec-field" },
				h("label", { className: "mec-label" }, label),
				h("textarea", {
					className: `mec-textarea${valid ? "" : " mec-invalid"}`,
					spellCheck: false,
					value,
					placeholder,
					onChange: (event) => onChange(event.target.value),
				}));
		}

		/** undefined when empty, true when parseable, false when invalid. */
		function parseValidity(text) {
			if (typeof text !== "string" || text.trim().length === 0) return undefined;
			return parseObjectJson(text) !== undefined;
		}

		/** Track one settings form's snapshot, deduped by JSON identity. */
		function useSnapshot(scope) {
			const read = () => {
				try {
					return scope?.getSnapshot?.() ?? null;
				} catch {
					return null;
				}
			};
			const [snapshot, setSnapshot] = useState(read);
			useEffect(() => {
				const update = () => {
					setSnapshot((previous) => {
						const next = read();
						return JSON.stringify(next) === JSON.stringify(previous ?? null) ? previous : next;
					});
				};
				update();
				const dispose = scope?.subscribe?.(update);
				return () => {
					if (typeof dispose === "function") dispose();
				};
			}, [scope]);
			return snapshot;
		}

		/** An empty editing draft. */
		function blankModel() {
			return { body: "", headers: "" };
		}

		function blankDraft() {
			return { body: "", headers: "", models: {} };
		}

		/** A draft loaded from the stored override entry. */
		function draftOf(entry) {
			if (entry === null || typeof entry !== "object") return blankDraft();
			const models = {};
			for (const [id, model] of Object.entries(entry.models ?? {})) {
				models[id] = {
					body: stringifyObject(model?.body),
					headers: stringifyObject(model?.headers),
				};
			}
			return {
				body: stringifyObject(entry.body),
				headers: stringifyObject(entry.headers),
				models,
			};
		}

		function stringifyObject(value) {
			if (value === null || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length === 0) return "";
			return `${JSON.stringify(value, null, 2)}\n`;
		}

		/** How many configured pieces one override level carries. */
		function countLevels(level) {
			if (level === null || typeof level !== "object") return 0;
			let count = 0;
			if (level.body !== undefined && Object.keys(level.body ?? {}).length > 0) count += 1;
			if (level.headers !== undefined && Object.keys(level.headers ?? {}).length > 0) count += 1;
			return count;
		}

		/** Build the storable override entry from a draft, or undefined when empty. */
		function buildEntry(draft) {
			const body = parseObjectJson(draft.body);
			const headers = parseObjectJson(draft.headers);
			const models = {};
			for (const [id, model] of Object.entries(draft.models)) {
				const modelBody = parseObjectJson(model.body);
				const modelHeaders = parseObjectJson(model.headers);
				if (modelBody === undefined && modelHeaders === undefined) continue;
				models[id] = {
					...(modelBody === undefined ? {} : { body: modelBody }),
					...(modelHeaders === undefined ? {} : { headers: modelHeaders }),
				};
			}
			if (body === undefined && headers === undefined && Object.keys(models).length === 0) return undefined;
			return {
				...(body === undefined ? {} : { body }),
				...(headers === undefined ? {} : { headers }),
				models,
			};
		}

		/** Model ids named by one settings snapshot, for the add-model picker. */
		function modelIdsOf(snapshot, route) {
			const value = snapshot?.value;
			if (value === null || typeof value !== "object") return [];
			const lists = [];
			if (Array.isArray(value.models)) lists.push(value.models);
			const providers = value.providers;
			if (providers !== null && typeof providers === "object") {
				const profile = providers[route];
				if (profile !== null && typeof profile === "object" && Array.isArray(profile.models)) lists.push(profile.models);
			}
			return lists.flatMap((list) =>
				list.filter((model) => model !== null && typeof model === "object" && typeof model.id === "string").map((model) => model.id));
		}

		/**
		 * The override editor for one provider card.
		 * @param props - the owner slot props (`provider`, `configured`) plus
		 * `t` (translator), `scope` (this plugin's settings form scope), and
		 * `modelScopes` (settings form scopes to list configured models from).
		 */
		function ProviderExtras(props) {
			const { provider, configured, t, scope, modelScopes } = props;
			const route = typeof provider?.provider === "string" ? provider.provider : undefined;

			const snapshot = useSnapshot(scope);
			const modelSnapshots = modelScopes.map((modelScope) => useSnapshot(modelScope));

			const overrides = useMemo(() => {
				const value = snapshot?.status === "ready" && snapshot.value !== null && typeof snapshot.value === "object"
					? snapshot.value.overrides
					: undefined;
				return value !== null && typeof value === "object" ? value : {};
			}, [snapshot]);

			const entry = overrides[route];
			const models = (entry !== null && typeof entry === "object" && entry.models !== null && typeof entry.models === "object") ? entry.models : {};

			const modelIds = useMemo(() => {
				const ids = new Set(modelSnapshots.flatMap((modelSnapshot) => modelIdsOf(modelSnapshot, route)));
				for (const id of Object.keys(models)) ids.add(id);
				return [...ids];
			}, [modelSnapshots, models, route]);

			const [open, setOpen] = useState(false);
			const [draft, setDraft] = useState(blankDraft);
			const [status, setStatus] = useState({ state: "idle" });
			const [pick, setPick] = useState("");

			// Reload the draft from the stored values whenever the section is
			// (re)opened, so a reload never keeps stale edits.
			useEffect(() => {
				if (!open || snapshot?.status !== "ready") return;
				setDraft(draftOf(entry));
				setStatus({ state: "idle" });
			}, [open, snapshot?.status, entry]);

			const configuredLevels = useMemo(
				() => countLevels(entry) + Object.values(models).reduce((total, model) => total + countLevels(model), 0),
				[entry, models]);

			if (!configured || route === undefined) {
				return h("div", { className: "mec-root" }, h("p", { className: "mec-hint" }, t("notConfigured")));
			}
			if (snapshot?.status !== "ready") return null;

			const anyJsonInvalid =
				parseValidity(draft.body) === false || parseValidity(draft.headers) === false ||
				Object.values(draft.models).some((model) => parseValidity(model.body) === false || parseValidity(model.headers) === false);

			const setLevel = (field, value) => setDraft((previous) => ({ ...previous, [field]: value }));
			const setModel = (id, patch) => setDraft((previous) => ({
				...previous,
				models: { ...previous.models, [id]: { ...blankModel(), ...previous.models[id], ...patch } },
			}));
			const removeModel = (id) => setDraft((previous) => {
				const next = { ...previous.models };
				delete next[id];
				return { ...previous, models: next };
			});
			const addModel = () => {
				const id = pick.trim();
				if (id.length === 0) return;
				setModel(id, blankModel());
				setPick("");
			};

			const save = async () => {
				if (anyJsonInvalid) {
					setStatus({ state: "error", text: t("invalidJson") });
					return;
				}
				if (snapshot.writable === false) {
					setStatus({ state: "error", text: t("readonly") });
					return;
				}
				setStatus({ state: "saving" });
				try {
					const next = { ...overrides };
					const built = buildEntry(draft);
					if (built === undefined) delete next[route];
					else next[route] = built;
					await scope.set("overrides", next);
					setStatus({ state: "ok", text: t("saved") });
				} catch {
					setStatus({ state: "error", text: t("failed") });
				}
			};

			return h("details", { className: "mec-root", onToggle: (event) => setOpen(event.target.open) },
				h("summary", { className: "mec-summary" },
					t("sectionTitle"),
					configuredLevels > 0 ? h("span", { className: "mec-badge" }, `${t("sectionBadge")} ${configuredLevels}`) : null),
				h("div", null,
					h("p", { className: "mec-hint" }, t("globalHint")),
					h("div", { style: { display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" } },
						h(JsonObjectField, { label: t("bodyLabel"), value: draft.body, placeholder: t("bodyPlaceholder"), onChange: (body) => setLevel("body", body) }),
						h(JsonObjectField, { label: t("headersLabel"), value: draft.headers, placeholder: t("headersPlaceholder"), onChange: (headers) => setLevel("headers", headers) }),
						h("div", { className: "mec-models" },
							h("div", { className: "mec-models-head" },
								t("modelLevel"),
								h("span", { style: { flex: "1 1 auto" } }),
								h("select", {
									className: "mec-select",
									value: pick,
									onChange: (event) => setPick(event.target.value),
									"aria-label": t("pickModel"),
								},
									h("option", { value: "" }, t("pickModel")),
									modelIds.map((id) => h("option", { key: id, value: id }, id))),
								h("button", { className: "mec-button", type: "button", disabled: pick.trim().length === 0, onClick: addModel }, t("addModel"))),
							modelIds.length === 0 && Object.keys(draft.models).length === 0
								? h("p", { className: "mec-hint" }, t("noModels"))
								: Object.entries(draft.models).map(([id, model]) =>
									h("div", { className: "mec-model", key: id },
										h("div", { className: "mec-model-head" },
											h("span", { className: "mec-model-id" }, id),
											h("button", { className: "mec-button mec-danger", type: "button", onClick: () => removeModel(id) }, t("remove"))),
										h(JsonObjectField, { label: t("bodyLabel"), value: model.body, placeholder: t("bodyPlaceholder"), onChange: (body) => setModel(id, { body }) }),
										h(JsonObjectField, { label: t("headersLabel"), value: model.headers, placeholder: t("headersPlaceholder"), onChange: (headers) => setModel(id, { headers }) })))),
						h("div", { className: "mec-actions" },
							status.state === "ok" ? h("span", { className: "mec-status mec-ok" }, status.text) :
							status.state === "error" ? h("span", { className: "mec-status mec-error" }, status.text) :
							status.state === "saving" ? h("span", { className: "mec-status" }, t("saving")) : null,
							h("button", { className: "mec-button mec-primary", type: "button", disabled: status.state === "saving", onClick: save }, t("save"))))));
		}

		/**
		 * Client plugin body: register the locale namespace and the
		 * provider-card extension cells for both adapter families.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh: { ...zh }, en: { ...en } }), "model-extra-config: dictionaries");
			ctx.inject(["configForms"], (withForms) => {
				withForms.effect(() => withForms.configForms.whileServed([ENTRY_ID], () => {
					const scope = withForms.configForms.get(ENTRY_ID);
					const modelScopes = [withForms.configForms.get(PI_AI_NS), withForms.configForms.get(DEEPSEEK_NS)];
					const cells = [PI_AI_NS, DEEPSEEK_NS].map((key) =>
						withForms.slots.register({ name: "settings.models.provider-card", key }, (props) =>
							h(ProviderExtras, { ...props, t, scope, modelScopes })));
					return () => {
						for (const dispose of cells) dispose();
					};
				}), "model-extra-config: provider-card cells");
			});
		}

		injectStyles();
		return { inject: ["slots", "locale"], apply };
	},
});
