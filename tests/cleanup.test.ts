import { describe, expect, test } from "bun:test";
import { cleanUpValue } from "../src/fields";
import Utils from "../src/utils/Utility";
import "uniformize";

describe("Tests de la fonction cleanUpValue", () => {
	// Utiliser une instance réelle de Utils plutôt qu'un mock
	const utils = new Utils({
		ignoreAccents: true,
		lowerCase: true
	});

	test("devrait retourner la valeur originale si aucun champ n'est à nettoyer", () => {
		const result = cleanUpValue(
			"valeur de test",
			[],
			(field) => utils.recognizeRegex(field),
			{ lowerCase: false, ignoreAccents: false }
		);

		expect(result).toBe("valeur de test");
	});

	test("devrait nettoyer les occurrences exactes", () => {
		const result = cleanUpValue(
			"voici une valeur test",
			["valeur", "une"],
			(field) => utils.recognizeRegex(field),
			{ lowerCase: false, ignoreAccents: false }
		);

		expect(result).toBe("voici test");
	});

	test("devrait prendre en compte l'option lowerCase", () => {
		const result = cleanUpValue(
			"Voici Une VALEUR",
			["une", "valeur"],
			(field) => utils.recognizeRegex(field),
			{ lowerCase: true, ignoreAccents: false }
		);

		expect(result).toBe("Voici");
	});

	test("devrait prendre en compte l'option ignoreAccents", () => {
		const result = cleanUpValue(
			"Voici une épreuve",
			["epreuve"],
			(field) => utils.recognizeRegex(field),
			{ lowerCase: false, ignoreAccents: true }
		);

		expect(result).toBe("Voici une");
	});

	test("devrait appliquer les expressions régulières", () => {
		const result = cleanUpValue(
			"test123test",
			["/test/gi", "/\\d+/g"],
			(field) => utils.recognizeRegex(field),
			{ lowerCase: false, ignoreAccents: false }
		);

		expect(result).toBe(null);
	});

	test("devrait retourner null pour une valeur vide après nettoyage", () => {
		const result = cleanUpValue(
			"test",
			["test"],
			(field) => utils.recognizeRegex(field),
			{ lowerCase: false, ignoreAccents: false }
		);

		expect(result).toBe(null);
	});
});