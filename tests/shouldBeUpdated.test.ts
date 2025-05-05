import { describe, expect, test } from "bun:test";
import { shouldBeUpdated } from "../src/fields";
import Utils from "../src/utils/Utility";
import { UtilsConfig } from "../src/interfaces";
import "uniformize";

describe("Tests de la fonction shouldBeUpdated", () => {
	// Utiliser une vraie instance de Utils
	const utils = new Utils({
		ignoreAccents: true,
		lowerCase: true
	});

	// Fonction d'ignorance utilisant l'instance Utils
	const isIgnoredWithUtils = (key: string) => {
		return ["ignored", "skip"].includes(utils.processString(key));
	};

	test("devrait retourner false pour des champs vides", () => {
		expect(shouldBeUpdated(
			{},
			{},
			isIgnoredWithUtils,
			(key1, key2) => utils.keysMatch(key1, key2),
			(val1, val2) => utils.valuesEqual(val1, val2)
		)).toBe(false);
	});

	test("devrait retourner true sans frontmatter", () => {
		expect(shouldBeUpdated(
			{ test: "value" },
			undefined,
			isIgnoredWithUtils,
			(key1, key2) => utils.keysMatch(key1, key2),
			(val1, val2) => utils.valuesEqual(val1, val2)
		)).toBe(true);
	});

	test("devrait détecter les champs à ajouter", () => {
		const fields = { newKey: "value" };
		const frontmatter = { existingKey: "value" };

		expect(shouldBeUpdated(
			fields,
			frontmatter,
			isIgnoredWithUtils,
			(key1, key2) => utils.keysMatch(key1, key2),
			(val1, val2) => utils.valuesEqual(val1, val2)
		)).toBe(true);
	});

	test("devrait ignorer les champs configurés", () => {
		const fields = { ignored: "value" };
		const frontmatter = { existingKey: "value" };

		expect(shouldBeUpdated(
			fields,
			frontmatter,
			isIgnoredWithUtils,
			(key1, key2) => utils.keysMatch(key1, key2),
			(val1, val2) => utils.valuesEqual(val1, val2)
		)).toBe(false);
	});

	test("devrait détecter les valeurs modifiées", () => {
		const fields = { existingKey: "new value" };
		const frontmatter = { existingKey: "old value" };

		expect(shouldBeUpdated(
			fields,
			frontmatter,
			isIgnoredWithUtils,
			(key1, key2) => utils.keysMatch(key1, key2),
			(val1, val2) => utils.valuesEqual(val1, val2)
		)).toBe(true);
	});

	test("devrait ignorer les cas où les valeurs sont identiques", () => {
		const fields = { existingKey: "same" };
		const frontmatter = { existingKey: "same" };

		expect(shouldBeUpdated(
			fields,
			frontmatter,
			isIgnoredWithUtils,
			(key1, key2) => utils.keysMatch(key1, key2),
			(val1, val2) => utils.valuesEqual(val1, val2)
		)).toBe(false);
	});

	test("devrait fonctionner avec des clés insensibles à la casse", () => {
		const fields = { key: "value" };
		const frontmatter = { KEY: "value" };

		expect(shouldBeUpdated(
			fields,
			frontmatter,
			isIgnoredWithUtils,
			(key1, key2) => utils.keysMatch(key1, key2),
			(val1, val2) => utils.valuesEqual(val1, val2)
		)).toBe(false);
	});

	test("devrait fonctionner avec des accents", () => {
		const fields = { été: "value" };
		const frontmatter = { ete: "value" };

		expect(shouldBeUpdated(
			fields,
			frontmatter,
			isIgnoredWithUtils,
			(key1, key2) => utils.keysMatch(key1, key2),
			(val1, val2) => utils.valuesEqual(val1, val2)
		)).toBe(false);
	});
});