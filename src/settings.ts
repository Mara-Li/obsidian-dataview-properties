import { type App, MarkdownRenderer, PluginSettingTab, sanitizeHTMLToDom, Setting } from "obsidian";
import type DataviewProperties from "./main";
import i18next from "i18next";
import dedent from "dedent";

export class DataviewPropertiesSettingTab extends PluginSettingTab {
	plugin: DataviewProperties;

	constructor(app: App, plugin: DataviewProperties) {
		super(app, plugin);
		this.plugin = plugin;
	}


	async display(): Promise<void> {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.addClass("obsidian-dataview-properties");



		new Setting(containerEl)
			.setName(i18next.t("ignore"))
			.setHeading()
			.setClass("h1");

		new Setting(containerEl)
			.setName(i18next.t("ignoredFields.title"))
			.setDesc(sanitizeHTMLToDom(`${i18next.t("ignoredFields.desc")} <code>/</code> ${i18next.t("ignoredFields.example")} <code>/myRegex/gi</code>`))
			.setClass("textarea")
			.addTextArea((text) => {
				text
					.setValue(this.plugin.settings.ignoreFields.join(", "))
					.inputEl.onblur = async () => {
						const value = text.getValue();
						if (value.length === 0)
							this.plugin.settings.ignoreFields = [];
						else
							this.plugin.settings.ignoreFields = value.split(/[,\n]+/).map((item) => item.trim()).filter((item => item.length > 0));
						await this.plugin.saveSettings();
						await this.display();
					}
			})

		new Setting(containerEl)
			.setName(i18next.t("lowerCase.title"))
			.setDesc(i18next.t("lowerCase.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.lowerCase)
					.onChange(async (value) => {
						this.plugin.settings.lowerCase = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(i18next.t("ignoreAccents.title"))
			.setDesc(sanitizeHTMLToDom(`${i18next.t("ignoreAccents.desc")} <code>é</code> → <code>e</code>`))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.ignoreAccents)
					.onChange(async (value) => {
						this.plugin.settings.ignoreAccents = value;
						await this.plugin.saveSettings();
					})
			);


		containerEl.createEl("hr");
		new Setting(containerEl)
			.setName("Dataview")
			.setDesc(i18next.t("dataview.title"))
			.setHeading()
			.setClass("h1");

		await MarkdownRenderer.render(this.app, dedent(`
			> [!WARNING] ${i18next.t("warning.title")}
			> ${i18next.t("warning.desc")}
			`), containerEl, "", this.plugin)

		new Setting(containerEl)
			.setName("Query language (DQL)")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.dql)
					.onChange(async (value) => {
						this.plugin.settings.dql = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("Javascript (DJS)")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.djs)
					.onChange(async (value) => {
						this.plugin.settings.djs = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
