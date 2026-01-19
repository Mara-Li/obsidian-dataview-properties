import Utils from "./text_utils";

export { Utils };
export { convertToNumber, isNumber } from "./number";

export type NestedRecord<T> = {
	[key: string]: T | NestedRecord<T>;
};

export function unflatten<T = unknown>(
	input: Record<string, T>,
	separator = "."
): NestedRecord<T> {
	const result: NestedRecord<T> = {};

	for (const key in input) {
		const parts = key.split(separator);
		let current: NestedRecord<T> = result;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (i === parts.length - 1) {
				current[part] = input[key];
			} else {
				if (!(part in current) || typeof current[part] !== "object")
					current[part] = {} as NestedRecord<T>;

				current = current[part] as NestedRecord<T>;
			}
		}
	}

	return result;
}
