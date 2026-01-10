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
import { deepMerge, Utils } from "./utils";
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
					const allFileInTheFolder = this.getAllFilesRecursively(file);
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

	/**
	 * Recursively collect all files from a folder and its subfolders
	 */
	private getAllFilesRecursively(folder: TFolder): TFile[] {
		const files: TFile[] = [];
		
		for (const child of folder.children) {
			if (child instanceof TFile) {
				if (!this.isIgnoredFile(child)) {
					files.push(child);
				}
			} else if (child instanceof TFolder) {
				// Recursively get files from subfolder
				files.push(...this.getAllFilesRecursively(child));
			}
		}
		
		return files;
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

			const shouldCheckRemoved = this.settings.deleteFromFrontmatter.enabled && previousKeys && previousKeys.size > 0;
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
				const prefixedKey = `${this.settings.prefix}${key}`;
				const normalizedValue = this.normalizeValueForFrontmatter(value);
				
				// Use deep merge for nested objects to preserve existing properties
				if (prefixedKey in frontmatter && 
					typeof frontmatter[prefixedKey] === 'object' && 
					!Array.isArray(frontmatter[prefixedKey]) &&
					typeof normalizedValue === 'object' && 
					!Array.isArray(normalizedValue) &&
					normalizedValue != null) {
					frontmatter[prefixedKey] = deepMerge(frontmatter[prefixedKey], normalizedValue);
				} else {
					frontmatter[prefixedKey] = normalizedValue;
				}
			}
		});

		// Replace inline fields with DataView expressions
		if(this.settings.replaceInlineFieldsWith.enabled) {
			await this.replaceInlineFieldsWithExpressions(file, inlineFields);
		}
	}

	/**
	 * Normalize a value for frontmatter serialization
	 * Converts DateTime objects to date-only strings to avoid timezone issues
	 */
	private normalizeValueForFrontmatter(value: any): any {
		if (value == null) return value;
		
		const constructorName = value.constructor?.name;
		
		// Handle Dataview DateTime objects
		if (constructorName === 'DateTime' || 
				(value.ts !== undefined && typeof value.ts === 'number')) {
			// Check if it's a date-only value (no time component)
			// Check time in the DateTime's own zone, not UTC
			// Luxon DateTime properties give time in the object's zone
			const isDateOnly = 
				value.hour === 0 && 
				value.minute === 0 && 
				value.second === 0 && 
				value.millisecond === 0;
			
			if (isDateOnly) {
				// Return as YYYY-MM-DD string
				return value.toFormat?.('yyyy-MM-dd') || 
							 new Date(value.ts).toISOString().split('T')[0];
			}
			
			// For DateTime with time component, return ISO string
			return value.toISO?.() || new Date(value.ts).toISOString();
		}
		
		// Return other values unchanged
		return value;
	}

	/**
	 * Interpolate template string with actual values
	 */
	private formatReplacement(key: string, value: any): string {
		const template = this.settings.replaceInlineFieldsWith.template;
		return template
			.replace(/\{\{key\}\}/g, key)
			.replace(/\{\{prefix\}\}/g, this.settings.prefix)
			.replace(/\{\{value\}\}/g, String(value));
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

		// Sort entries by key length (descending) to match longer keys first
		// This prevents shorter keys from matching parts of longer keys
		// Filter to only include scalar values (exclude arrays, objects, etc.)
		const sortedEntries = Object.entries(inlineFields)
			.filter(([key, value]) => this.isScalarValue(value))
			.sort((a, b) => b[0].length - a[0].length);

		// Split content into lines once before processing
		const lines = modifiedContent.split('\n');

		// Replace existing DataView expressions that reference unprefixed properties
		// This updates expressions like `this.name` to `this.dv_name`
		for (const [key, value] of sortedEntries) {
			if (this.isIgnored(key)) continue;

			// Create regex to match this.key with word boundary
			// This ensures we match the full key name and not partial matches
			const escapedKey = this.escapeRegex(key);
			const thisKeyRegex = new RegExp(`\\bthis\\.${escapedKey}\\b`, 'g');
			const currentKeyRegex = new RegExp(`\\bdv.current\\(\\)\\.${escapedKey}\\b`, 'g');

			// Replace with prefixed version
			const prefixedThisKey = `this.${this.settings.prefix}${key}`;
			const prefixedCurrentKey = `dv.current().${this.settings.prefix}${key}`;

			// Process each line, updating in place
			for (let i = 0; i < lines.length; i++) {
				const originalLine = lines[i];
				const updatedLine = originalLine.replace(thisKeyRegex, prefixedThisKey);
				const updatedLine2 = updatedLine.replace(currentKeyRegex, prefixedCurrentKey);
				if (originalLine !== updatedLine2) {
					lines[i] = updatedLine2;
					hasChanges = true;
				}
			}
		}

		for (const [key, value] of sortedEntries) {
			if (this.isIgnored(key)) continue;

			// Create regex to match any inline field with optional whitespace
			// Matches: [key :: value], (key :: value), and key :: value
			// Underscores in keys will match any sequence of non-word characters (spaces, hyphens, etc.)
			// due to dataView canonicalization of keys. 
			let escapedKey = this.escapeRegexForFieldKey(key);
			const inlineFieldRegex = new RegExp(
				String.raw`\[\s*(\W?${escapedKey})\s*::\s*([^\]]*?)\]|\(\s*(\W?${escapedKey})\s*::\s*([^\)]*?)\)|^\s*(\W?${escapedKey})\s*::\s*([^\n]*?)\s*$`,
				'gi'
			);

			// Replace with DataView expression using configurable template
			const replacement = this.formatReplacement(key, value);

			// Process each line independently, updating in place
			for (let i = 0; i < lines.length; i++) {
				lines[i] = lines[i].replace(inlineFieldRegex, (match: string) => {
					// Check if the match is already a DataView expression
					if (match.includes('this.')) {
						return match; // Already replaced, skip
					}
					if (match.includes('dv.current().')) {
						return match; // Already replaced, skip
					}
					hasChanges = true;
					return replacement;
				});
			}
		}

		// Join lines back together after all processing
		modifiedContent = lines.join('\n');

		// Only write back if we made changes
		if (hasChanges) {
			await this.app.vault.modify(file, modifiedContent);
		}
	}

	/**
	 * Check if a value is scalar-like (can be safely converted to string for replacement)
	 * Returns true for primitives, dates, durations, and simple Dataview links
	 * Returns false for arrays, plain objects, and other complex types
	 */
	private isScalarValue(value: any): boolean {
		// Allow null/undefined
		if (value == null) return true;
		
		const valueType = typeof value;
		
		// Allow all JavaScript primitives
		if (valueType === 'string' || 
				valueType === 'number' || 
				valueType === 'boolean' || 
				valueType === 'bigint' || 
				valueType === 'symbol') {
			return true;
		}
		
		// For objects, be selective
		if (valueType === 'object') {
			// Exclude arrays
			if (Array.isArray(value)) return false;
			
			// Allow native Date objects
			if (value instanceof Date) return true;
			
			// Allow RegExp
			if (value instanceof RegExp) return true;
			
			// Check constructor name for Dataview types
			const constructorName = value.constructor?.name;
			
			// Allow Dataview scalar types by constructor name
			if (constructorName === 'DateTime' ||   // Dataview dates/times
					constructorName === 'Duration' ||   // Dataview durations
					constructorName === 'Link') {       // Dataview links
				return true;
			}
			
			// Fallback: Check for Dataview DateTime by structure (has 'ts' timestamp property)
			// This is more robust if constructor names change
			if (value.ts !== undefined && typeof value.ts === 'number') {
				return true;
			}
			
			// Fallback: Check for Dataview Duration by structure (has duration properties)
			if (value.years !== undefined || value.months !== undefined || 
					value.days !== undefined || value.hours !== undefined) {
				return true;
			}
			
			// Exclude all other objects (plain objects, Maps, Sets, etc.)
			return false;
		}
		
		// Exclude functions and other types
		return false;
	}

	/**
	 * Escape special regex characters in string
	 */
	private escapeRegex(text: string): string {
		return text.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&");
	}

	/**
	 * Escape special regex characters for field keys, allowing underscores to match any non-word characters
	 */
	private escapeRegexForFieldKey(text: string): string {
		// First escape regex special characters
		const escaped = this.escapeRegex(text);
		// Then replace underscores with pattern to match non-word chars
		const result = escaped.replace(/_/g, "\\S+");
		return result;
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
