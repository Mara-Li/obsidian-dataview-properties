import {
	type App,
	MarkdownRenderer,
	PluginSettingTab,
	sanitizeHTMLToDom,
	Setting,
	type TextAreaComponent
} from "obsidian";
import type DataviewProperties from "./main";
import i18next from "i18next";
import dedent from "dedent";

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

	async display(): Promise<void> {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.addClass("obsidian-dataview-properties");

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
