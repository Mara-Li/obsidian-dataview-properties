import { describe, expect, test } from "bun:test";
import { Utils } from "../../src/utils";
import { isRecognized, prepareFields } from "../../src/fields";
import "uniformize";

describe("IgnoredField test", () => {
	const utils = new Utils({
		ignoreAccents: true,
		lowerCase: true,
	});

	test("prepareIgnoredFields should handle ignored fields correctly", () => {
		// Test avec champs simples et regex
		const { keys: ignoredKeys, regex: ignoredRegex } = prepareFields(
			["test", "autre", "/regex.*/i"],
			utils
		);

		expect(ignoredKeys.size).toBe(2);
		expect(ignoredKeys.has("test")).toBe(true);
		expect(ignoredKeys.has("autre")).toBe(true);
		expect(ignoredRegex.length).toBe(1);

		// Test champ vide
		const emptyResult = prepareFields([], utils);
		expect(emptyResult.keys.size).toBe(0);
		expect(emptyResult.regex.length).toBe(0);
	});

	test("isIgnored should detect ignored fields correctly", () => {
		const { keys: ignoredKeys, regex: ignoredRegex } = prepareFields(
			["test", "éTé", "/^prefix.*/i"],
			utils
		);

		// Test sensibilité à la casse
		expect(isRecognized("TEST", ignoredKeys, ignoredRegex, utils)).toBe(true);
		expect(isRecognized("test", ignoredKeys, ignoredRegex, utils)).toBe(true);

		// Test sensibilité aux accents
		expect(isRecognized("ete", ignoredKeys, ignoredRegex, utils)).toBe(true);
		expect(isRecognized("été", ignoredKeys, ignoredRegex, utils)).toBe(true);

		// Test avec regex
		expect(isRecognized("prefixSomething", ignoredKeys, ignoredRegex, utils)).toBe(true);
		expect(isRecognized("PREFIX123", ignoredKeys, ignoredRegex, utils)).toBe(true);
		expect(isRecognized("notprefix", ignoredKeys, ignoredRegex, utils)).toBe(false);

		// Test champ non ignoré
		expect(isRecognized("valid", ignoredKeys, ignoredRegex, utils)).toBe(false);

		// Test avec ignoredKeys et ignoredRegex vides
		expect(isRecognized("anything", new Set(), [], utils)).toBe(false);
	});
});
