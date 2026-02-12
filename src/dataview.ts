import {
	type DataviewApi,
	getAPI,
	type Link,
	type Literal,
	Values,
} from "@enveloppe/obsidian-dataview";
import dedent from "dedent";
import { Duration } from "luxon";
import { Component, type FrontMatterCache, htmlToMarkdown } from "obsidian";
import { isRecognized } from "./fields";
import { UtilsConfig } from "./interfaces";
import type DataviewProperties from "./main";
import { convertToNumber, unflatten } from "./utils";
import { parseMarkdownList } from "./utils/text_utils";

/**
 * Handles Dataview API interactions and query evaluation
 */
export class Dataview {
	dvApi: DataviewApi;
	path: string;
	plugin: DataviewProperties;
	sourceText: string;
	private queryCache: Map<string, string> = new Map();

	// compiled regexes for inline dataview queries (reused)
	dqlRe: RegExp;
	djsRe: RegExp;

	prefix: string = "[Dataview Properties]";

	constructor(dvApi: DataviewApi, path: string, plugin: DataviewProperties) {
		this.dvApi = dvApi;
		this.path = path;
		this.plugin = plugin;
		this.sourceText = "";

		// precompile inline-query regexes so they can be reused by helper methods
		const dqlPrefix = this.dvApi.settings.inlineQueryPrefix || "=";
		const djsPrefix = this.dvApi.settings.inlineJsQueryPrefix || "$=";
		// keep regex *without* the global flag so `.test()` is stable
		this.dqlRe = new RegExp(`\`${this.escapeRegex(dqlPrefix)}(.+?)\``, "sm");
		this.djsRe = new RegExp(`\`${this.escapeRegex(djsPrefix)}(.+?)\``, "sm");
	}

	/**
	 * Escape special regex characters in string
	 */
	private escapeRegex(text: string): string {
		return text.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&");
	}

	/**
	 * Get all matches for inline DQL queries
	 */
	private dvInlineQueryMatches(): IterableIterator<RegExpMatchArray> | [] {
		// matchAll requires a global regex; create one from the same source
		return this.sourceText.matchAll(new RegExp(this.dqlRe.source, "gsm"));
	}

	/**
	 * Get all matches for inline JS queries
	 */
	private dvInlineJSMatches(): IterableIterator<RegExpMatchArray> | [] {
		// matchAll requires a global regex; create one from the same source
		return this.sourceText.matchAll(new RegExp(this.djsRe.source, "gsm"));
	}

	/**
	 * Find all dataview query matches in the sourceText
	 */
	matches() {
		return {
			inlineMatches: this.dvInlineQueryMatches(),
			inlineJsMatches: this.dvInlineJSMatches(),
		};
	}

	/**
	 * Clean and sanitize dataview results
	 */
	private removeDataviewQueries(dataviewMarkdown: Literal): string {
		if (dataviewMarkdown == null) return "";
		const toStr = dataviewMarkdown?.toString();
		return toStr || "";
	}

	/**
	 * Process inline DQL Dataview queries
	 * @param query The DQL query to evaluate
	 * @returns The evaluated result as string
	 */
	async inlineDQLDataview(query: string): Promise<string> {
		const cacheKey = `dql:${query}:${this.path}`;
		if (this.queryCache.has(cacheKey)) return this.queryCache.get(cacheKey)!;

		try {
			const dataviewResult = this.dvApi.evaluateInline(query, this.path);
			let result: string;

			if (dataviewResult.successful)
				result = this.removeDataviewQueries(dataviewResult.value);
			else result = this.removeDataviewQueries(this.dvApi.settings.renderNullAs);

			// Cache the result
			this.queryCache.set(cacheKey, result);
			return result;
		} catch (error) {
			console.error(`${this.prefix} Error evaluating DQL query '${query}':`, error);
			return "";
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve, _) => {
			setTimeout(resolve, ms);
		});
	}

	/**
	 * Process inline DataviewJS queries
	 * @param query The JavaScript query to evaluate
	 * @returns The evaluated result as markdown
	 */
	async inlineDataviewJS(query: string): Promise<string> {
		const cacheKey = `djs:${query}:${this.path}`;
		if (this.queryCache.has(cacheKey)) return this.queryCache.get(cacheKey)!;
		try {
			// biome-ignore lint/correctness/noUndeclaredVariables: createEl is a global function from Obsidian
			const div = createEl("div");
			const component = new Component();
			component.load();
			const evaluateQuery = dedent(`
				try {
					const query = ${query};
					dv.el("div", query);
				} catch(e) {
					dv.paragraph("Evaluation Error: " + e.message);
				}
			`);
			/**
			 * @credit saberzero1 with Quartz Syncer
			 */
			await this.dvApi.executeJs(evaluateQuery, div, component, this.path);
			let counter = 0;
			while (!div.querySelector("[data-tag-name]") && counter < 50) {
				await this.delay(5);
				counter++;
			}

			const result = this.removeDataviewQueries(htmlToMarkdown(div));
			this.queryCache.set(cacheKey, result);
			return result;
		} catch (error) {
			console.error(`${this.prefix} Error evaluating JS query '${query}':`, error);
			return "Evaluation Error";
		}
	}

	/**
	 * Convert markdown link to wiki link format
	 * @note This should transform to [[link]] only if:
	 * - Not http(s)
	 * - Not starting with `app://`
	 * But transform if `/app://obsidian.md/` is present
	 * @param {string} value
	 */
	toWikiLink(value: unknown): unknown {
		const regex = /\[(?<display>.*)?\]\((?<link>.*)\)/g;
		if (!Values.isString(value)) return value;
		const match = regex.exec(value);
		if (match) {
			const { display, link } = match.groups!;
			const displayLink = display && display.trim().length > 0 ? `|${display}` : "";
			if (link.startsWith("http") || link.startsWith("/")) return value;
			if (link.startsWith("app://")) {
				if (link.startsWith("app://obsidian")) {
					const newLink = link.replace("app://obsidian.md/", "").replace(/\.md$/, "");
					return `[[${newLink.replace(/\.md$/, "")}${displayLink}]]`;
				} else return value;
			}
			return `[[${link}${displayLink}]]`;
		}
		return value;
	}

	convertToDvArrayLinks(values: unknown[]): unknown[] {
		const res: unknown[] = [];
		for (const value of values) {
			if (Values.isLink(value)) {
				const link = this.stringifyLink(value);
				res.push(link);
			} else res.push(this.toWikiLink(decodeURI(value as string)));
		}
		return res;
	}

	/**
	 * Return true if the provided value contains an inline DQL or DJS query.
	 */
	containsDvQuery(val: unknown): boolean {
		if (!Values.isString(val)) return false;
		const s = val as string;
		return this.dqlRe.test(s) || this.djsRe.test(s);
	}

	/**
	 * onlyMode helper: decide whether a field should be included when onlyMode
	 * is enabled. Uses precompiled regexes and `this.plugin.utils` for
	 * normalization (OnlyMode UtilsConfig).
	 */
	async onlyModeAllowsField(key: string, inlineValue: unknown): Promise<boolean> {
		const settings = this.plugin.settings.onlyMode;
		if (!settings || !settings.enable) return true;

		// If value is array, inspect last element (same behaviour elsewhere)
		let sampleVal = inlineValue;
		if (Array.isArray(inlineValue) && inlineValue.length > 0)
			sampleVal = inlineValue[inlineValue.length - 1];

		// If the pageData still contains the raw inline query string, accept it
		if (this.containsDvQuery(sampleVal)) return true;

		// If the value is not a string (Dataview may have evaluated it),
		// inspect the source file for a matching inline field definition.
		if (!Values.isString(sampleVal)) {
			try {
				const tfile = this.plugin.app.vault.getAbstractFileByPath(this.path) as
					| import("obsidian").TFile
					| null;
				if (tfile) {
					const content = await this.plugin.app.vault.read(tfile);
					const escapedKey = String(key).replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
					const lineRe = new RegExp(`^\\s*${escapedKey}\\s*::\\s*([^\\n]+)`, "m");
					const m = content.match(lineRe);
					if (m?.[1] && this.containsDvQuery(m[1])) return true;
				}
			} catch {
				// ignore read errors and continue to forceFields matching
			}
		}

		// check forceFields using Utils.processString with OnlyMode config
		const forceSettings = settings.forceFields || {
			fields: [],
			lowerCase: false,
			ignoreAccents: false,
		};
		if (!Array.isArray(forceSettings.fields) || forceSettings.fields.length === 0)
			return false;

		this.plugin.utils.useConfig(UtilsConfig.OnlyMode);
		try {
			const normalizedKey = this.plugin.utils.processString(String(key));
			const normalized = forceSettings.fields.map((f) =>
				this.plugin.utils.processString(String(f))
			);
			const isForced = normalized.includes(normalizedKey);
			return isForced;
		} finally {
			this.plugin.utils.useConfig(UtilsConfig.Default);
		}
	}

	isHtml(value: unknown): boolean {
		if (Values.isString(value)) {
			const regex = /<[^>]+>/g;
			return regex.test(value as string);
		}
		return false;
	}

	// biome-ignore lint/suspicious/noExplicitAny: dataview use type strangly
	private convertDuration(field: any): string {
		const { humanReadableOptions, textReplacement, formatDuration } =
			this.plugin.settings.dataviewOptions.durationFormat;
		if (!formatDuration) return field.toString();
		console.debug(`${this.prefix} Converting Duration:`, field);
		//should keep duration in a readable format
		const dur = Duration.fromObject(field.values);

		const formatedDur = dur.toHuman(humanReadableOptions);

		if (textReplacement?.toReplace) {
			return formatedDur.replaceAll(
				textReplacement.toReplace,
				textReplacement.replaceWith
			);
		}
		return formatedDur;
	}

	/**
	 * Evaluate and convert a dataview field value
	 */
	async evaluateInline(
		value: unknown,
		fieldName: string,
		evaluatedFields?: Record<string, unknown>
	): Promise<unknown | undefined> {
		if (value === "" || value === undefined) return;

		try {
			if (Values.isString(value)) {
				let res = convertToNumber(
					await this.convertDataviewQueries(value as string, evaluatedFields)
				);

				if (Values.isString(res)) {
					if (this.isHtml(res)) res = htmlToMarkdown(res);

					if (
						isRecognized(fieldName, this.plugin.listFields, this.plugin.utils) ||
						fieldName.endsWith(this.plugin.settings.listSuffix)
					) {
						return this.convertToDvArrayLinks(parseMarkdownList(res as string));
					}
					return res;
				}
				return res;
			}

			if (Values.isLink(value as Link) || value?.constructor.name === "Link")
				return this.stringifyLink(value as Link);

			if (Values.isHtml(value)) return htmlToMarkdown(value);

			if (Values.isWidget(value)) {
				console.warn(`${this.prefix} Skipping widget value: ${value}`);
				return;
			}
			if (Values.isFunction(value)) {
				console.warn(`${this.prefix} Skipping function value: ${value}`);
				return;
			}
			if (Values.isNull(value)) {
				console.warn(`${this.prefix}  Skipping null value`);
				return;
			}
			if (Values.isArray(value)) {
				return await Promise.all(
					value.map((item) => this.evaluateInline(item, fieldName, evaluatedFields))
				);
			}
			if (value?.constructor.name === "Duration")
				return this.convertDuration(value as Duration);
			return value;
		} catch (error) {
			console.error(`${this.prefix} Error evaluating inline value:`, error);
			return;
		}
	}

	/**
	 * Convert a Dataview Link object to markdown link format
	 */
	private stringifyLink(fieldValue: Link): string {
		function stringify() {
			const l = fieldValue.toString();
			if (!fieldValue.display && !fieldValue.subpath) return l.replace(/\|.*\]{2}/, "]]");
			return l;
		}
		const file = this.plugin.app.vault.getFileByPath(fieldValue.path);
		if (!file) return stringify();
		return this.plugin.app.fileManager.generateMarkdownLink(
			file,
			this.path,
			fieldValue.subpath ? `#${fieldValue.subpath}` : undefined,
			fieldValue.display
		);
	}

	/**
	 * Process text to evaluate and convert any dataview queries
	 */
	private async convertDataviewQueries(
		text: string,
		evaluatedFields?: Record<string, unknown>
	): Promise<string> {
		const { app, settings } = this.plugin;
		if (!this.plugin.isDataviewEnabled()) return text;

		const dvApi = getAPI(app);
		if (!dvApi) return text;
		this.sourceText = text;
		const { inlineMatches, inlineJsMatches } = this.matches();

		// Debug: log when a probable inline query is passed but no matches found
		if (
			typeof text === "string" &&
			text.includes("=`") === false &&
			text.includes("`=")
		) {
			// noop to satisfy linter; left intentionally minimal
		}
		let replacedText = text;
		if (settings.dql) {
			let found = false;
			for (const inlineQuery of inlineMatches) {
				found = true;
				const code = inlineQuery[0];
				const query = inlineQuery[1].trim();

				// substitute `this.<field>` using provided evaluatedFields before evaluation
				const substitutedQuery = evaluatedFields
					? query.replace(/\bthis\.([A-Za-z0-9_-]+)\b/g, (_m, name) => {
							if (name in evaluatedFields) return JSON.stringify(evaluatedFields[name]);
							return _m;
						})
					: query;

				const markdown = await this.inlineDQLDataview(substitutedQuery);

				if (!markdown.includes("Evaluation Error")) {
					replacedText = replacedText.replace(code, markdown);
				}
			}
			if (!found && typeof text === "string" && /`\s*=?/.test(text)) {
				// no inline matches found for this text
			}
		}

		if (settings.djs) {
			for (const inlineJsQuery of inlineJsMatches) {
				const code = inlineJsQuery[0];
				const query = inlineJsQuery[1].trim();

				const markdown = await this.inlineDataviewJS(query);
				if (!markdown.includes("Evaluation Error")) {
					replacedText = replacedText.replace(code, markdown);
				}
			}
		}

		// Fallback: if nothing was replaced but the entire value looks like a
		// single inline query (e.g. `= 1 + 2`), try evaluating it directly.
		if (replacedText === text && typeof text === "string") {
			const trimmed = text.trim();
			const fullDql = trimmed.match(/^`\s*(=)\s*([\s\S]+?)\s*`$/);
			const fullDjs = trimmed.match(/^`\s*(\$=)\s*([\s\S]+?)\s*`$/);
			if (fullDql) {
				const mdQuery = evaluatedFields
					? fullDql[2].trim().replace(/\bthis\.([A-Za-z0-9_-]+)\b/g, (_m, name) => {
							if (evaluatedFields && name in evaluatedFields)
								return JSON.stringify(evaluatedFields[name]);
							return _m;
						})
					: fullDql[2].trim();
				const markdown = await this.inlineDQLDataview(mdQuery);
				if (!markdown.includes("Evaluation Error")) replacedText = markdown;
			} else if (fullDjs) {
				const markdown = await this.inlineDataviewJS(fullDjs[2].trim());
				if (!markdown.includes("Evaluation Error")) replacedText = markdown;
			}
		}
		return replacedText;
	}
}

/**
 * Get all inline dataview fields from a file
 * @param path File path
 * @param plugin Plugin instance
 * @param frontmatter Existing frontmatter (optional)
 * @returns Object containing field names and values
 */
export async function getInlineFields(
	path: string,
	plugin: DataviewProperties,
	frontmatter?: FrontMatterCache
): Promise<Record<string, unknown>> {
	const { app } = plugin;
	if (!plugin.isDataviewEnabled()) return {};

	const dvApi = getAPI(app);
	if (!dvApi) return {};

	const pageData = dvApi.page(path);
	if (!pageData) return {};

	const compiler = new Dataview(dvApi, path, plugin);
	const inlineFields: Record<string, unknown> = {};
	const processedKeys = new Set<string>();

	for (const key in pageData) {
		if (key === "file") continue; // Skip file key

		const normalizedKey = key.toLowerCase();
		const withSpace = normalizedKey.replaceAll(" ", "-");
		const withoutInvalid = normalizedKey.replaceAll(/[([)\]]/g, "");
		if (
			processedKeys.has(normalizedKey) ||
			processedKeys.has(withSpace) ||
			processedKeys.has(withoutInvalid)
		)
			continue;

		processedKeys.add(normalizedKey);
		processedKeys.add(withSpace);
		processedKeys.add(withoutInvalid);

		if (!frontmatter || !(key in frontmatter)) {
			if (plugin.settings.onlyMode?.enable) {
				const inlineValue = pageData[key];
				const allowed = await compiler.onlyModeAllowsField(key, inlineValue);
				if (!allowed) continue;
			}

			inlineFields[key] = await compiler.evaluateInline(pageData[key], key, inlineFields);
		} else if (
			Array.isArray(pageData[key]) &&
			pageData[key].length > 0 &&
			!frontmatter?.[key]
		) {
			// Handle arrays by using the last value (most recent)
			const arrayValue = pageData[key];
			const valueToUse = arrayValue[arrayValue.length - 1];
			inlineFields[key] = await compiler.evaluateInline(valueToUse, key, inlineFields);
		}
	}

	if (plugin.settings.unflatten.enabled) {
		return unflatten(inlineFields, plugin.settings.unflatten.separator);
	}

	return inlineFields;
}

// ...existing code...
