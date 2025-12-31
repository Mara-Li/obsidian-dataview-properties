import {
	debounce,
	type FrontMatterCache,
	Notice,
	Plugin,
	sanitizeHTMLToDom,
	TFile,
	TFolder,
} from "obsidian";
import "uniformize";
import { isPluginEnabled } from "@enveloppe/obsidian-dataview";
import i18next from "i18next";
import { getInlineFields } from "./dataview";
import {
	shouldBeUpdated as checkShouldBeUpdated,
	isRecognized,
	prepareFields,
} from "./fields";
import { cleanList } from "./fields/cleanup";
import { resources, translationLanguage } from "./i18n";
import {
	type DataviewPropertiesSettings,
	DEFAULT_SETTINGS,
	type PreparedFields,
	UtilsConfig,
} from "./interfaces";
import { DataviewPropertiesSettingTab } from "./settings";
import { Utils } from "./utils";
import { isExcluded } from "./utils/ignored_file";

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
		if (this.settings.interval <= 0) {
			this.debounced = () => {
				return;
			};
		} else
			this.debounced = debounce(
				async (file: TFile) => {
					if (this.isIgnoredFile(file)) return;
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
				if (!activeFile || this.isIgnoredFile(activeFile)) return false;

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
				//@ts-expect-error
				"dataview:metadata-change",
				async (eventName: string, file: TFile) => {
					if (eventName === "delete") {
						//delete from the previousDataviewFields instead
						this.previousDataviewFields.delete(file.path);
					} else this.debounced(file);
				}
			)
		);

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (
					file instanceof TFile &&
					!this.isIgnoredFile(file) &&
					this.settings.extraMenus
				) {
					menu.addItem((item) => {
						item
							.setTitle(i18next.t("addToFrontmatter"))
							.setIcon("checkmark")
							.onClick(async () => {
								await this.resolveDataview(file);
							});
					});
				} else if (file instanceof TFolder && this.settings.extraMenus) {
					const allFileInTheFolder = file.children.filter(
						(child) => child instanceof TFile && !this.isIgnoredFile(child)
					) as TFile[];
					if (allFileInTheFolder.length > 0 && this.settings.extraMenus) {
						menu.addItem((item) => {
							item
								.setTitle(i18next.t("addToFrontmatter"))
								.setIcon("checkmark")
								.onClick(async () => {
									await this.processMultipleFiles(allFileInTheFolder);
								});
						});
					}
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on("files-menu", (menu, files) => {
				const filesToProcess = files.filter(
					(file) => file instanceof TFile && !this.isIgnoredFile(file)
				);
				if (filesToProcess.length > 0 && this.settings.extraMenus) {
					menu.addItem((item) => {
						item
							.setTitle(i18next.t("addToFrontmatter"))
							.setIcon("checkmark")
							.onClick(async () => {
								await this.processMultipleFiles(filesToProcess as TFile[]);
							});
					});
				}
			})
		);
	}

	async processMultipleFiles(files: TFile[]): Promise<void> {
		if (!this.isDataviewEnabled()) return;
		await Promise.all(files.map((file) => this.resolveDataview(file)));
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
		// biome-ignore lint/suspicious/noExplicitAny: Need this for generic fields
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
						console.debug("[Dataview Properties] Inline fields for", file.path, inline);
						//only store if there is at least one field
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
	}

	private isIgnoredFile(file: TFile): boolean {
		if (!this.isDataviewEnabled()) return true;
		const filePath = file.path;
		return (
			this.processingFiles.has(filePath) ||
			isExcluded(this.settings.ignore, file, this.app)
		);
	}

	/**
	 * Process file to update frontmatter with inline Dataview fields
	 */
	private async resolveDataview(activeFile: TFile): Promise<void> {
		const filePath = activeFile.path;
		if (this.isIgnoredFile(activeFile)) return;

		try {
			this.processingFiles.add(filePath);
			const frontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
			const previousKeys = this.previousDataviewFields.get(filePath);
			const inline = await getInlineFields(filePath, this, frontmatter);

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
		// biome-ignore lint/suspicious/noExplicitAny: this is the type returned by obsidian for the frontmatter so we need to use it with any
		inlineFields: Record<string, any>,
		removedKey?: Set<string>
	): Promise<void> {
		if (!this.isDataviewEnabled()) return;
		//early return if everything is empty
		if (
			Object.keys(inlineFields).length === 0 &&
			(!removedKey || removedKey.size === 0)
		) {
			return;
		}

		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			if (removedKey && removedKey.size > 0) {
				this.utils.useConfig(UtilsConfig.Delete);
				for (const key of removedKey) {
					if (this.isIgnored(key)) continue; //more efficient to check if the key is ignored as we don't need to process it
					const frontmatterKey = Object.keys(frontmatter).find((fmKey) =>
						this.utils.keysMatch(fmKey, `${this.settings.prefix}${key}`)
					);
					if (frontmatterKey) delete frontmatter[frontmatterKey];
				}
			}
			this.utils.useConfig(UtilsConfig.Cleanup);
			for (const [key, value] of Object.entries(inlineFields)) {
				if (this.isIgnored(key) || value == null) continue;
				frontmatter[`${this.settings.prefix}${key}`] = value;
			}
		});

		// Replace inline fields with DataView expressions
		await this.replaceInlineFieldsWithExpressions(file, inlineFields);
	}

	/**
	 * Replace inline DataView fields with expressions that reference frontmatter values
	 */
	private async replaceInlineFieldsWithExpressions(
		file: TFile,
		// biome-ignore lint/suspicious/noExplicitAny: this is the type returned by obsidian for the frontmatter so we need to use it with any
		inlineFields: Record<string, any>
	): Promise<void> {
		const content = await this.app.vault.read(file);
		let modifiedContent = content;
		let hasChanges = false;

		for (const key of Object.keys(inlineFields)) {
			if (this.isIgnored(key)) continue;

			// Create regex to match inline field: key:: value (with optional whitespace)
			// This matches both `key:: value` and `[key:: value]` formats
			const inlineFieldRegex = new RegExp(
				`(\\[)?${this.escapeRegex(key)}::\\s*[^\\n\\]]+?(\\])?(?=\\s|$|\\n)`,
				'gi'
			);

			// Replace with DataView expression
			const replacement = `${key} = \`= this.${this.settings.prefix}${key}\``;

			const newContent = modifiedContent.replace(inlineFieldRegex, (match: string) => {
				// Check if the match is already a DataView expression
				if (match.includes('`= this.')) {
					return match; // Already replaced, skip
				}
				hasChanges = true;
				return replacement;
			});

			modifiedContent = newContent;
		}

		// Only write back if we made changes
		if (hasChanges) {
			await this.app.vault.modify(file, modifiedContent);
		}
	}

	/**
	 * Escape special regex characters in string
	 */
	private escapeRegex(text: string): string {
		return text.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&");
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
