import dedent from "dedent";
import i18next from "i18next";
import {
	type App,
	Component,
	MarkdownRenderer,
	Notice,
	PluginSettingTab,
	Setting,
	sanitizeHTMLToDom,
	type TextAreaComponent,
} from "obsidian";
import { ExcludedFilesModal } from "./ignoredFileModal";
import type DataviewProperties from "./main";
import { isNumber } from "./utils";

export class DataviewPropertiesSettingTab extends PluginSettingTab {
	plugin: DataviewProperties;

	constructor(app: App, plugin: DataviewProperties) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private textAreaSettings(text: TextAreaComponent) {
		const value = text.getValue();
		if (value.length === 0) return [];
		else
			return value
				.split(/[,\n]+/)
				.map((item) => item.trim())
				.filter((item) => item.length > 0);
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

	// helper to render lowerCase & ignoreAccents toggles for any group with .fields
	private addFieldToggles(
		containerEl: HTMLElement,
		group: {
			enabled?: false | true | undefined;
			fields?: string[] | undefined;
			ignoreAccents: boolean;
			lowerCase: boolean;
		}
	) {
		if ((group.fields && group.fields.length > 0) || group.enabled) {
			new Setting(containerEl)
				.setName(i18next.t("lowerCase.title"))
				.setDesc(i18next.t("lowerCase.desc"))
				.setClass("li")
				.addToggle((t) =>
					t.setValue(group.lowerCase).onChange(async (v) => {
						group.lowerCase = v;
						await this.plugin.saveSettings();
					})
				);
			new Setting(containerEl)
				.setName(i18next.t("ignoreAccents.title"))
				.setDesc(
					sanitizeHTMLToDom(
						`${i18next.t("ignoreAccents.desc")} <code>é</code> → <code>e</code>`
					)
				)
				.setClass("li")
				.addToggle((t) =>
					t.setValue(group.ignoreAccents).onChange(async (v) => {
						group.ignoreAccents = v;
						await this.plugin.saveSettings();
					})
				);
		}
	}

	private addDeleteFieldToggles(containerEl: HTMLElement) {
		const grp = this.plugin.settings.deleteFromFrontmatter;
		this.addFieldToggles(containerEl, grp);
	}

	async display(): Promise<void> {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.addClass("obsidian-dataview-properties");

		new Setting(containerEl).addButton((button) => {
			button.setButtonText(i18next.t("excluded.title")).onClick(() => {
				new ExcludedFilesModal(this.app, this.plugin.settings.ignore, async (ignored) => {
					this.plugin.settings.ignore = ignored;
					await this.plugin.saveSettings();
				}).open();
			});
		});

		new Setting(containerEl)
			.setName(i18next.t("prefix.title"))
			.setDesc(i18next.t("prefix.desc"))

			.addText((text) => {
				text.setValue(this.plugin.settings.prefix).inputEl.onblur = async () => {
					const value = text.getValue();
					if (value.trim().length === 0) {
						new Notice(
							sanitizeHTMLToDom(
								`<span class="notice-error">${i18next.t("prefix.invalid")}</span>`
							)
						);
						text.inputEl.addClass("is-invalid");
					} else {
						this.plugin.settings.prefix = value.trim();
						await this.plugin.saveSettings();
						await this.display();
					}
				};
			});

		new Setting(containerEl)
			.setName("Replace inline fields with expressions")
			.setDesc(
				sanitizeHTMLToDom(
					"Enable automatic replacement of inline DataView fields with expressions that reference frontmatter properties."
				)
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.replaceInlineFieldsWith.enabled)
					.onChange(async (value) => {
						this.plugin.settings.replaceInlineFieldsWith.enabled = value;
						await this.plugin.saveSettings();
						await this.display();
					})
			);

		if (this.plugin.settings.replaceInlineFieldsWith.enabled) {
			new Setting(containerEl)
				.setName("Inline field replacement template")
				.setDesc(
					sanitizeHTMLToDom(
						`Template for replacing inline fields with dataview expressions. Available placeholders: <code>{{key}}</code>, <code>{{prefix}}</code>, <code>{{value}}</code><br>Default: <code>{{key}} = \`= this.{{prefix}}{{key}}\`</code>`
					)
				)
				.addText((text) => {
					text.setValue(this.plugin.settings.replaceInlineFieldsWith.template)
						.setPlaceholder("{{key}} = `= this.{{prefix}}{{key}}`")
						.inputEl.onblur = async () => {
						const value = text.getValue();
						if (value.trim().length === 0) {
							new Notice(
								sanitizeHTMLToDom(
									`<span class="notice-error">Replacement template cannot be empty</span>`
								)
							);
							text.inputEl.addClass("is-invalid");
						} else {
							this.plugin.settings.replaceInlineFieldsWith.template = value;
							await this.plugin.saveSettings();
					text.inputEl.removeClass("is-invalid");
				}
			};
			text.inputEl.addClass("max-width");
		});
		}

		containerEl.createEl("hr");

		new Setting(containerEl)
			.setName(i18next.t("unflatten.title"))
			.setDesc(
				sanitizeHTMLToDom(
					i18next.t("unflatten.desc", {
						keys: "<code>k1.k2.k3: value<code>",
						conversion: "<code>k1: { k2: { k3: value } }</code>",
					})
				)
			)

			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.unflatten.enabled)
					.onChange(async (value) => {
						this.plugin.settings.unflatten.enabled = value;
						await this.plugin.saveSettings();
						await this.display();
					})
			);

		if (this.plugin.settings.unflatten.enabled) {
			new Setting(containerEl)
				.setName(i18next.t("separator.title"))

				.setDesc(
					sanitizeHTMLToDom(
						`${i18next.t("separator.desc")}<br><span class='warning'>${i18next.t("separator.warning", { point: "<code>.</code>" })}</span>`
					)
				)
				.addText((text) => {
					text.setValue(this.plugin.settings.unflatten.separator).inputEl.onblur =
						async () => {
							const value = text.getValue();
							if (value.trim().length === 0) {
								new Notice(
									sanitizeHTMLToDom(
										`<span class="obsidian-dataview-properties notice-error">${i18next.t("separator.invalid")}</span>`
									)
								);
								text.inputEl.addClass("is-invalid");
							} else if (value.includes(".")) {
								new Notice(
									sanitizeHTMLToDom(
										`<span class="obsidian-dataview-properties notice-error">${i18next.t(
											"separator.point",
											{
												point: `<code>${value}</code>`,
											}
										)}</span>`
									)
								);

								text.inputEl.addClass("is-invalid");
								text.inputEl.setText("");
							} else {
								this.plugin.settings.unflatten.separator = value.trim();
								await this.plugin.saveSettings();
								await this.display();
							}
						};
				});
		}
		containerEl.createEl("hr");

		new Setting(containerEl)
			.setName(i18next.t("extraMenus.title"))
			.setDesc(i18next.t("extraMenus.desc"))
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.extraMenus).onChange(async (value) => {
					this.plugin.settings.extraMenus = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(i18next.t("interval.title"))
			.setHeading()
			.setDesc(
				sanitizeHTMLToDom(
					`${i18next.t("interval.info")} (→ <code>${this.convertTimeInterval(this.plugin.settings.interval)}</code>) ${i18next.t("interval.desc")}`
				)
			)
			.addText((text) => {
				text.setValue(this.plugin.settings.interval.toString()).inputEl.onblur =
					async () => {
						const value = text.getValue();
						if (!isNumber(value)) {
							new Notice(
								sanitizeHTMLToDom(
									`<span class="notice-error">${i18next.t("interval.invalid.number")}</span>`
								)
							);
							text.inputEl.addClass("is-invalid");
						} else if (Number(value) < 0) {
							new Notice(
								sanitizeHTMLToDom(
									`<span class="notice-error);">${i18next.t("interval.invalid.negative")}</span>`
								)
							);
							text.inputEl.addClass("is-invalid");
						} else {
							this.plugin.settings.interval = Number(value);
							await this.plugin.saveSettings();
							await this.display();
						}
					};
			});

		containerEl.createEl("hr");

		new Setting(containerEl)
			.setName(i18next.t("listFields.title"))
			.setHeading()
			.setDesc(sanitizeHTMLToDom(`${i18next.t("listFields.desc")}`));
		new Setting(containerEl).setName(i18next.t("listFields.suffix")).addText((text) => {
			text.setValue(this.plugin.settings.listSuffix).inputEl.onblur = async () => {
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
					value.includes(this.plugin.settings.unflatten.separator) &&
					this.plugin.settings.unflatten.enabled
				) {
					new Notice(
						sanitizeHTMLToDom(
							`<span class="notice-error">${i18next.t("listFields.separator", {
								separator: `<code>${this.plugin.settings.unflatten.separator}</code>`,
							})}</span>`
						)
					);
					text.inputEl.addClass("is-invalid");
					text.setValue(value.replaceAll(this.plugin.settings.unflatten.separator, ""));
				} else {
					this.plugin.settings.listSuffix = value.trim();
					await this.plugin.saveSettings();
					await this.display();
				}
			};
		});
		new Setting(containerEl)
			.setNoInfo()
			.setHeading()
			.setClass("max-width")

			.addTextArea((text) => {
				text.setValue(this.plugin.settings.listFields.fields.join(", ")).inputEl.onblur =
					async () => {
						this.plugin.settings.listFields.fields = this.textAreaSettings(text);
						await this.plugin.saveSettings();
						await this.display();
					};
			});
		this.addFieldToggles(containerEl, this.plugin.settings.listFields);
		containerEl.createEl("hr");
		new Setting(containerEl)
			.setHeading()
			.setName(i18next.t("ignoredFields.title"))
			.setDesc(
				sanitizeHTMLToDom(
					`${i18next.t("ignoredFields.desc")} <code>/</code> ${i18next.t("ignoredFields.example")} <code>/myRegex/gi</code>`
				)
			)
			.setClass("textarea")
			.addTextArea((text) => {
				text.setValue(
					this.plugin.settings.ignoreFields.fields.join(", ")
				).inputEl.onblur = async () => {
					this.plugin.settings.ignoreFields.fields = this.textAreaSettings(text);
					await this.plugin.saveSettings();
					await this.display();
				};
			});
		this.addFieldToggles(containerEl, this.plugin.settings.ignoreFields);
		containerEl.createEl("hr");
		new Setting(containerEl)
			.setHeading()
			.setName(i18next.t("deleteFromFrontmatter.title"))
			.setDesc(i18next.t("deleteFromFrontmatter.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.deleteFromFrontmatter.enabled)
					.onChange(async (value) => {
						this.plugin.settings.deleteFromFrontmatter.enabled = value;
						await this.plugin.saveSettings();
						await this.display();
					})
			);
		this.addDeleteFieldToggles(containerEl);

		containerEl.createEl("hr");

		const set = new Setting(containerEl)
			.setName(i18next.t("cleanUpText.title"))
			.setHeading()
			.setDesc(
				sanitizeHTMLToDom(
					`${i18next.t("cleanUpText.desc")} <code>/</code> ${i18next.t("ignoredFields.example")} <code>/myRegex/gi</code>`
				)
			)
			.setClass("textarea")
			.addTextArea((text) => {
				text.setValue(this.plugin.settings.cleanUpText.fields.join(", ")).inputEl.onblur =
					async () => {
						this.plugin.settings.cleanUpText.fields = this.textAreaSettings(text);
						await this.plugin.saveSettings();
						await this.display();
					};
			});

		const components = new Component();
		components.load();
		await MarkdownRenderer.render(
			this.app,
			dedent(`
			> [!NOTE] ${i18next.t("note")}
			`),
			set.descEl,
			"",
			components
		);
		this.addFieldToggles(containerEl, this.plugin.settings.cleanUpText);
		containerEl.createEl("hr");
		new Setting(containerEl)
			.setName("Dataview")
			.setDesc(i18next.t("dataview.title"))
			.setHeading();

		await MarkdownRenderer.render(
			this.app,
			dedent(`
			> [!WARNING] ${i18next.t("warning.title")}
			> ${i18next.t("warning.desc")}
			`),
			containerEl,
			"",
			components
		);

		components.unload();

		new Setting(containerEl).setName("Query language (DQL)").addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.dql).onChange(async (value) => {
				this.plugin.settings.dql = value;
				await this.plugin.saveSettings();
			})
		);
		new Setting(containerEl).setName("Javascript (DJS)").addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.djs).onChange(async (value) => {
				this.plugin.settings.djs = value;
				await this.plugin.saveSettings();
			})
		);

		new Setting(containerEl)
			.setName(i18next.t("durationFormat.title"))
			.setDesc(
				sanitizeHTMLToDom(
					`${i18next.t("durationFormat.desc", { link: '<a href="https://moment.github.io/luxon/api-docs/index.html#durationtohuman" target="_blank">Luxon <code>toHuman(opts)</code></a>' })}`
				)
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.dataviewOptions.durationFormat.formatDuration)
					.onChange(async (value) => {
						this.plugin.settings.dataviewOptions.durationFormat.formatDuration = value;
						await this.plugin.saveSettings();
						await this.display();
					})
			);

		if (this.plugin.settings.dataviewOptions.durationFormat.formatDuration) {
			new Setting(containerEl)
				.setName(i18next.t("durationFormat.options.title"))
				.addTextArea((text) => {
					text
						.setValue(
							JSON.stringify(
								this.plugin.settings.dataviewOptions.durationFormat.humanReadableOptions
							) ?? ""
						)
						.setPlaceholder(
							'e.g. { "unitDisplay": "long", "round": true }'
						).inputEl.onblur = async () => {
						const value = text.getValue();
						if (value.trim().length === 0) {
							this.plugin.settings.dataviewOptions.durationFormat.humanReadableOptions =
								undefined;
							await this.plugin.saveSettings();
						} else {
							try {
								const parsed = JSON.parse(value);
								if (typeof parsed === "object" && !Array.isArray(parsed)) {
									this.plugin.settings.dataviewOptions.durationFormat.humanReadableOptions =
										parsed;
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
				})
				.setClass("max-width")
				.setClass("li")
				.setClass("display-block");

			new Setting(containerEl)
				.setName(i18next.t("durationFormat.textReplacement.title"))
				.setDesc(i18next.t("durationFormat.textReplacement.desc"))
				.setClass("li")
				.setClass("padding-top")
				.setClass("display-block")
				.addText((cb) =>
					cb
						.setValue(
							this.plugin.settings.dataviewOptions.durationFormat.textReplacement
								?.toReplace ?? ""
						)
						.setPlaceholder(i18next.t("durationFormat.textReplacement.placeholder"))
						.onChange(async (value) => {
							if (value.trim().length === 0) {
								this.plugin.settings.dataviewOptions.durationFormat.textReplacement =
									undefined;
								await this.plugin.saveSettings();
								return;
							}
							this.plugin.settings.dataviewOptions.durationFormat.textReplacement = {
								toReplace: value.length === 0 ? undefined : value,
								replaceWith:
									this.plugin.settings.dataviewOptions.durationFormat.textReplacement
										?.replaceWith ?? "",
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
							this.plugin.settings.dataviewOptions.durationFormat.textReplacement
								?.replaceWith ?? ""
						)
						.setPlaceholder(i18next.t("durationFormat.textReplacement.placeholder2"))
						.onChange(async (value) => {
							this.plugin.settings.dataviewOptions.durationFormat.textReplacement = {
								toReplace:
									this.plugin.settings.dataviewOptions.durationFormat.textReplacement
										?.toReplace,
								replaceWith: value,
							};
							await this.plugin.saveSettings();
						})
						.inputEl.addClass("max-width")
				);
		}
	}
}
