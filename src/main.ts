import {
	debounce,
	type FrontMatterCache,
	Notice,
	Plugin,
	sanitizeHTMLToDom,
	type TFile,
} from "obsidian";
import "uniformize";
import { isPluginEnabled } from "@enveloppe/obsidian-dataview";
import i18next from "i18next";
import { getInlineFields } from "./dataview";
import { resources, translationLanguage } from "./i18n";
import {
	type DataviewPropertiesSettings,
	DEFAULT_SETTINGS,
	UtilsConfig,
} from "./interfaces";
import { DataviewPropertiesSettingTab } from "./settings";
import { Utils } from "./utils";

export default class DataviewProperties extends Plugin {
	settings!: DataviewPropertiesSettings;
	private ignoredKeys: Set<string> = new Set();
	private ignoredRegex: RegExp[] = [];
	private processingFiles: Set<string> = new Set();
	private debounced!: (file: TFile) => void;
	prefix: string = "obsidian-dataview-properties";
	private previousDataviewFields: Map<string, Set<string>> = new Map();
	private utils!: Utils;

	private updateDebouced(): void {
		console.debug("[Dataview Properties] Debounce updated to", this.settings.interval);
		this.debounced = debounce(
			async (file: TFile) => {
				await this.resolveDataview(file);
			},
			this.settings.interval,
			true
		);
	}

	async onload() {
		this.prefix = `[${this.manifest.name}]`;
		console.log(`${this.prefix} Loaded`);
		await this.loadSettings();

		await i18next.init({
			lng: translationLanguage,
			fallbackLng: "en",
			resources,
			returnNull: false,
			returnEmptyString: false,
		});

		this.app.workspace.onLayoutReady(() => this.checkDependencies());

		this.addSettingTab(new DataviewPropertiesSettingTab(this.app, this));

		this.addCommand({
			id: "dataview-to-frontmatter",
			name: i18next.t("addToFrontmatter"),
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) return false;

				if (!checking) {
					this.resolveDataview(activeFile).catch((err) =>
						console.error(`[${this.manifest.name}] Error processing file:`, err)
					);
				}
				return true;
			},
		});

		this.registerEvent(
			this.app.metadataCache.on(
				//@ts-ignore
				"dataview:metadata-change",
				(_eventName: string, file: TFile) => {
					this.debounced(file);
				}
			)
		);
	}

	/**
	 * Check if Dataview plugin is enabled and notify user if not
	 */
	private checkDependencies(): void {
		if (!this.isDataviewEnabled()) {
			new Notice(
				sanitizeHTMLToDom(
					`<span class="obsidian-dataview-properties notice-error">${i18next.t("dataviewEnabled")}</span>`
				),
				5000
			);
		}
	}

	/**
	 * Determines if frontmatter needs updating based on inline fields
	 */
	private shouldBeUpdated(
		fields: Record<string, any>,
		frontmatter?: FrontMatterCache
	): boolean {
		if (!fields || Object.keys(fields).length === 0) return false;

		if (!frontmatter) return true;

		this.utils.useConfig(UtilsConfig.Ignore);
		return Object.entries(fields).some(([key, inlineValue]) => {
			if (this.isIgnored(key)) return false;

			const frontmatterKey = Object.keys(frontmatter).find(
				(fmKey) => !this.isIgnored(fmKey) && this.utils.keysMatch(fmKey, key)
			);
			if (!frontmatterKey) return inlineValue != null;

			return !this.utils.valuesEqual(inlineValue, frontmatter[frontmatterKey]);
		});
	}

	/**
	 * Process file to update frontmatter with inline Dataview fields
	 */
	private async resolveDataview(activeFile: TFile): Promise<void> {
		if (!this.isDataviewEnabled()) return;
		const filePath = activeFile.path;
		if (this.processingFiles.has(filePath)) return;

		try {
			this.processingFiles.add(filePath);
			const frontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
			const inline = await getInlineFields(filePath, this, frontmatter);
			const previousKeys = this.previousDataviewFields.get(filePath);
			const shouldCheckRemoved = previousKeys && previousKeys.size > 0;
			const removedKey = new Set<string>();
			if (shouldCheckRemoved) {
				const currentKeys = new Set(Object.keys(inline || {}));
				previousKeys.forEach((key) => {
					if (!currentKeys.has(key)) removedKey.add(key);
				});
			}
			console.debug(`${this.prefix} Previous keys:`, previousKeys);
			console.debug(`${this.prefix} Actual fields:`, inline);

			const hasNewFields = this.shouldBeUpdated(inline, frontmatter);

			if (inline && Object.keys(inline).length > 0)
				this.previousDataviewFields.set(filePath, new Set(Object.keys(inline)));

			if ((shouldCheckRemoved || hasNewFields) && frontmatter)
				await this.updateFrontmatter(activeFile, inline || {}, removedKey);
		} finally {
			this.processingFiles.delete(filePath);
		}
	}

	/**
	 * Check if Dataview plugin is enabled
	 */
	isDataviewEnabled(): boolean {
		return (
			!!this.app.plugins.plugins.dataview &&
			isPluginEnabled(this.app) &&
			this.app.plugins.plugins.dataview._loaded
		);
	}

	/**
	 * Prepare ignored fields from settings
	 */
	private prepareIgnoredFields(): void {
		this.ignoredKeys.clear();
		this.ignoredRegex = [];
		this.utils.useConfig(UtilsConfig.Ignore);

		const ignoredFields = this.settings.ignoreFields.fields;
		if (!ignoredFields.length) return;

		for (const key of ignoredFields) {
			const processedKey = this.utils.processString(key);
			const regex = this.utils.recognizeRegex(key);
			if (regex) this.ignoredRegex.push(regex);
			else this.ignoredKeys.add(processedKey);
		}
	}

	/**
	 * Check if a key should be ignored
	 */
	private isIgnored(key: string): boolean {
		if (!this.ignoredKeys.size && !this.ignoredRegex.length) return false;
		this.utils.useConfig(UtilsConfig.Ignore);

		const processedKey = this.utils.processString(key);

		if (this.ignoredKeys.has(processedKey)) return true;

		return this.ignoredRegex.some((regex) => {
			regex.lastIndex = 0;
			return regex.test(processedKey);
		});
	}

	/**
	 * Add inline fields to frontmatter
	 */
	async updateFrontmatter(
		file: TFile,
		inlineFields: Record<string, any>,
		removedKey?: Set<string>
	): Promise<void> {
		if (!this.isDataviewEnabled()) return;
		if (!inlineFields || Object.keys(inlineFields).length === 0) return;

		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			if (removedKey && removedKey.size > 0) {
				console.debug(`${this.prefix} Keys that must be removed :`, removedKey);
				this.utils.useConfig(UtilsConfig.Delete);
				for (const key of removedKey) {
					if (this.isIgnored(key)) continue; //more efficient to check if the key is ignored as we don't need to process it
					const frontmatterKey = Object.keys(frontmatter).find((fmKey) =>
						this.utils.keysMatch(fmKey, key)
					);
					if (frontmatterKey) delete frontmatter[key];
				}
			}
			this.utils.useConfig(UtilsConfig.Cleanup);
			for (const [key, value] of Object.entries(inlineFields)) {
				if (this.isIgnored(key) || value === undefined) continue;

				const correctedValue =
					typeof value === "string"
						? this.utils.removeFromValue(value, this.settings.cleanUpText.fields)
						: value;
				if (correctedValue != null) frontmatter[key] = correctedValue;
			}
		});
	}

	onunload(): void {
		console.log(`${this.prefix} Unloaded`);
	}

	private loadUtils(): void {
		this.utils = new Utils(this.settings.cleanUpText);

		this.utils.setConfig(UtilsConfig.Cleanup, this.settings.cleanUpText);
		this.utils.setConfig(UtilsConfig.Ignore, this.settings.ignoreFields);
		this.utils.setConfig(UtilsConfig.Delete, this.settings.deleteFromFrontmatter);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.loadUtils();
		this.prepareIgnoredFields();
		this.updateDebouced();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.loadUtils();
		this.prepareIgnoredFields();
		this.updateDebouced();
	}
}
