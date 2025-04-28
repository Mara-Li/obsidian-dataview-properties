import { Plugin, type TFile } from "obsidian";
import { resources, translationLanguage } from "./i18n";
import i18next from "i18next";
import { type DataviewPropertiesSettings, DEFAULT_SETTINGS } from "./interfaces";
import { getInlineFields } from "./dataview";
import { DataviewPropertiesSettingTab } from "./settings";

export default class DataviewProperties extends Plugin {
	settings!: DataviewPropertiesSettings;

	async onload() {
		console.log(`[${this.manifest.name}] Loaded`);
		await this.loadSettings();
		//load i18next
		await i18next.init({
			lng: translationLanguage,
			fallbackLng: "en",
			resources,
			returnNull: false,
			returnEmptyString: false,
		});

		//load settings tab
		this.addSettingTab(new DataviewPropertiesSettingTab(this.app, this));

		//add a command to open copy **all** inlines dataview (if found) from the current opened file
		this.addCommand({
			id: "copy-all-inlines-dataview",
			name: "Copy all inlines dataview",
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

		this.registerInterval(
			window.setInterval(() => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					this.resolveDataview(activeFile);
				}
			}, this.settings.frequency)
		);
	}

	async resolveDataview(activeFile: TFile) {
		const frontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
		const inline = await getInlineFields(activeFile.path, this, frontmatter);
		await this.addToFrontmatter(activeFile, inline);
	}

	async addToFrontmatter(file: TFile, inlineFields: Record<string, any>) {
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			for (const [key, value] of Object.entries(inlineFields)) {
				//override the value if it exists
				frontmatter[key] = value;
			}
		});
	}

	onunload() {
		console.log(`[${this.manifest.name}] Unloaded`);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
