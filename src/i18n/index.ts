import { moment } from "obsidian";

import en from "./locales/en.json";
import fr from "./locales/fr.json";

export const resources = {
	fr: { translation: fr },
	en: { translation: en },
};

const localeUsed: string = window.localStorage.language || moment.locale();
export const translationLanguage = Object.keys(resources).find(
	(i) => i.toLocaleLowerCase() == localeUsed.toLowerCase()
)
	? localeUsed.toLowerCase()
	: "en";
