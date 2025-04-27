/**
 * Verify if a value is a number, even if it's a "number" string
 * @param value {unknown}
 * @returns {boolean}
 */
function isNumber(value: unknown): boolean {
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
