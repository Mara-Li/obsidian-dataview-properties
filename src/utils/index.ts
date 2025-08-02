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
