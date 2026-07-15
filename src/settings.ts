import dedent from "dedent";
import i18next from "i18next";
import type { ToHumanDurationOptions } from "luxon";
import {
	type App,
	Component,
	MarkdownRenderer,
	Notice,
	PluginSettingTab,
	type SettingDefinition,
	type SettingDefinitionItem,
	sanitizeHTMLToDom,
} from "obsidian";
import { ExcludedFilesModal } from "./ignoredFileModal";
import type DataviewProperties from "./main";

export class DataviewPropertiesSettingTab extends PluginSettingTab {
	plugin: DataviewProperties;

	constructor(app: App, plugin: DataviewProperties) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// --- Declarative API bindings (Obsidian 1.13.0+) ---

	override getControlValue(key: string): unknown {
		const parts = key.split(".");
		let obj: unknown = this.plugin.settings;
		for (const part of parts) {
			if (obj == null || typeof obj !== "object") return undefined;
			obj = (obj as Record<string, unknown>)[part];
		}
		return obj;
	}

	override async setControlValue(key: string, value: unknown): Promise<void> {
		const parts = key.split(".");
		let obj: Record<string, unknown> = this.plugin.settings as unknown as Record<
			string,
			unknown
		>;
		for (let i = 0; i < parts.length - 1; i++) {
			obj = obj[parts[i]] as Record<string, unknown>;
		}
		obj[parts[parts.length - 1]] = typeof value === "string" ? value.trim() : value;
		await this.plugin.saveSettings();
		// interval's desc shows a human-readable duration derived from the stored value
		if (key === "interval") this.update();
	}

	override getSettingDefinitions(): SettingDefinitionItem[] {
		const s = this.plugin.settings;

		return [
			// Excluded files
			{
				name: "",
				render: (setting) => {
					setting.addButton((btn) =>
						btn.setButtonText(i18next.t("excluded.title")).onClick(() => {
							new ExcludedFilesModal(this.app, s.ignore, (ignored) => {
								s.ignore = ignored;
								void this.plugin.saveSettings();
							}).open();
						})
					);
				},
			},

			// Prefix
			{
				name: i18next.t("prefix.title"),
				desc: i18next.t("prefix.desc"),
				control: {
					type: "text",
					key: "prefix",
					validate: (value) =>
						value.trim().length === 0 ? i18next.t("prefix.invalid") : undefined,
				},
			},

			// Replace inline fields
			{
				name: i18next.t("replaceInlineFields.title"),
				desc: i18next.t("replaceInlineFields.desc"),
				control: { type: "toggle", key: "replaceInlineFieldsWith.enabled" },
			},
			{
				name: i18next.t("replaceInlineFields.template.title"),
				desc: sanitizeHTMLToDom(i18next.t("replaceInlineFields.template.desc")),
				visible: () => s.replaceInlineFieldsWith.enabled,
				render: (setting) => {
					setting.addText((text) => {
						text
							.setValue(s.replaceInlineFieldsWith.template)
							.setPlaceholder("{{key}} = `= this.{{prefix}}{{key}}`");
						text.inputEl.onblur = async () => {
							const value = text.getValue();
							if (value.trim().length === 0) {
								new Notice(
									sanitizeHTMLToDom(
										`<span class="notice-error">${i18next.t("replaceInlineFields.template.invalid")}</span>`
									)
								);
								text.inputEl.addClass("is-invalid");
							} else {
								s.replaceInlineFieldsWith.template = value;
								await this.plugin.saveSettings();
								text.inputEl.removeClass("is-invalid");
							}
						};
						text.inputEl.addClass("max-width");
					});
				},
			},

			// Unflatten
			{
				name: i18next.t("unflatten.title"),
				desc: sanitizeHTMLToDom(
					i18next.t("unflatten.desc", {
						keys: "<code>k1.k2.k3: value<code>",
						conversion: "<code>k1: { k2: { k3: value } }</code>",
					})
				),
				control: { type: "toggle", key: "unflatten.enabled" },
			},
			{
				name: i18next.t("separator.title"),
				desc: sanitizeHTMLToDom(
					`${i18next.t("separator.desc")}<br><span class='warning'>${i18next.t("separator.warning", { point: "<code>.</code>" })}</span>`
				),
				visible: () => s.unflatten.enabled,
				control: {
					type: "text",
					key: "unflatten.separator",
					validate: (value) => {
						if (value.trim().length === 0) return i18next.t("separator.invalid");
						if (value.includes("."))
							return i18next.t("separator.point", { point: value });
					},
				},
			},

			// Extra menus
			{
				name: i18next.t("extraMenus.title"),
				desc: i18next.t("extraMenus.desc"),
				control: { type: "toggle", key: "extraMenus" },
			},

			// Update interval
			{
				name: i18next.t("interval.title"),
				desc: sanitizeHTMLToDom(
					`${i18next.t("interval.info")} (→ <code>${this.convertTimeInterval(s.interval)}</code>) ${i18next.t("interval.desc")}`
				),
				control: {
					type: "number",
					key: "interval",
					min: 0,
				},
			},

			// List fields
			{
				type: "page",
				name: i18next.t("listFields.title"),
				desc: i18next.t("listFields.desc"),
				items: [
					{
						name: i18next.t("listFields.suffix"),
						render: (setting) => {
							setting.addText((text) => {
								text.setValue(s.listSuffix);
								text.inputEl.onblur = async () => {
									const value = text.getValue();
									if (value.trim().length === 0) {
										new Notice(
											sanitizeHTMLToDom(
												`<span class="notice-error">${i18next.t("listFields.invalid")}</span>`
											)
										);
										text.inputEl.addClass("is-invalid");
										text.setValue("_list");
									} else if (
										value.includes(s.unflatten.separator) &&
										s.unflatten.enabled
									) {
										new Notice(
											sanitizeHTMLToDom(
												`<span class="notice-error">${i18next.t("listFields.separator", { separator: `<code>${s.unflatten.separator}</code>` })}</span>`
											)
										);
										text.inputEl.addClass("is-invalid");
										text.setValue(value.replaceAll(s.unflatten.separator, ""));
									} else {
										s.listSuffix = value.trim();
										await this.plugin.saveSettings();
										text.inputEl.removeClass("is-invalid");
									}
								};
							});
						},
					},
					...this.fieldListPageItems(
						s.listFields.fields,
						"listFields.fields",
						i18next.t("ignoredFields.placeholder"),
						i18next.t("listFields.add"),
						"listFields.lowerCase",
						"listFields.ignoreAccents"
					),
				],
			},

			// Ignored fields
			{
				type: "page",
				name: i18next.t("ignoredFields.title"),
				desc: sanitizeHTMLToDom(
					`${i18next.t("ignoredFields.desc")} <code>/</code> ${i18next.t("ignoredFields.example")} <code>/myRegex/gi</code>`
				),
				items: this.fieldListPageItems(
					s.ignoreFields.fields,
					"ignoreFields.fields",
					i18next.t("ignoredFields.placeholder"),
					i18next.t("ignoredFields.add"),
					"ignoreFields.lowerCase",
					"ignoreFields.ignoreAccents"
				),
			},

			// Delete from frontmatter
			{
				name: i18next.t("deleteFromFrontmatter.title"),
				desc: i18next.t("deleteFromFrontmatter.desc"),
				control: { type: "toggle", key: "deleteFromFrontmatter.enabled" },
			},
			{
				name: i18next.t("lowerCase.title"),
				desc: i18next.t("lowerCase.desc"),
				visible: () => s.deleteFromFrontmatter.enabled,
				control: { type: "toggle", key: "deleteFromFrontmatter.lowerCase" },
			},
			{
				name: i18next.t("ignoreAccents.title"),
				desc: sanitizeHTMLToDom(
					`${i18next.t("ignoreAccents.desc")} <code>é</code> → <code>e</code>`
				),
				visible: () => s.deleteFromFrontmatter.enabled,
				control: { type: "toggle", key: "deleteFromFrontmatter.ignoreAccents" },
			},

			// Clean up text
			{
				type: "page",
				name: i18next.t("cleanUpText.title"),
				desc: sanitizeHTMLToDom(
					`${i18next.t("cleanUpText.desc")} <code>/</code> ${i18next.t("ignoredFields.example")} <code>/myRegex/gi</code>`
				),
				items: [
					{
						name: "",
						render: (setting) => {
							const comp = new Component();
							comp.load();
							void MarkdownRenderer.render(
								this.app,
								dedent(`
								> [!NOTE] ${i18next.t("note")}
								`),
								setting.descEl,
								"",
								comp
							);
							return () => comp.unload();
						},
					},
					...this.fieldListPageItems(
						s.cleanUpText.fields,
						"cleanUpText.fields",
						i18next.t("cleanUpText.placeholder"),
						i18next.t("cleanUpText.add"),
						"cleanUpText.lowerCase",
						"cleanUpText.ignoreAccents"
					),
				],
			},

			// Force fields (visible when only-mode is enabled)
			{
				type: "page",
				name: i18next.t("onlyMode.forceFields.title"),
				desc: i18next.t("onlyMode.forceFields.desc"),
				visible: () => s.onlyMode.enable,
				items: this.fieldListPageItems(
					s.onlyMode.forceFields.fields,
					"onlyMode.forceFields.fields",
					i18next.t("ignoredFields.placeholder"),
					i18next.t("onlyMode.forceFields.add"),
					"onlyMode.forceFields.lowerCase",
					"onlyMode.forceFields.ignoreAccents"
				),
			},

			// Dataview
			{
				type: "group",
				heading: "Dataview",
				items: [
					// Warning callout
					{
						name: "",
						desc: i18next.t("dataview.title"),
						render: (setting) => {
							const comp = new Component();
							comp.load();
							void MarkdownRenderer.render(
								this.app,
								dedent(`
								> [!WARNING] ${i18next.t("warning.title")}
								> ${i18next.t("warning.desc")}
								`),
								setting.descEl,
								"",
								comp
							);
							return () => comp.unload();
						},
					},
					// DQL only mode
					{
						name: i18next.t("dql.title"),
						desc: i18next.t("dql.description"),
						control: { type: "toggle", key: "onlyMode.enable" },
					},
					// Query language toggle
					{
						name: "Query language (DQL)",
						control: { type: "toggle", key: "dql" },
					},
					// Javascript toggle
					{
						name: "Javascript (DJS)",
						control: { type: "toggle", key: "djs" },
					},
					// Duration format toggle
					{
						name: i18next.t("durationFormat.title"),
						desc: sanitizeHTMLToDom(
							i18next.t("durationFormat.desc", {
								link: '<a href="https://moment.github.io/luxon/api-docs/index.html#durationtohuman" target="_blank">Luxon <code>toHuman(opts)</code></a>',
							})
						),
						control: {
							type: "toggle",
							key: "dataviewOptions.durationFormat.formatDuration",
						},
					},
					// Duration humanReadableOptions textarea (visible when formatDuration)
					{
						name: i18next.t("durationFormat.options.title"),
						visible: () => s.dataviewOptions.durationFormat.formatDuration,
						render: (setting) => {
							setting.setClass("max-width").setClass("li").setClass("display-block");
							setting.addTextArea((text) => {
								text
									.setValue(
										JSON.stringify(
											s.dataviewOptions.durationFormat.humanReadableOptions
										) ?? ""
									)
									.setPlaceholder('e.g. { "unitDisplay": "long", "round": true }');
								text.inputEl.onblur = async () => {
									const value = text.getValue();
									if (value.trim().length === 0) {
										s.dataviewOptions.durationFormat.humanReadableOptions = undefined;
										await this.plugin.saveSettings();
									} else {
										try {
											const parsed: unknown = JSON.parse(value);
											if (typeof parsed === "object" && !Array.isArray(parsed)) {
												s.dataviewOptions.durationFormat.humanReadableOptions =
													parsed as ToHumanDurationOptions;
												await this.plugin.saveSettings();
												text.inputEl.removeClass("is-invalid");
											} else {
												new Notice(
													sanitizeHTMLToDom(
														`<span class="notice-error">${i18next.t("durationFormat.options.invalid")}</span>`
													)
												);
												text.inputEl.addClass("is-invalid");
											}
										} catch (e) {
											new Notice(
												sanitizeHTMLToDom(
													`<span class="notice-error">${i18next.t("durationFormat.options.invalid")}</span>`
												)
											);
											console.error(e);
											text.inputEl.addClass("is-invalid");
										}
									}
								};
							});
						},
					},
					// Duration text replacement (visible when formatDuration)
					{
						name: i18next.t("durationFormat.textReplacement.title"),
						desc: i18next.t("durationFormat.textReplacement.desc"),
						visible: () => s.dataviewOptions.durationFormat.formatDuration,
						render: (setting) => {
							setting.setClass("li").setClass("padding-top").setClass("display-block");
							setting
								.addText((cb) =>
									cb
										.setValue(
											s.dataviewOptions.durationFormat.textReplacement?.toReplace ?? ""
										)
										.setPlaceholder(
											i18next.t("durationFormat.textReplacement.placeholder")
										)
										.onChange(async (value) => {
											if (value.trim().length === 0) {
												s.dataviewOptions.durationFormat.textReplacement = undefined;
												await this.plugin.saveSettings();
												return;
											}
											s.dataviewOptions.durationFormat.textReplacement = {
												toReplace: value.length === 0 ? undefined : value,
												replaceWith:
													s.dataviewOptions.durationFormat.textReplacement?.replaceWith ??
													"",
											};
											await this.plugin.saveSettings();
										})
										.inputEl.addClass("max-width")
								)
								.addExtraButton((btn) =>
									btn
										.setIcon("arrow-right")
										.setDisabled(true)
										.extraSettingsEl.addClass("no-hover")
								)
								.addText((cb) =>
									cb
										.setValue(
											s.dataviewOptions.durationFormat.textReplacement?.replaceWith ?? ""
										)
										.setPlaceholder(
											i18next.t("durationFormat.textReplacement.placeholder2")
										)
										.onChange(async (value) => {
											s.dataviewOptions.durationFormat.textReplacement = {
												toReplace:
													s.dataviewOptions.durationFormat.textReplacement?.toReplace,
												replaceWith: value,
											};
											await this.plugin.saveSettings();
										})
										.inputEl.addClass("max-width")
								);
						},
					},
				],
			},
		];
	}
	
	private deleteFieldEntry(fields: string[], index: number) {
		fields.splice(index, 1);
		void this.plugin.saveSettings();
		this.update();
	}

	/** Each row is a `control` bound to `<basePath>.<index>` — no manual read/write/save wiring. */
	private fieldListItems(
		fields: string[],
		basePath: string,
		placeholder: string
	): SettingDefinition[] {
		return fields.map(
			(_, index): SettingDefinition => ({
				name: "",
				searchable: false,
				control: {
					type: "text",
					key: `${basePath}.${index}`,
					placeholder,
				},
			})
		);
	}

	/** The [list, lowerCase toggle, ignoreAccents toggle] shared by every field-list page. */
	private fieldListPageItems(
		fields: string[],
		basePath: string,
		placeholder: string,
		addLabel: string,
		lowerCaseKey: string,
		ignoreAccentsKey: string
	): SettingDefinitionItem[] {
		return [
			{
				type: "list",
				addItem: {
					name: addLabel,
					action: () => {
						fields.push("");
						this.update();
					},
				},
				onDelete: (idx) => this.deleteFieldEntry(fields, idx),
				items: this.fieldListItems(fields, basePath, placeholder),
			},
			{
				name: i18next.t("lowerCase.title"),
				desc: i18next.t("lowerCase.desc"),
				visible: () => fields.length > 0,
				control: { type: "toggle", key: lowerCaseKey },
			},
			{
				name: i18next.t("ignoreAccents.title"),
				desc: sanitizeHTMLToDom(
					`${i18next.t("ignoreAccents.desc")} <code>é</code> → <code>e</code>`
				),
				visible: () => fields.length > 0,
				control: { type: "toggle", key: ignoreAccentsKey },
			},
		];
	}

	private convertTimeInterval(ms: number) {
		if (ms < 1000) return `${ms}ms`;

		const seconds = Math.floor(ms / 1000);
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;
		let result = "";

		if (hours > 0) result += `${hours}h`;

		if (minutes > 0 || hours > 0) result += `${minutes}m`;

		if (secs > 0 || (hours === 0 && minutes === 0)) result += `${secs}s`;

		return result;
	}
}
