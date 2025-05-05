export function cleanUpValue(
	value: string,
	cleanupFields: string[],
	recognizeRegexFn: (field: string) => RegExp | null,
	options: { lowerCase: boolean; ignoreAccents: boolean }
): string | null {
	if (!cleanupFields.length) return value;

	let result = value;
	const flags = options.lowerCase ? "i" : "";

	for (const field of cleanupFields) {
		const regex = recognizeRegexFn(field);
		if (regex) {
			result = result.replace(regex, "");
		} else {
			let fieldPattern = field;
			if (options.ignoreAccents) fieldPattern = fieldPattern.removeAccents();
			fieldPattern = fieldPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const fieldRegex = new RegExp(fieldPattern, flags);
			result = result.replace(fieldRegex, "");
		}
	}

	result = result.trim();
	return result.length ? result : null;
}
