import { describe, expect, test } from "bun:test";
import { shouldBeUpdated } from "../src/fields";
import Utils from "../src/utils/Utility";
import "uniformize";

describe("shouldBeUpdated tests", () => {
	const utils = new Utils({
		ignoreAccents: true,
		lowerCase: true,
	});
	const isIgnoredWithUtils = (key: string) => {
		return ["ignored", "skip"].includes(utils.processString(key));
	};

	test("should return false for empty value", () => {
		expect(
			shouldBeUpdated(
				{},
				{},
				isIgnoredWithUtils,
				(key1, key2) => utils.keysMatch(key1, key2),
				(val1, val2) => utils.valuesEqual(val1, val2)
			)
		).toBe(false);
	});

	test("should return true without frontmatter", () => {
		expect(
			shouldBeUpdated(
				{ test: "value" },
				undefined,
				isIgnoredWithUtils,
				(key1, key2) => utils.keysMatch(key1, key2),
				(val1, val2) => utils.valuesEqual(val1, val2)
			)
		).toBe(true);
	});

	test("should detect fields to add", () => {
		const fields = { newKey: "value" };
		const frontmatter = { existingKey: "value" };

		expect(
			shouldBeUpdated(
				fields,
				frontmatter,
				isIgnoredWithUtils,
				(key1, key2) => utils.keysMatch(key1, key2),
				(val1, val2) => utils.valuesEqual(val1, val2)
			)
		).toBe(true);
	});

	test("should ignore configured fields", () => {
		const fields = { ignored: "value" };
		const frontmatter = { existingKey: "value" };

		expect(
			shouldBeUpdated(
				fields,
				frontmatter,
				isIgnoredWithUtils,
				(key1, key2) => utils.keysMatch(key1, key2),
				(val1, val2) => utils.valuesEqual(val1, val2)
			)
		).toBe(false);
	});

	test("should detect modified values", () => {
		const fields = { existingKey: "new value" };
		const frontmatter = { existingKey: "old value" };

		expect(
			shouldBeUpdated(
				fields,
				frontmatter,
				isIgnoredWithUtils,
				(key1, key2) => utils.keysMatch(key1, key2),
				(val1, val2) => utils.valuesEqual(val1, val2)
			)
		).toBe(true);
	});

	test("should ignore cases where the values are identical", () => {
		const fields = { existingKey: "same" };
		const frontmatter = { existingKey: "same" };

		expect(
			shouldBeUpdated(
				fields,
				frontmatter,
				isIgnoredWithUtils,
				(key1, key2) => utils.keysMatch(key1, key2),
				(val1, val2) => utils.valuesEqual(val1, val2)
			)
		).toBe(false);
	});

	test("should works with insensitive keys", () => {
		const fields = { key: "value" };
		const frontmatter = { KEY: "value" };

		expect(
			shouldBeUpdated(
				fields,
				frontmatter,
				isIgnoredWithUtils,
				(key1, key2) => utils.keysMatch(key1, key2),
				(val1, val2) => utils.valuesEqual(val1, val2)
			)
		).toBe(false);
	});

	test("should works with accents", () => {
		const fields = { été: "value" };
		const frontmatter = { ete: "value" };

		expect(
			shouldBeUpdated(
				fields,
				frontmatter,
				isIgnoredWithUtils,
				(key1, key2) => utils.keysMatch(key1, key2),
				(val1, val2) => utils.valuesEqual(val1, val2)
			)
		).toBe(false);
	});
});
