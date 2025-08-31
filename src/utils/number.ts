// Regex patterns compiled once for better performance
const NUMBER_REGEX = /^-?\d+e?\d*(\.\d+)?$/;

/**
 * Verify if a value is a number, even if it's a "number" string
 * @param {unknown} value The value to verify
 * @return {boolean} True if the value is a number or a string that can be converted to a number
 */
export function isNumber(value: unknown): boolean {
	if (value == null) return false;
	if (typeof value === "number") return !Number.isNaN(value);
	if (typeof value !== "string" || !value.trim()) return false;

	return NUMBER_REGEX.test(value);
}

/**
 * Convert a value to number if possible
 * @param {unknown} value The value to convert
 * @return {number | unknown} The converted number or the original value
 */
export function convertToNumber(value: unknown): number | unknown {
	if (typeof value === "number") return value;
	if (isNumber(value)) return Number(value);
	return value;
}
