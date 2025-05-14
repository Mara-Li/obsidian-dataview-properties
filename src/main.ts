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
	type PreparedFields,
	UtilsConfig,
} from "./interfaces";
import { DataviewPropertiesSettingTab } from "./settings";
import { Utils } from "./utils";
import {
	isRecognized,
	prepareFields,
	shouldBeUpdated as checkShouldBeUpdated,
} from "./fields";
import { cleanList } from "./fields/cleanup";

export default class DataviewProperties extends Plugin {
	settings!: DataviewPropertiesSettings;
	private ignoredFields: PreparedFields = {
		keys: new Set<string>(),
		regex: [],
	};
	listFields: PreparedFields = {
		keys: new Set<string>(),
		regex: [],
	};
	private processingFiles: Set<string> = new Set();
	private debounced!: (file: TFile) => void;
	prefix: string = "obsidian-dataview-properties";
	private previousDataviewFields: Map<string, Set<string>> = new Map();
	utils!: Utils;

	private updateDebouced(): void {
		console.debug("[Dataview Properties] Debounce updated to", this.settings.interval);
		if (this.settings.interval <= 0) {
			console.debug("[Dataview Properties] Debounce disabled");
			this.debounced = () => {
				return;
			};
		} else
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

		this.app.workspace.onLayoutReady(async () => {
			this.checkDependencies();
			await this.createIndex();
		});

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
				async (eventName: string, file: TFile) => {
					if (eventName === "delete") {
						//delete from the previousDataviewFields instead
						this.previousDataviewFields.delete(file.path);
						console.debug(`${this.prefix} File deleted from previous keys:`, file.path);
					} else this.debounced(file);
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

	private isIgnored(key: string): boolean {
		return isRecognized(key, this.ignoredFields, this.utils);
	}

	/**
	 * Determines if frontmatter needs updating based on inline fields
	 */
	private shouldBeUpdated(
		fields: Record<string, any>,
		frontmatter?: FrontMatterCache
	): boolean {
		this.utils.useConfig(UtilsConfig.Ignore);
		return checkShouldBeUpdated(
			fields,
			frontmatter,
			(key) => this.isIgnored(key),
			(key1, key2) => this.utils.keysMatch(key1, key2),
			(val1, val2) => this.utils.valuesEqual(val1, val2)
		);
	}

	private async createIndex(): Promise<void> {
		if (!this.isDataviewEnabled()) return;
		const markdownFiles = this.app.vault.getMarkdownFiles();
		console.debug(`${this.prefix} Indexing ${markdownFiles.length} files...`);
		const batchSize = 5;
		//each every 5 files, we sleep 50ms
		for (let i = 0; i < markdownFiles.length; i += batchSize) {
			const batch = markdownFiles.slice(i, i + batchSize);
			await Promise.all(
				batch.map(async (file) => {
					if (this.processingFiles.has(file.path)) return;
					const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
					if (frontmatter) {
						const inline = await getInlineFields(file.path, this, frontmatter);
						if (inline && Object.keys(inline).length > 0)
							this.previousDataviewFields.set(file.path, new Set(Object.keys(inline)));
					}
				})
			);
			if (i + batchSize < markdownFiles.length) {
				// biome-ignore lint/correctness/noUndeclaredVariables: sleep is in obsidian global env
				await sleep(50);
			}
		}
		console.debug(`${this.prefix} ${markdownFiles.length} files indexed.`);
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
			const previousKeys = this.previousDataviewFields.get(filePath);
			const inline = await getInlineFields(filePath, this, frontmatter, previousKeys);

			const shouldCheckRemoved = previousKeys && previousKeys.size > 0;
			const removedKey = new Set<string>();
			if (shouldCheckRemoved) {
				const currentKeys = new Set(Object.keys(inline || {}));
				previousKeys.forEach((key) => {
					if (!currentKeys.has(key)) removedKey.add(key);
				});
			}
			const cleanedInline = cleanList(
				this.utils,
				inline,
				this.settings.cleanUpText.fields,
				this.ignoredFields,
				removedKey
			);
			const hasNewFields = this.shouldBeUpdated(inline, frontmatter);

			if (inline && Object.keys(inline).length > 0)
				this.previousDataviewFields.set(filePath, new Set(Object.keys(inline)));

			if (shouldCheckRemoved || hasNewFields)
				await this.updateFrontmatter(activeFile, cleanedInline, removedKey);
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
	 * Add inline fields to frontmatter
	 */
	async updateFrontmatter(
		file: TFile,
		inlineFields: Record<string, any>,
		removedKey?: Set<string>
	): Promise<void> {
		if (!this.isDataviewEnabled()) return;
		//early return if everything is empty
		if (
			Object.keys(inlineFields).length === 0 &&
			(!removedKey || removedKey.size === 0)
		) {
			console.debug(`${this.prefix} No inline fields to update for ${file.path}`);
			return;
		}
		console.debug(`${this.prefix} Updating frontmatter for ${file.path}`);
		console.debug(`${this.prefix} Inline fields:`, inlineFields);
		console.debug(`${this.prefix} Removed keys:`, removedKey);

		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			if (removedKey && removedKey.size > 0) {
				console.debug(`${this.prefix} Keys that must be removed :`, removedKey);
				this.utils.useConfig(UtilsConfig.Delete);
				for (const key of removedKey) {
					if (this.isIgnored(key)) continue; //more efficient to check if the key is ignored as we don't need to process it
					const frontmatterKey = Object.keys(frontmatter).find((fmKey) =>
						this.utils.keysMatch(fmKey, `${this.settings.prefix}${key}`)
					);
					console.error(frontmatterKey);
					if (frontmatterKey) delete frontmatter[frontmatterKey];
				}
			}
			this.utils.useConfig(UtilsConfig.Cleanup);
			for (const [key, value] of Object.entries(inlineFields)) {
				if (this.isIgnored(key) || value == undefined) continue;
				frontmatter[`${this.settings.prefix}${key}`] = value;
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
		this.utils.setConfig(UtilsConfig.Lists, this.settings.listFields);
	}

	private prepareIgnoredFields(): void {
		this.utils.useConfig(UtilsConfig.Ignore);
		const result = prepareFields(this.settings.ignoreFields.fields, this.utils);
		this.ignoredFields.keys = result.keys;
		this.ignoredFields.regex = result.regex;
	}

	private prepareListFields(): void {
		this.utils.useConfig(UtilsConfig.Lists);
		const result = prepareFields(this.settings.listFields.fields, this.utils);
		this.listFields.keys = result.keys;
		this.listFields.regex = result.regex;
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.loadUtils();
		this.prepareIgnoredFields();
		this.prepareListFields();
		this.updateDebouced();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.loadUtils();
		this.prepareIgnoredFields();
		this.prepareListFields();
		this.updateDebouced();
	}
}
