/**
 * dsh-model-extra-config — Host half.
 *
 * Adds ccswitch-style request overrides to DSH model calls: per provider
 * route (global level) and per model (local level, wins over global), a JSON
 * object deep-merged into the request body and a header map merged into the
 * request headers.
 *
 * The interception point is `globalThis.fetch`: every built-in LLM adapter
 * family (the pi-ai multi-provider twin and the native DeepSeek adapter)
 * dispatches its model requests through the process-global fetch, so a thin
 * wrapper that only rewrites matching POSTs covers them all without touching
 * adapter internals. Requests are matched by the baseURL of each configured
 * provider route, read from the live settings sections `llm-pi-ai` and
 * `llm-deepseek`; anything that does not match a configured route passes
 * through untouched, and responses (including SSE streams) are never read.
 *
 * The `overrides` config field is volatile: edits land live through the
 * settings transport without remounting this plugin.
 *
 * @module dsh-model-extra-config/host
 */

/** Settings namespace whose value holds the resolved pi-ai provider profiles. */
const PI_AI_NS = "llm-pi-ai";
/** Settings namespace of the native DeepSeek adapter entry. */
const DEEPSEEK_NS = "llm-deepseek";
/** The route id the native DeepSeek adapter registers. */
const DEEPSEEK_ROUTE = "deepseek-official";
/** The public endpoint used when `llm-deepseek:` sets no baseURL. */
const DEEPSEEK_DEFAULT_BASE = "https://api.deepseek.com/anthropic";

/**
 * The shared volatile-reference write key. `Symbol.for` is the global symbol
 * registry, so a reference built here is recognised by the Cordis loader and
 * settings domain even though this package cannot import cosmokit (DSH lives
 * in its own checkout; only plugins live beside the profile).
 */
const WRITE = Symbol.for("cosmokit.volatile.write");

/** A detached live reference whose value only this runtime replaces. */
function createVolatile(value) {
	let current = value;
	return Object.freeze({
		get: () => current,
		[WRITE]: (next) => {
			current = next;
		},
	});
}

/** True for plain JSON objects (not arrays, not null, not class instances). */
function isPlainRecord(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

/** Parse JSON, or undefined on any failure. */
function parseJson(text) {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/**
 * Validate and clone one override level (a provider entry or a model entry).
 * Invalid pieces are dropped rather than refused: a hand-edited config never
 * breaks the running plugin, and the settings UI never writes them.
 * @param {unknown} source - the raw level value.
 * @returns {{ body?: object, headers?: Record<string, string> }} the kept fields.
 */
function normalizeLevel(source) {
	const result = {};
	if (!isPlainRecord(source)) return result;
	const body = source.body;
	if (isPlainRecord(body)) result.body = structuredClone(body);
	const headers = source.headers;
	if (isPlainRecord(headers)) {
		const kept = {};
		for (const [name, value] of Object.entries(headers)) {
			if (typeof name !== "string" || name.length === 0 || typeof value !== "string") continue;
			kept[name] = value;
		}
		result.headers = kept;
	}
	return result;
}

/**
 * Validate the whole `overrides` tree: `{ route: { body, headers, models } }`.
 * @param {unknown} source - the raw config value.
 * @returns {Record<string, { body?: object, headers?: Record<string, string>, models: Record<string, { body?: object, headers?: Record<string, string> }> }>} the normalized tree.
 */
function normalizeOverrides(source) {
	const result = {};
	if (!isPlainRecord(source)) return result;
	for (const [route, entry] of Object.entries(source)) {
		if (typeof route !== "string" || route.length === 0 || !isPlainRecord(entry)) continue;
		const models = {};
		if (isPlainRecord(entry.models)) {
			for (const [id, modelEntry] of Object.entries(entry.models)) {
				if (typeof id !== "string" || id.length === 0) continue;
				models[id] = normalizeLevel(modelEntry);
			}
		}
		result[route] = { ...normalizeLevel(entry), models };
	}
	return result;
}

/**
 * Deep-merge a patch over a target. Nested plain objects merge per key,
 * `null` in the patch deletes the key, and every other leaf (including
 * arrays) replaces the target value.
 * @param {object} target - the base value (the outgoing request body).
 * @param {object} patch - the winning value (the configured override).
 * @returns {object} a fresh merged object; inputs are never mutated.
 */
function deepMerge(target, patch) {
	const result = { ...target };
	for (const [key, value] of Object.entries(patch)) {
		if (value === null) {
			delete result[key];
			continue;
		}
		const existing = result[key];
		result[key] =
			isPlainRecord(value) && isPlainRecord(existing) ? deepMerge(existing, value) : structuredClone(value);
	}
	return result;
}

/**
 * The JSON image of the `overrides` node, used by `toJSON()` below. Kept as
 * a constant so the live node and its serialized image cannot drift.
 */
const OVERRIDES_NODE_JSON = { type: "any", meta: { volatile: true, default: {} } };

/** The live config field nodes. Each carries `toJSON()` because the settings domain rehydrates every node through `new Schema(node.toJSON())`. */
const CONFIG_DICT = {
	overrides: {
		...OVERRIDES_NODE_JSON,
		toJSON: () => ({ type: "any", meta: { volatile: true, default: {} } }),
	},
};

/**
 * Resolve a raw config into this plugin's live value: the `overrides` tree
 * wrapped in a volatile reference so the loader can update it in place.
 * @param {unknown} candidate - merged raw layers for this entry.
 * @returns {{ overrides: ReturnType<typeof createVolatile> }} the live value.
 */
function resolveConfigValue(candidate) {
	const raw = isPlainRecord(candidate) ? candidate.overrides : undefined;
	return { overrides: createVolatile(normalizeOverrides(raw)) };
}

/**
 * This entry's configuration schema, hand-rolled because schemastery is not
 * resolvable from a profile-installed plugin. It is callable, serializes
 * through `toJSON()` into the reference-graph envelope schemastery's
 * constructor rehydrates, is structurally walkable (`type`/`meta`/`dict`),
 * and carries the Standard Schema face the Cordis loader resolves through.
 */
const Config = (candidate) => resolveConfigValue(candidate);
Object.assign(Config, { type: "object", meta: { default: {} }, dict: CONFIG_DICT });
Config["~standard"] = {
	version: 1,
	vendor: "dsh-model-extra-config",
	validate: (value) => ({ value: resolveConfigValue(value) }),
};
Config.toJSON = () => ({
	uid: 2,
	refs: {
		"1": { type: "any", meta: { volatile: true, default: {} } },
		"2": { type: "object", meta: { default: {} }, dict: { overrides: 1 } },
	},
});

/** Whether one request body looks like a JSON object. */
function looksLikeJsonBody(body) {
	for (let index = 0; index < body.length; index += 1) {
		const code = body.charCodeAt(index);
		if (code === 32 || code === 9 || code === 10 || code === 13) continue;
		return code === 123;
	}
	return false;
}

/** Normalize one baseURL into a prefix-comparable root (no trailing slash). */
function normalizeBase(baseURL) {
	try {
		const parsed = new URL(baseURL);
		const path = parsed.pathname.replace(/\/+$/u, "");
		return `${parsed.origin}${path}`;
	} catch {
		return "";
	}
}

/**
 * Read every configured provider route's endpoint root from the live
 * settings sections. Longest base wins, so overlapping relays sort out.
 * @param {import("@deepseek-ai/cordis").Context} ctx - plugin context.
 * @returns {Array<{ route: string, base: string }>} the endpoints, longest base first.
 */
function readEndpoints(ctx) {
	const out = [];
	const settings = ctx.get("settings");
	if (settings === undefined) return out;
	try {
		for (const descriptor of settings.describe()) {
			if (descriptor.ns === PI_AI_NS) {
				const providers = isPlainRecord(descriptor.value) ? descriptor.value.providers : undefined;
				if (!isPlainRecord(providers)) continue;
				for (const [route, profile] of Object.entries(providers)) {
					const baseURL = isPlainRecord(profile) ? profile.baseURL : undefined;
					if (typeof baseURL !== "string" || baseURL.length === 0) continue;
					const base = normalizeBase(baseURL);
					if (base !== "") out.push({ route, base });
				}
			} else if (descriptor.ns === DEEPSEEK_NS) {
				const value = isPlainRecord(descriptor.value) ? descriptor.value : {};
				const baseURL =
					typeof value.baseURL === "string" && value.baseURL.length > 0 ? value.baseURL : DEEPSEEK_DEFAULT_BASE;
				const base = normalizeBase(baseURL);
				if (base !== "") out.push({ route: DEEPSEEK_ROUTE, base });
			}
		}
	} catch (error) {
		ctx.logger.warn("model-extra-config: reading provider endpoints failed");
		ctx.logger.warn(error);
	}
	out.sort((left, right) => right.base.length - left.base.length);
	return out;
}

/**
 * Install the plugin: no generated settings page (the Web UI owns the editor),
 * and one process-global fetch wrapper owned by this plugin's lifetime.
 * @param {import("@deepseek-ai/cordis").Context} ctx - plugin context.
 * @param {{ overrides: ReturnType<typeof createVolatile> }} config - the live config value.
 */
export function apply(ctx, config) {
	ctx.inject(["settings"], (child) => {
		child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
	});

	let endpoints = [];
	let endpointsDirty = true;
	const markDirty = () => {
		endpointsDirty = true;
	};
	// Any settings document change (providers added, baseURLs edited, our own
	// overrides saved) invalidates the cached route→endpoint map.
	ctx.on("loader/volatile-update", markDirty);
	ctx.on("settings/document-updated", markDirty);

	const endpointsNow = () => {
		if (endpointsDirty) {
			endpoints = readEndpoints(ctx);
			endpointsDirty = false;
		}
		return endpoints;
	};

	const reported = new Set();
	const reportOnce = (route, model) => {
		const key = `${route}\u0000${model}`;
		if (reported.has(key)) return;
		reported.add(key);
		ctx.logger.info(`model-extra-config: applying overrides on route "${route}"${model === undefined ? "" : ` model "${model}"`}`);
	};

	/** The override entry for the first configured route whose base prefixes the URL. */
	const routeOverrideFor = (url) => {
		const overrides = config.overrides.get();
		if (overrides === undefined || Object.keys(overrides).length === 0) return undefined;
		for (const { route, base } of endpointsNow()) {
			if (!url.startsWith(base)) continue;
			const entry = overrides[route];
			if (entry !== undefined) return { route, entry };
		}
		return undefined;
	};

	/**
	 * Compute the (possibly rewritten) fetch arguments. Everything is
	 * synchronous and total: any failure falls back to the original call.
	 * @param {RequestInfo | URL} input - the original input.
	 * @param {RequestInit | undefined} init - the original init.
	 * @returns {[RequestInfo | URL, RequestInit | undefined]} the arguments to dispatch.
	 */
	function rewrite(input, init) {
		let url;
		if (typeof input === "string") url = input;
		else if (input instanceof URL) url = input.href;
		else return [input, init];
		const hit = routeOverrideFor(url);
		if (hit === undefined) return [input, init];
		const { route, entry } = hit;

		const options = init ?? {};
		const body = options.body;
		let parsed;
		let model;
		// Body rewriting needs a string JSON body whose top level names the
		// model (every supported protocol sends `model`); anything else only
		// receives header overrides.
		if (typeof body === "string" && body.length > 0 && looksLikeJsonBody(body)) {
			const candidate = parseJson(body);
			if (isPlainRecord(candidate) && typeof candidate.model === "string") {
				parsed = candidate;
				model = candidate.model;
			}
		}
		const modelEntry = model === undefined ? undefined : entry.models[model];

		let nextInit = options;
		if (model !== undefined) {
			const patch = deepMerge(entry.body ?? {}, modelEntry?.body ?? {});
			if (Object.keys(patch).length > 0) {
				nextInit = { ...nextInit, body: JSON.stringify(deepMerge(parsed, patch)) };
				reportOnce(route, model);
			}
		}
		const headerPatch = { ...(entry.headers ?? {}), ...(modelEntry?.headers ?? {}) };
		if (Object.keys(headerPatch).length > 0) {
			const headers = new Headers(options.headers);
			for (const [name, value] of Object.entries(headerPatch)) headers.set(name, value);
			nextInit = { ...nextInit, headers };
			reportOnce(route, model);
		}
		return nextInit === options ? [input, init] : [input, nextInit];
	}

	ctx.effect(() => {
		const original = globalThis.fetch;
		if (typeof original !== "function") return () => {};
		const hooked = function (input, init) {
			try {
				const [nextInput, nextInit] = rewrite(input, init);
				return original.call(globalThis, nextInput, nextInit);
			} catch {
				return original.call(globalThis, input, init);
			}
		};
		globalThis.fetch = hooked;
		return () => {
			if (globalThis.fetch === hooked) globalThis.fetch = original;
		};
	}, "model-extra-config: fetch hook");
}

export { Config };
