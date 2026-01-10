import Utils from "./text_utils";
export { Utils };
export { convertToNumber, isNumber } from "./number";

export function unflatten(
	input: Record<string, any>,
	separator: string
): Record<string, any> {
	const result: Record<string, any> = {};

	for (const key in input) {
		const parts = key.split(separator);
		let current = result;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (i === parts.length - 1) {
				current[part] = input[key];
			} else {
				if (!(part in current)) {
					current[part] = {};
				}
				current = current[part];
			}
		}
	}

	return result;
}

/**
 * Deep merge two objects, recursively merging nested objects
 * Arrays and primitives in target are replaced by source values
 */
export function deepMerge(target: any, source: any): any {
	// If source is null/undefined, return target
	if (source == null) return target;
	
	// If target is null/undefined, return source
	if (target == null) return source;
	
	// If both are not plain objects, return source (replaces target)
	if (!isPlainObject(target) || !isPlainObject(source)) {
		return source;
	}
	
	// Both are plain objects, merge them
	const result = { ...target };
	
	for (const key in source) {
		if (Object.prototype.hasOwnProperty.call(source, key)) {
			const sourceValue = source[key];
			const targetValue = result[key];
			
			// Recursively merge if both values are plain objects
			if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
				result[key] = deepMerge(targetValue, sourceValue);
			} else {
				// Otherwise replace with source value
				result[key] = sourceValue;
			}
		}
	}
	
	return result;
}

/**
 * Check if a value is a plain object (not an array, Date, etc.)
 */
function isPlainObject(value: any): boolean {
	if (value == null || typeof value !== 'object') return false;
	if (Array.isArray(value)) return false;
	
	// Check for common non-plain object types
	const constructor = value.constructor;
	if (constructor && constructor !== Object) {
		// Allow objects with no constructor or Object constructor
		const constructorName = constructor.name;
		// Exclude known non-plain types
		if (constructorName !== 'Object') return false;
	}
	
	return true;
}
