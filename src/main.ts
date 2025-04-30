import { Notice, Plugin, sanitizeHTMLToDom, type FrontMatterCache, type TFile } from "obsidian";
import "uniformize";
import { resources, translationLanguage } from "./i18n";
import i18next from "i18next";
import { type DataviewPropertiesSettings, DEFAULT_SETTINGS } from "./interfaces";
import { getInlineFields } from "./dataview";
import { DataviewPropertiesSettingTab } from "./settings";
import { isPluginEnabled } from "@enveloppe/obsidian-dataview";
import { Utils } from "./utils";

export default class DataviewProperties extends Plugin {
	settings!: DataviewPropertiesSettings;
	// Ajouter ces propriétés privées pour le cache
	private ignoredKeys: string[] = [];
	private ignoredRegex: RegExp[] = [];

	private utils!: Utils;

	async onload() {
		console.log(`[${this.manifest.name}] Loaded`);
		await this.loadSettings();
		this.utils = new Utils(this);
		//load i18next
		await i18next.init({
			lng: translationLanguage,
			fallbackLng: "en",
			resources,
			returnNull: false,
			returnEmptyString: false,
		});
		//wait for the app to be ready before displaying an error (if dataview is not enabled)
		this.app.workspace.onLayoutReady(() => {
			//load settings tab
			if (!this.app.plugins.plugins.dataview || !isPluginEnabled(this.app) || !this.app.plugins.plugins.dataview._loaded) {
				new Notice(sanitizeHTMLToDom(`<span class="obsidian-dataview-properties notice-error">${i18next.t("dataviewEnabled")}</span>`), 5000);
			}
		});
		this.addSettingTab(new DataviewPropertiesSettingTab(this.app, this));

		//add a command to open copy **all** inlines dataview (if found) from the current opened file
		this.addCommand({
			id: "dataview-to-frontmatter",
			name: i18next.t("addToFrontmatter"),
			//@ts-ignore
			checkCallback: async (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					if (!checking) {
						await this.resolveDataview(activeFile);
					}
					return true;
				}
				return false;
			},
		});

		this.registerEvent(
			//@ts-ignore
			this.app.metadataCache.on("dataview:metadata-change", (_eventName: string, file: TFile) => {
				console.log("[DataviewProperties] Metadata change detected:", file.path);
				this.resolveDataview(file);
			})
		);
	}



	private async shouldBeUpdated(fields: Record<string, any>, file: TFile, frontmatter?: FrontMatterCache) {
		console.log("[DataviewProperties] Checking if update is needed for", file.path);
		if (!fields || Object.keys(fields).length === 0) {
			console.log(`[DataviewProperties] No inline fields for ${file.path}, no update needed`);
			return false;
		}
		if (!frontmatter) {
			console.log(`[DataviewProperties] No frontmatter but inline fields found for ${file.path}, update needed`);
			return true;
		}

		const needsUpdate = Object.entries(fields).some(([key, inlineValue]) => {
			if (this.isIgnored(key)) return false;
			const frontmatterKey = Object.keys(frontmatter).find(fmKey =>
				!this.isIgnored(fmKey) && this.utils.keysMatch(fmKey, key)
			);
			if (!frontmatterKey || inlineValue == null) {
				if (inlineValue != null) {
					console.debug(`[DataviewProperties] Key ${key} not found in frontmatter, update needed`);
					return true;
				}
				return false;
			}
			const frontmatterValue = frontmatter[frontmatterKey];
			const areEqual = this.utils.valuesEqual(inlineValue, frontmatterValue);

			if (!areEqual) {
				console.log(`[DataviewProperties] Values differ for ${key}: inline=${inlineValue}, frontmatter=${frontmatterValue}`);
				return true;
			}

			return false;
		}
		);

		console.log("[DataviewProperties] Needs update:", needsUpdate, "for", file.path);
		return needsUpdate;
	}

	private async resolveDataview(activeFile: TFile) {
		const frontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
		const inline = await getInlineFields(activeFile.path, this, frontmatter);
		if (await this.shouldBeUpdated(inline, activeFile, frontmatter)) {
			console.log(`[DataviewProperties] Updating frontmatter for ${activeFile.path}`);
			await this.addToFrontmatter(activeFile, inline);
		}
	}
	private removeDuplicateFlag(input: string): string {
		return input.replace(/(.)\1+/g, '$1');
	}

	recognizeRegex(key: string) {
		const regRecognition = new RegExp(/\/(?<regex>.*)\/(?<flag>[gmiyuvsd]*)/);
		const match = key.match(regRecognition);
		if (match) {
			const { regex, flag } = match.groups!;
			//prevent flags to be multiple, aka only one of each
			const correctedFlag = this.removeDuplicateFlag(flag);
			return new RegExp(regex, correctedFlag);
		}
		return null;
	}
	private prepareIgnoredFields() {
		this.ignoredKeys = [];
		this.ignoredRegex = [];

		const ignoredFields = this.settings.ignoreFields;
		if (ignoredFields.length === 0) return;

		for (let key of ignoredFields) {
			key = this.utils.processString(key);
			const regex = this.recognizeRegex(key);
			if (regex) this.ignoredRegex.push(regex);
			else this.ignoredKeys.push(key);

		}
	}

	private isIgnored(key: string) {
		if (this.ignoredKeys.length === 0 && this.ignoredRegex.length === 0) return false;

		const processedKey = this.utils.processString(key);
		if (this.ignoredKeys.includes(processedKey))
			return true;
		for (const regex of this.ignoredRegex) {
			regex.lastIndex = 0; // Reset the lastIndex property to ensure a fresh match
			const result = regex.test(processedKey);
			if (result)
				return true;
		}
		return false;
	}

	async addToFrontmatter(file: TFile, inlineFields: Record<string, any>) {
		if (!this.app.plugins.plugins.dataview || !isPluginEnabled(this.app) || !this.app.plugins.plugins.dataview._loaded) return;
		if (inlineFields === undefined || Object.keys(inlineFields).length === 0) return;
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			for (const [key, value] of Object.entries(inlineFields)) {
				const isIgnored = this.isIgnored(key);
				if (!isIgnored && value !== undefined) {
					console.info("[DataviewProperties] Adding to frontmatter:", key, value);
					frontmatter[key] = value;
				} else console.info("[DataviewProperties] Ignoring key:", key, value);
			}
		});
	}

	onunload() {
		console.log(`[${this.manifest.name}] Unloaded`);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.prepareIgnoredFields(); // Préparer les données après le chargement des paramètres
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.prepareIgnoredFields(); // Préparer les données après la sauvegarde des paramètres
	}
}
