import type { DataviewPropertiesSettings } from "./interfaces";
import type DataviewProperties from "./main";

/**
 * Verify if a value is a number, even if it's a "number" string
 * @param value {unknown}
 * @returns {boolean}
 */
export function isNumber(value: unknown): boolean {
	return (
		value !== undefined &&
		(typeof value === "number" ||
			(!Number.isNaN(Number(value)) &&
				typeof value === "string" &&
				value.trim().length > 0))
	);
}

/**
 * Convert a number (string) to a number if it is a number
 * @param value {unknown}
 * @return {unknown|number}
 */
export function convertToNumber(value: unknown): number | unknown {
	if (isNumber(value)) {
		return Number(value);
	}
	return value;
}


export class Utils {
	private settings: DataviewPropertiesSettings;
	private plugin: DataviewProperties;

	constructor(plugin: DataviewProperties) {
		this.plugin = plugin;
		this.settings = plugin.settings;
	}

	keysMatch(frontmatterKey: string, inlineKey: string): boolean {
		const processedFmKey = this.processString(frontmatterKey);
		const processedInlineKey = this.processString(inlineKey);
		if (processedFmKey === processedInlineKey) return true;

		// Vérification par regex si la clé frontmatter est une regex
		const regex = this.plugin.recognizeRegex(frontmatterKey);
		if (regex && regex.test(inlineKey)) return true;

		return false;
	};

	processString(str: string): string {
		let result = str;
		if (this.settings.lowerCase) result = result.toLowerCase();
		if (this.settings.ignoreAccents) result = result.removeAccents();
		return result;
	};
	valuesEqual(val1: any, val2: any): boolean {
		if (val1 === val2) return true;
		if (typeof val1 === "string" && typeof val2 === "string") {
			return this.processString(val1) === this.processString(val2);
		}

		return false;
	};
}