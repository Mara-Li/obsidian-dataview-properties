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
import { type DataviewPropertiesSettings, DEFAULT_SETTINGS } from "./interfaces";
import { DataviewPropertiesSettingTab } from "./settings";
import { Utils } from "./utils";

export default class DataviewProperties extends Plugin {
	settings!: DataviewPropertiesSettings;
	private ignoredKeys: Set<string> = new Set();
	private ignoredRegex: RegExp[] = [];
	private ignoreUtils!: Utils;
	private cleanUtils!: Utils;
	private processingFiles: Set<string> = new Set();
	private debounced!: (file: TFile) => void;
	prefix: string = "obsidian-dataview-properties";

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

		// Initialize i18next once
		await i18next.init({
			lng: translationLanguage,
			fallbackLng: "en",
			resources,
			returnNull: false,
			returnEmptyString: false,
		});

		// Wait for layout to be ready before checking dependencies
		this.app.workspace.onLayoutReady(() => this.checkDependencies());

		// Add settings tab
		this.addSettingTab(new DataviewPropertiesSettingTab(this.app, this));

		// Register command
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
		if (
			!this.app.plugins.plugins.dataview ||
			!isPluginEnabled(this.app) ||
			!this.app.plugins.plugins.dataview._loaded
		) {
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
		// Early exit if no fields
		if (!fields || Object.keys(fields).length === 0) {
			return false;
		}

		// Update needed if no frontmatter exists
		if (!frontmatter) {
			return true;
		}

		// Check if any field needs updating
		return Object.entries(fields).some(([key, inlineValue]) => {
			// Skip ignored fields
			if (this.isIgnored(key)) return false;

			// Find matching key in frontmatter (case-insensitive, accent-insensitive)
			const frontmatterKey = Object.keys(frontmatter).find(
				(fmKey) => !this.isIgnored(fmKey) && this.ignoreUtils.keysMatch(fmKey, key)
			);

			// If key doesn't exist in frontmatter and value is not null, update needed
			if (!frontmatterKey) {
				return inlineValue != null;
			}

			// If values differ, update needed
			return !this.ignoreUtils.valuesEqual(inlineValue, frontmatter[frontmatterKey]);
		});
	}

	/**
	 * Process file to update frontmatter with inline Dataview fields
	 */
	private async resolveDataview(activeFile: TFile): Promise<void> {
		const filePath = activeFile.path;

		// Prevent concurrent processing of the same file
		if (this.processingFiles.has(filePath)) return;

		try {
			this.processingFiles.add(filePath);

			if (!this.isDataviewEnabled()) return;

			const frontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
			const inline = await getInlineFields(filePath, this, frontmatter);

			if (this.shouldBeUpdated(inline, frontmatter))
				await this.addToFrontmatter(activeFile, inline);
		} finally {
			this.processingFiles.delete(filePath);
		}
	}

	/**
	 * Check if Dataview plugin is enabled
	 */
	private isDataviewEnabled(): boolean {
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
		// Clear existing caches
		this.ignoredKeys.clear();
		this.ignoredRegex = [];

		const ignoredFields = this.settings.ignoreFields.fields;
		if (!ignoredFields.length) return;

		// Process each field
		for (const key of ignoredFields) {
			const processedKey = this.ignoreUtils.processString(key);
			const regex = this.ignoreUtils.recognizeRegex(key);

			if (regex) this.ignoredRegex.push(regex);
			else this.ignoredKeys.add(processedKey);
		}
	}

	/**
	 * Check if a key should be ignored
	 */
	private isIgnored(key: string): boolean {
		// Fast path if no ignored items
		if (!this.ignoredKeys.size && !this.ignoredRegex.length) return false;

		const processedKey = this.ignoreUtils.processString(key);

		if (this.ignoredKeys.has(processedKey)) return true;

		return this.ignoredRegex.some((regex) => {
			regex.lastIndex = 0; // Reset lastIndex for safety
			return regex.test(processedKey);
		});
	}

	/**
	 * Add inline fields to frontmatter
	 */
	async addToFrontmatter(file: TFile, inlineFields: Record<string, any>): Promise<void> {
		if (!this.isDataviewEnabled()) return;
		if (!inlineFields || Object.keys(inlineFields).length === 0) return;

		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			for (const [key, value] of Object.entries(inlineFields)) {
				if (this.isIgnored(key) || value === undefined) continue;

				// Process value with cleanup rules
				const correctedValue =
					typeof value === "string"
						? this.cleanUtils.removeFromValue(value, this.settings.cleanUpText.fields)
						: value;

				// Add to frontmatter if value is valid
				if (correctedValue != null) frontmatter[key] = correctedValue;
			}
		});
	}

	onunload(): void {
		console.log(`${this.prefix} Unloaded`);
	}

	/**
	 * Initialize utility classes with current settings
	 */
	private loadUtils(): void {
		this.cleanUtils = new Utils({
			ignoreAccents: this.settings.cleanUpText.ignoreAccents,
			lowerCase: this.settings.cleanUpText.lowerCase,
		});

		this.ignoreUtils = new Utils({
			ignoreAccents: this.settings.ignoreFields.ignoreAccents,
			lowerCase: this.settings.ignoreFields.lowerCase,
		});
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
