import { describe, expect, test } from "bun:test";
import { cleanUpValue } from "../src/fields";
import Utils from "../src/utils/Utility";
import "uniformize";

describe("cleanUpValue tests", () => {
	// Utiliser une instance réelle de Utils plutôt qu'un mock
	const utils = new Utils({
		ignoreAccents: true,
		lowerCase: true,
	});

	test("should return original value if no fields to clean", () => {
		const result = cleanUpValue(
			"valeur de test",
			[],
			(field) => utils.recognizeRegex(field),
			{ lowerCase: false, ignoreAccents: false }
		);

		expect(result).toBe("valeur de test");
	});

	test("should clean up exact occurrences", () => {
		const result = cleanUpValue(
			"voici une valeur test",
			["valeur", "une"],
			(field) => utils.recognizeRegex(field),
			{ lowerCase: false, ignoreAccents: false }
		);

		expect(result).toBe("voici test");
	});

	test("should consider the lowercase option", () => {
		const result = cleanUpValue(
			"Voici Une VALEUR",
			["une", "valeur"],
			(field) => utils.recognizeRegex(field),
			{ lowerCase: true, ignoreAccents: false }
		);

		expect(result).toBe("Voici");
	});

	test("should consider the ignoreAccents option", () => {
		const result = cleanUpValue(
			"Voici une épreuve",
			["epreuve"],
			(field) => utils.recognizeRegex(field),
			{ lowerCase: false, ignoreAccents: true }
		);

		expect(result).toBe("Voici une");
	});

	test("should apply regex", () => {
		const result = cleanUpValue(
			"test123test",
			["/test/gi", "/\\d+/g"],
			(field) => utils.recognizeRegex(field),
			{ lowerCase: false, ignoreAccents: false }
		);

		expect(result).toBe(null);
	});

	test("should return null for an empty value after cleanup", () => {
		const result = cleanUpValue(
			"test",
			["test"],
			(field) => utils.recognizeRegex(field),
			{ lowerCase: false, ignoreAccents: false }
		);

		expect(result).toBe(null);
	});
});
