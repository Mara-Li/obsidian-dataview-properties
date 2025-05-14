export function shouldBeUpdated(
	fields: Record<string, any>,
	frontmatter: Record<string, any> | undefined,
	isIgnoredFn: (key: string) => boolean,
	keysMatchFn: (key1: string, key2: string) => boolean,
	valuesEqualFn: (val1: any, val2: any) => boolean
): boolean {
	if (!fields || Object.keys(fields).length === 0) return false;

	if (!frontmatter) return true;

	return Object.entries(fields).some(([key, inlineValue]) => {
		if (isIgnoredFn(key)) return false;

		const frontmatterKey = Object.keys(frontmatter).find(
			(fmKey) => !isIgnoredFn(fmKey) && keysMatchFn(fmKey, key)
		);
		if (!frontmatterKey) return inlineValue != null;
		if (inlineValue == null) return true;
		return !valuesEqualFn(inlineValue, frontmatter[frontmatterKey]);
	});
}
