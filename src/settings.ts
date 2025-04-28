import { type App, Notice, PluginSettingTab, sanitizeHTMLToDom, Setting } from "obsidian";
import type DataviewProperties from "./main";
import { isNumber } from "./utils";
import i18next from "i18next";

export class DataviewPropertiesSettingTab extends PluginSettingTab {
	plugin: DataviewProperties;

	constructor(app: App, plugin: DataviewProperties) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Expect to have a number "timed", like "1s", "1m30", "2m40s", "1h", "1h30m", "1h30m45s", etc...
	 * @param freq {number}
	 * * @returns {string}
	 */
	private freqToTime(ms: number): string {
		if (ms < 1000) {
			return `${ms}ms`;
		}
		const seconds = Math.floor(ms / 1000);
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;
		let result = '';

		if (hours > 0) {
			result += `${hours}h`;
		}
		if (minutes > 0 || hours > 0) {
			result += `${minutes}m`;
		}
		if (secs > 0 || (hours === 0 && minutes === 0)) {
			result += `${secs}s`;
		}
		return result;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.addClass("obsidian-dataview-properties");


		new Setting(containerEl)
			.setName(i18next.t("interval.title"))
			.setDesc(sanitizeHTMLToDom(`${i18next.t("interval.info")} (<code>${this.freqToTime(this.plugin.settings.frequency)}</code>) ${i18next.t("interval.desc")}`))
			.addText((text) => {
				text
					.setValue(this.plugin.settings.frequency.toString())
					.inputEl.onblur = async () => {
						const value = text.getValue();
						if (!isNumber(value)) {
							new Notice(sanitizeHTMLToDom(`<span class="obsidian-dataview-properties notice-error">${i18next.t("invalid.number")}</span>`));
							text.inputEl.addClass("is-invalid");
						} else if (Number(value) < 0) {
							new Notice(sanitizeHTMLToDom(`<span class="obsidian-dataview-properties notice-error">${i18next.t("error.positive")}</span>`));
							text.inputEl.addClass("is-invalid");
						} else {
							this.plugin.settings.frequency = Number(value);
							await this.plugin.saveSettings();
							this.display();
						}
					}
			}

			);


		new Setting(containerEl)
			.setName("Dataview")
			.setDesc(i18next.t("dataview.title"))
			.setHeading()
			.setClass("h1");

		new Setting(containerEl)
			.setName("Dataview Query Language (DQL)")
			.setHeading()
			.setClass("h2");

		new Setting(containerEl)
			.setName(i18next.t("dataview.block"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.dql.block)
					.onChange(async (value) => {
						this.plugin.settings.dql.block = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName(i18next.t("dataview.inline"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.dql.inline)
					.onChange(async (value) => {
						this.plugin.settings.dql.inline = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("Dataview Javascript (DJS)")
			.setHeading()
			.setClass("h2");

		new Setting(containerEl)
			.setName(i18next.t("dataview.block"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.djs.block)
					.onChange(async (value) => {
						this.plugin.settings.djs.block = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName(i18next.t("dataview.inline"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.djs.inline)
					.onChange(async (value) => {
						this.plugin.settings.djs.inline = value;
						await this.plugin.saveSettings();
					})
			);

	}
}
