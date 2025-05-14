import { describe, expect, test } from "bun:test";
import { isRecognized, prepareFields } from "../../src/fields";
import { Utils } from "../../src/utils";
import "uniformize";
import type {PreparedFields} from "../../src/interfaces";

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
		
		const preparedFields: PreparedFields = {
			keys: ignoredKeys,
			regex: ignoredRegex,
		}

		// Test sensibilité à la casse
		expect(isRecognized("TEST", preparedFields, utils)).toBe(true);
		expect(isRecognized("test", preparedFields, utils)).toBe(true);

		// Test sensibilité aux accents
		expect(isRecognized("ete", preparedFields, utils)).toBe(true);
		expect(isRecognized("été", preparedFields, utils)).toBe(true);

		// Test avec regex
		expect(isRecognized("prefixSomething", preparedFields, utils)).toBe(true);
		expect(isRecognized("PREFIX123", preparedFields, utils)).toBe(true);
		expect(isRecognized("notprefix", preparedFields, utils)).toBe(false);

		// Test champ non ignoré
		expect(isRecognized("valid", preparedFields, utils)).toBe(false);

		// Test avec ignoredKeys et ignoredRegex vides
		expect(isRecognized("anything", {
			keys: new Set(),
			regex: []
		}, utils)).toBe(false);
	});
});
