import { describe, expect, test } from "bun:test";
import { Utils } from "../src/utils";
import { isIgnored, prepareIgnoredFields } from "../src/fields";
import "uniformize"

describe("Tests des fonctions de champs ignorés", () => {
	const utils = new Utils({
		ignoreAccents: true,
		lowerCase: true
	});

	test("prepareIgnoredFields devrait traiter correctement les champs ignorés", () => {
		// Test avec champs simples et regex
		const { ignoredKeys, ignoredRegex } = prepareIgnoredFields(
			["test", "autre", "/regex.*/i"],
			utils
		);

		expect(ignoredKeys.size).toBe(2);
		expect(ignoredKeys.has("test")).toBe(true);
		expect(ignoredKeys.has("autre")).toBe(true);
		expect(ignoredRegex.length).toBe(1);

		// Test champ vide
		const emptyResult = prepareIgnoredFields([], utils);
		expect(emptyResult.ignoredKeys.size).toBe(0);
		expect(emptyResult.ignoredRegex.length).toBe(0);
	});

	test("isIgnored devrait détecter correctement les champs à ignorer", () => {
		const { ignoredKeys, ignoredRegex } = prepareIgnoredFields(
			["test", "éTé", "/^prefix.*/i"],
			utils
		);

		// Test sensibilité à la casse
		expect(isIgnored("TEST", ignoredKeys, ignoredRegex, utils)).toBe(true);
		expect(isIgnored("test", ignoredKeys, ignoredRegex, utils)).toBe(true);

		// Test sensibilité aux accents
		expect(isIgnored("ete", ignoredKeys, ignoredRegex, utils)).toBe(true);
		expect(isIgnored("été", ignoredKeys, ignoredRegex, utils)).toBe(true);

		// Test avec regex
		expect(isIgnored("prefixSomething", ignoredKeys, ignoredRegex, utils)).toBe(true);
		expect(isIgnored("PREFIX123", ignoredKeys, ignoredRegex, utils)).toBe(true);
		expect(isIgnored("notprefix", ignoredKeys, ignoredRegex, utils)).toBe(false);

		// Test champ non ignoré
		expect(isIgnored("valid", ignoredKeys, ignoredRegex, utils)).toBe(false);

		// Test avec ignoredKeys et ignoredRegex vides
		expect(isIgnored("anything", new Set(), [], utils)).toBe(false);
	});
});