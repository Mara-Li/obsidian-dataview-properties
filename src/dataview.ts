import {
	type DataviewApi,
	getAPI,
	isPluginEnabled,
	Link,
	type Literal, Values,
} from "@enveloppe/obsidian-dataview";
import { Component, type FrontMatterCache, htmlToMarkdown } from "obsidian";
import type DataviewProperties from "./main";
import { convertToNumber } from "./utils";

class Dataview {
	dvApi: DataviewApi;
	sourceText: string;
	path: string;

	constructor(dvApi: DataviewApi, sourceText: string, path: string) {
		this.dvApi = dvApi;
		this.sourceText = sourceText;
		this.path = path;
	}
	private escapeRegex(filepath: string): string {
		return filepath.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&");
	}
	private dvInlineQueryMatches() {
		const inlineQueryPrefix = this.dvApi.settings.inlineQueryPrefix || "=";
		const inlineDataViewRegex = new RegExp(
			`\`${this.escapeRegex(inlineQueryPrefix)}(.+?)\``,
			"gsm"
		);
		return this.sourceText.matchAll(inlineDataViewRegex);
	}
	private dvInlineJSMatches() {
		const inlineJsQueryPrefix = this.dvApi.settings.inlineJsQueryPrefix || "$=";
		const inlineJsDataViewRegex = new RegExp(
			`\`${this.escapeRegex(inlineJsQueryPrefix)}(.+?)\``,
			"gsm"
		);
		return this.sourceText.matchAll(inlineJsDataViewRegex);
	}
	matches() {
		return {
			inlineMatches: this.dvInlineQueryMatches(),
			inlineJsMatches: this.dvInlineJSMatches(),
		};
	}
	private removeDataviewQueries(dataviewMarkdown: Literal): string {
		const toStr = dataviewMarkdown?.toString();
		return dataviewMarkdown && toStr ? toStr : "";
	}

	/**
	 * Inline DQL Dataview - The SQL-like Dataview Query Language in inline
	 * Syntax : `= query`
	 * (the prefix can be changed in the settings)
	 * @source https://blacksmithgu.github.io/obsidian-dataview/queries/dql-js-inline/#inline-dql
	 */

	async inlineDQLDataview(query: string) {
		const dataviewResult = this.dvApi.evaluateInline(query, this.path);
		if (dataviewResult.successful) {
			return this.removeDataviewQueries(dataviewResult.value);
		} else {
			return this.removeDataviewQueries(this.dvApi.settings.renderNullAs);
		}
	}
	/**
	 * Inline DataviewJS - JavaScript API for Dataview in inline
	 * Syntax : `$=js query`
	 * For the moment, it is not possible to properly process the inlineJS.
	 * Temporary solution : encapsulate the query into "pure" JS :
	 * ```ts
	 * const query = queryFound;
	 * dv.paragraph(query);
	 * ```
	 * After the evaluation, the div is converted to markdown with {@link htmlToMarkdown()} and the dataview queries are removed
	 */
	async inlineDataviewJS(query: string) {
		const evaluateQuery = `
				const query = ${query};
				dv.paragraph(query);
			`;
		// biome-ignore lint/correctness/noUndeclaredVariables: <explanation>
		const div = createEl("div");
		const component = new Component();
		await this.dvApi.executeJs(evaluateQuery, div, component, this.path);
		component.load();
		return this.removeDataviewQueries(htmlToMarkdown(div.innerHTML));
	}
}

export async function convertDataviewQueries(
	path: string,
	plugin: DataviewProperties,
	text: string
) {
	const { app, settings } = plugin;
	let replacedText = text;
	const dataViewRegex = /```dataview\s(.+?)```/gms;
	const isDataviewEnabled = app.plugins.plugins.dataview;
	if (!isDataviewEnabled || !isPluginEnabled(app)) return replacedText;
	const dvApi = getAPI(app);
	if (!dvApi) return replacedText;
	const matches = text.matchAll(dataViewRegex);
	const compiler = new Dataview(dvApi, text, path);
	const { inlineMatches, inlineJsMatches } = compiler.matches();
	if (!matches && !inlineMatches && !inlineJsMatches) {
		console.warn("No dataview queries found");
		return replacedText;
	}

	//Inline queries
	if (settings.dql) {
		for (const inlineQuery of inlineMatches) {
			try {
				const code = inlineQuery[0];
				const query = inlineQuery[1].trim();
				const markdown = await compiler.inlineDQLDataview(query);
				replacedText = replacedText.replace(code, markdown);
			} catch (e) {
				console.error(e);
				return inlineQuery[0];
			}
		}
	}
	//Inline JS queries
	if (settings.djs) {
		for (const inlineJsQuery of inlineJsMatches) {
			try {
				const code = inlineJsQuery[0];
				const markdown = await compiler.inlineDataviewJS(inlineJsQuery[1].trim());
				replacedText = replacedText.replace(code, markdown);
			} catch (e) {
				console.error(e);
				return inlineJsQuery[0];
			}
		}
	}
	return replacedText;
}

export async function getInlineFields(
	path: string,
	plugin: DataviewProperties,
	frontmatter?: FrontMatterCache
): Promise<Record<string, any>> {
	const { app } = plugin;
	const isDataviewEnabled = app.plugins.plugins.dataview;
	if (!isDataviewEnabled || !isPluginEnabled(app)) return {};

	const dvApi = getAPI(app);
	if (!dvApi) return {};
	const pageData = dvApi.page(path);
	if (!pageData) return {};
	const inlineFields: Record<string, any> = {};
	for (const key in pageData) {
		if (key !== "file" && (!frontmatter || !(key in frontmatter))) {
			inlineFields[key] = pageData[key];
		} else {
			if (Array.isArray(pageData[key]) && pageData[key].length > 1) {
				//get the last value
				inlineFields[key] = pageData[key][pageData[key].length - 1];
			} else if (Array.isArray(pageData[key])) {
				inlineFields[key] = pageData[key][0];
			}
		}
	}
	return await evaluateInline(inlineFields, path, plugin);
}

async function evaluateInline(
	inlineFields: Record<string, any>,
	path: string,
	plugin: DataviewProperties
) {
	const processedInlineFields: Record<string, any> = {};
	for (const [field, value] of Object.entries(inlineFields)) {
		if (typeof value === "string") {
			//evaluate
			processedInlineFields[field] = convertToNumber(
				await convertDataviewQueries(path, plugin, value)
			);
		} else {
			//if the value is a Link, convert it to a "[[link]]" string
			if (value instanceof Link) {
				const fieldValue = value as Link;
				processedInlineFields[field] = stringifyLink(fieldValue);
			} else if (Values.isHtml(value)) {
				//if the value is a HTML, it wont be a valid frontmatter, so we warn and skip
				console.warn(`Invalid frontmatter value: HTML `, value, "-- Skipping");
			} else if (Values.isWidget(value)) {
				//if the value is a Widget, it wont be a valid frontmatter, so we warn and skip
				console.warn(`Invalid frontmatter value: Widget `, value, "-- Skipping");
			} else if (Values.isFunction(value)) {
				//if the value is a Function, it wont be a valid frontmatter, so we warn and skip
				console.warn(`Invalid frontmatter value: Function `, value, "-- Skipping");
			}
			//keep the value as is
			else processedInlineFields[field] = value;
		}
	}
	return processedInlineFields;
}

function stringifyLink(fieldValue: Link) {
	let path = fieldValue.path;
	if (fieldValue.subpath) {
		path += `#${fieldValue.subpath}`;
	}
	if (fieldValue.display) {
		return `[[${path}|${fieldValue.display}]]`;
	}
	return `[[${path}]]`;
}
