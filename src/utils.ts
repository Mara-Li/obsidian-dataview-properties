import type { TextOptions } from "./interfaces";

// Regex patterns compiled once for better performance
const NUMBER_REGEX = /^-?\d+(\.\d+)?$/;
const REGEX_RECOGNITION = /\/(?<regex>.*)\/(?<flag>[gmiyuvsd]*)/;
const DUPLICATE_FLAG_REGEX = /(.)\1+/g;

/**
 * Verify if a value is a number, even if it's a "number" string
 * Optimized with direct regex check
 */
export function isNumber(value: unknown): boolean {
	if (value === undefined) return false;
	if (typeof value === "number") return !Number.isNaN(value);
	if (typeof value !== "string" || !value.trim()) return false;

	return NUMBER_REGEX.test(value);
}

/**
 * Convert a value to number if possible
 * Faster implementation with early returns
 */
export function convertToNumber(value: unknown): number | unknown {
	// Fast path for actual numbers
	if (typeof value === "number") return value;

	// Only process strings that might be numbers
	if (typeof value === "string" && value.trim() && NUMBER_REGEX.test(value)) {
		return Number(value);
	}

	return value;
}

export class Utils {
	options: TextOptions;
	// Cache for processed strings to avoid redundant processing
	private stringCache: Map<string, string> = new Map();
	// Cache for regex objects
	private regexCache: Map<string, RegExp | null> = new Map();

	constructor(options: TextOptions) {
		this.options = options;
	}

	/**
	 * Remove duplicate regex flags
	 */
	private removeDuplicateFlag(input: string): string {
		return input.replace(DUPLICATE_FLAG_REGEX, "$1");
	}

	/**
	 * Parse a string to extract regex pattern and flags
	 * With caching to avoid recompiling the same regex
	 */
	recognizeRegex(key: string): RegExp | null {
		// Check cache first
		if (this.regexCache.has(key)) {
			return this.regexCache.get(key) || null;
		}

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
			console.error("Error creating regex:", e);
			this.regexCache.set(key, null);
			return null;
		}
	}

	/**
	 * Check if two keys match, considering case and accent options
	 */
	keysMatch(frontmatterKey: string, inlineKey: string): boolean {
		// Fast path for direct equality
		if (frontmatterKey === inlineKey) return true;

		const processedFmKey = this.processString(frontmatterKey);
		const processedInlineKey = this.processString(inlineKey);

		// Check normalized strings
		if (processedFmKey === processedInlineKey) return true;

		// Check regex match if frontmatterKey might be a regex
		if (frontmatterKey.includes("/")) {
			const regex = this.recognizeRegex(frontmatterKey);
			if (regex && regex.test(inlineKey)) return true;
		}

		return false;
	}

	/**
	 * Process string based on options (lowercase, accent removal)
	 * With caching for performance
	 */
	processString(str: string): string {
		// Return from cache if available
		const cacheKey = `${str}_${this.options.lowerCase}_${this.options.ignoreAccents}`;
		const cached = this.stringCache.get(cacheKey);
		if (cached !== undefined) {
			return cached;
		}

		// Process the string
		let result = str;
		if (this.options.lowerCase) {
			result = result.toLowerCase();
		}
		if (this.options.ignoreAccents) {
			result = result.removeAccents();
		}

		// Cache and return
		this.stringCache.set(cacheKey, result);
		return result;
	}

	/**
	 * Check if two values are equal, considering options
	 */
	valuesEqual(val1: any, val2: any): boolean {
		// Fast path for direct equality
		if (val1 === val2) return true;

		// Special handling for strings
		if (typeof val1 === "string" && typeof val2 === "string") {
			return this.processString(val1) === this.processString(val2);
		}

		// Handle number comparisons - account for string/number equivalence
		if (
			(typeof val1 === "number" || isNumber(val1)) &&
			(typeof val2 === "number" || isNumber(val2))
		) {
			return Number(val1) === Number(val2);
		}

		return false;
	}

	/**
	 * Remove specified text patterns from a value
	 */
	removeFromValue(value: string, fields: string[]): string | null {
		// Fast path if no fields to remove
		if (!fields.length || typeof value !== "string") {
			return value;
		}

		let result = value;

		// Create flags for the regex
		const flags = this.options.lowerCase ? "i" : "";

		// Process each field
		for (const field of fields) {
			// Try to recognize as regex first
			const regex = this.recognizeRegex(field);

			if (regex) {
				// Use the regex as is
				result = result.replace(regex, "");
			} else {
				// Create a regex from the field
				let fieldPattern = field;
				if (this.options.ignoreAccents) {
					fieldPattern = fieldPattern.removeAccents();
				}

				// Escape regex special characters
				fieldPattern = fieldPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

				// Create and apply the regex
				const fieldRegex = new RegExp(fieldPattern, flags);
				result = result.replace(fieldRegex, "");
			}
		}

		// Trim and validate result
		result = result.trim();
		return result.length ? result : null;
	}
}
