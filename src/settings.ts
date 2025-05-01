import dedent from "dedent";
import i18next from "i18next";
import {
	type App,
	MarkdownRenderer,
	PluginSettingTab,
	Setting,
	sanitizeHTMLToDom,
	type TextAreaComponent,
	Notice,
} from "obsidian";
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

	async display(): Promise<void> {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.addClass("obsidian-dataview-properties");

		new Setting(containerEl)
			.setName(i18next.t("interval.title"))
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

		if (this.plugin.settings.deleteFromFrontmatter.enabled) {
			new Setting(containerEl)
				.setClass("li")
				.setName(i18next.t("lowerCase.title"))
				.setDesc(i18next.t("lowerCase.desc"))
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.deleteFromFrontmatter.lowerCase)
						.onChange(async (value) => {
							this.plugin.settings.deleteFromFrontmatter.lowerCase = value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName(i18next.t("ignoreAccents.title"))
				.setClass("li")
				.setDesc(
					sanitizeHTMLToDom(
						`${i18next.t("ignoreAccents.desc")} <code>é</code> → <code>e</code>`
					)
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.deleteFromFrontmatter.ignoreAccents)
						.onChange(async (value) => {
							this.plugin.settings.deleteFromFrontmatter.ignoreAccents = value;
							await this.plugin.saveSettings();
						})
				);
			containerEl.createEl("hr");
		}

		const set = new Setting(containerEl)
			.setName(i18next.t("cleanUpText.title"))
			.setHeading()
			.setClass("h1")
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
		await MarkdownRenderer.render(
			this.app,
			dedent(`
			> [!NOTE] ${i18next.t("note")}
			`),
			set.descEl,
			"",
			this.plugin
		);

		if (this.plugin.settings.cleanUpText.fields.length > 0) {
			new Setting(containerEl)
				.setName(i18next.t("lowerCase.title"))
				.setDesc(i18next.t("lowerCase.desc"))
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.cleanUpText.lowerCase)
						.onChange(async (value) => {
							this.plugin.settings.cleanUpText.lowerCase = value;
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
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.cleanUpText.ignoreAccents)
						.onChange(async (value) => {
							this.plugin.settings.cleanUpText.ignoreAccents = value;
							await this.plugin.saveSettings();
						})
				);
			this.containerEl.createEl("hr");
		}

		new Setting(containerEl)
			.setHeading()
			.setClass("h1")
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
		if (this.plugin.settings.ignoreFields.fields.length > 0) {
			new Setting(containerEl)
				.setName(i18next.t("lowerCase.title"))
				.setDesc(i18next.t("lowerCase.desc"))
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.ignoreFields.lowerCase)
						.onChange(async (value) => {
							this.plugin.settings.ignoreFields.lowerCase = value;
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
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.ignoreFields.ignoreAccents)
						.onChange(async (value) => {
							this.plugin.settings.ignoreFields.ignoreAccents = value;
							await this.plugin.saveSettings();
						})
				);

			containerEl.createEl("hr");
		}
		new Setting(containerEl)
			.setName("Dataview")
			.setDesc(i18next.t("dataview.title"))
			.setHeading()
			.setClass("h1");

		await MarkdownRenderer.render(
			this.app,
			dedent(`
			> [!WARNING] ${i18next.t("warning.title")}
			> ${i18next.t("warning.desc")}
			`),
			containerEl,
			"",
			this.plugin
		);

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
	}
}
