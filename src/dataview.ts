import {
	type DataviewApi,
	getAPI,
	type Link,
	type Literal,
	Values,
} from "@enveloppe/obsidian-dataview";
import dedent from "dedent";
import { Component, type FrontMatterCache, htmlToMarkdown } from "obsidian";
import type DataviewProperties from "./main";
import { convertToNumber } from "./utils";

/**
 * Handles Dataview API interactions and query evaluation
 */
class Dataview {
	dvApi: DataviewApi;
	path: string;
	plugin: DataviewProperties;
	sourceText: string;
	private queryCache: Map<string, string> = new Map();

	prefix: string = "[Dataview Properties]";

	constructor(dvApi: DataviewApi, path: string, plugin: DataviewProperties) {
		this.dvApi = dvApi;
		this.path = path;
		this.plugin = plugin;
		this.sourceText = "";
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
		const inlineQueryPrefix = this.dvApi.settings.inlineQueryPrefix || "=";
		const inlineDataViewRegex = new RegExp(
			`\`${this.escapeRegex(inlineQueryPrefix)}(.+?)\``,
			"gsm"
		);
		return this.sourceText.matchAll(inlineDataViewRegex);
	}

	/**
	 * Get all matches for inline JS queries
	 */
	private dvInlineJSMatches(): IterableIterator<RegExpMatchArray> | [] {
		const inlineJsQueryPrefix = this.dvApi.settings.inlineJsQueryPrefix || "$=";
		const inlineJsDataViewRegex = new RegExp(
			`\`${this.escapeRegex(inlineJsQueryPrefix)}(.+?)\``,
			"gsm"
		);
		return this.sourceText.matchAll(inlineJsDataViewRegex);
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
		if (!dataviewMarkdown) return "";
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
			const evaluateQuery = dedent(`
				try {
					const query = ${query};
					dv.paragraph(query);
				} catch(e) {
					dv.paragraph("Evaluation Error: " + e.message);
				}
			`);

			await this.dvApi.executeJs(evaluateQuery, div, component, this.path);
			component.load();
			const result = this.removeDataviewQueries(htmlToMarkdown(div.innerHTML));
			this.queryCache.set(cacheKey, result);
			return result;
		} catch (error) {
			console.error(`${this.prefix} Error evaluating JS query '${query}':`, error);
			return "Evaluation Error";
		}
	}

	/**
	 * Evaluate and convert a dataview field value
	 */
	async evaluateInline(value: unknown): Promise<unknown | undefined> {
		if (value === "" || value === undefined) return;

		try {
			if (Values.isString(value))
				return convertToNumber(await this.convertDataviewQueries(value));

			if (Values.isLink(value)) return this.stringifyLink(value);

			if (Values.isHtml(value)) return Values.toString(value);

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
		let path = fieldValue.path;
		if (fieldValue.subpath) path += `#${fieldValue.subpath}`;
		if (fieldValue.display) return `[[${path}|${fieldValue.display}]]`;
		return `[[${path}]]`;
	}

	/**
	 * Process text to evaluate and convert any dataview queries
	 */
	private async convertDataviewQueries(text: string): Promise<string> {
		const { app, settings } = this.plugin;
		if (!this.plugin.isDataviewEnabled()) return text;

		const dvApi = getAPI(app);
		if (!dvApi) return text;
		this.sourceText = text;
		const { inlineMatches, inlineJsMatches } = this.matches();
		let replacedText = text;
		if (settings.dql) {
			for (const inlineQuery of inlineMatches) {
				const code = inlineQuery[0];
				const query = inlineQuery[1].trim();

				const markdown = await this.inlineDQLDataview(query);

				if (!markdown.includes("Evaluation Error")) {
					replacedText = replacedText.replace(code, markdown);
				}
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
): Promise<Record<string, any>> {
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
		const normalizedKey = key.toLowerCase();
		if (processedKeys.has(normalizedKey)) continue;
		processedKeys.add(normalizedKey);

		if (key !== "file" && (!frontmatter || !(key in frontmatter))) {
			const evaluated = await compiler.evaluateInline(pageData[key]);
			if (evaluated != null) inlineFields[key] = evaluated;
		} else if (Array.isArray(pageData[key]) && pageData[key].length > 0) {
			// Handle arrays by using the last value (most recent)
			const arrayValue = pageData[key];
			const valueToUse = arrayValue[arrayValue.length - 1];
			const evaluated = await compiler.evaluateInline(valueToUse);
			if (evaluated != null) inlineFields[key] = evaluated;
		}
	}

	return inlineFields;
}
