import { UtilsConfig, type TextOptions } from "../interfaces";
import { cleanUpValue } from "../fields/cleanup";
import { isNumber } from "./number";

const REGEX_RECOGNITION = /\/(?<regex>.*)\/(?<flag>[gmiyuvsd]*)/;
const DUPLICATE_FLAG_REGEX = /(.)\1+/g;
export default class Utils {
	private stringCache: Map<string, string> = new Map();
	private regexCache: Map<string, RegExp | null> = new Map();
	prefix: string = "[Dataview Properties]";
	private configs: Map<UtilsConfig, TextOptions> = new Map();
	private activeConfig: UtilsConfig = UtilsConfig.Default;

	constructor(options: TextOptions) {
		this.configs.set(UtilsConfig.Default, options);
	}
	setConfig(name: UtilsConfig, options: TextOptions): void {
		this.configs.set(name, options);
	}
	useConfig(name: UtilsConfig): boolean {
		if (!this.configs.has(name)) return false;
		this.activeConfig = name;
		return true;
	}
	private getOptions(): TextOptions {
		return this.configs.get(this.activeConfig) || this.configs.get(UtilsConfig.Default)!;
	}

	/**
	 * Remove duplicate regex flags
	 */
	private removeDuplicateFlag(input: string): string {
		return input.replace(DUPLICATE_FLAG_REGEX, "$1");
	}

	/**
	 * Parse a string to extract regex pattern and flags
	 */
	recognizeRegex(key: string): RegExp | null {
		if (this.regexCache.has(key)) return this.regexCache.get(key) || null;

		const match = key.match(REGEX_RECOGNITION);
		if (!match || !match.groups) {
			this.regexCache.set(key, null);
			return null;
		}

		try {
			const { regex, flag } = match.groups;
			const correctedFlag = this.removeDuplicateFlag(flag);
			const compiledRegex = new RegExp(regex, correctedFlag);

			// Cache the compiled regex
			this.regexCache.set(key, compiledRegex);
			return compiledRegex;
		} catch (e) {
			console.error(`${this.prefix} Error creating regex:`, e);
			this.regexCache.set(key, null);
			return null;
		}
	}

	/**
	 * Check if two keys match, considering case and accent options
	 */
	keysMatch(frontmatterKey: string, inlineKey: string): boolean {
		if (frontmatterKey === inlineKey) return true;
		const processedFmKey = this.processString(frontmatterKey);
		const processedInlineKey = this.processString(inlineKey);
		if (processedFmKey === processedInlineKey) return true;
		if (frontmatterKey.includes("/")) {
			const regex = this.recognizeRegex(frontmatterKey);
			if (regex && regex.test(inlineKey)) return true;
		}
		return false;
	}

	/**
	 * Process string based on options (lowercase, accent removal)
	 */
	processString(str: string): string {
		const options = this.getOptions();
		const cacheKey = `${str}_${options.lowerCase}_${options.ignoreAccents}`;
		const cached = this.stringCache.get(cacheKey);
		if (cached !== undefined) return cached;
		let result = str;
		if (options.lowerCase) result = result.toLowerCase();
		if (options.ignoreAccents) result = result.removeAccents();
		this.stringCache.set(cacheKey, result);
		return result;
	}

	/**
	 * Check if two values are equal
	 */
	valuesEqual(val1: any, val2: any): boolean {
		if (val1 === val2) return true;
		if (typeof val1 === "string" && typeof val2 === "string")
			return this.processString(val1) === this.processString(val2);
		if (
			(typeof val1 === "number" || isNumber(val1)) &&
			(typeof val2 === "number" || isNumber(val2))
		)
			return Number(val1) === Number(val2);
		return false;
	}

	/**
	 * Remove specified text patterns from a value
	 * @param value The value to clean
	 * @param fields The fields to remove
	 * @returns The cleaned value or null if empty
	 */
	removeFromValue(value: string, cleanupFields: string[]): string | null {
		const options = this.getOptions();
		return cleanUpValue(value, cleanupFields, (field) => this.recognizeRegex(field), {
			lowerCase: options.lowerCase,
			ignoreAccents: options.ignoreAccents,
		});
	}
}

export function parseMarkdownList(markdown: string): (string | number)[] {
	const lines = markdown.split("\n");
	const result: (string | number)[] = [];
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		const unorderedMatch = trimmed.match(/^[-*+]\s+(.*)$/);
		if (unorderedMatch) {
			result.push(unorderedMatch[1]);
			continue;
		}
		const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
		if (orderedMatch) {
			result.push(orderedMatch[1]);
			continue;
		}
	}
	return result;
}
