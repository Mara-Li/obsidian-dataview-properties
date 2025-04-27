import { type App, PluginSettingTab, Setting } from "obsidian";
import type DataviewProperties from "./main";

export class DataviewPropertiesSettingTab extends PluginSettingTab {
	plugin: DataviewProperties;

	constructor(app: App, plugin: DataviewProperties) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.addClass("obsidian-dataview-properties");

		new Setting(containerEl)
			.setName("Dataview")
			.setDesc("Enable dataview evaluations")
			.setHeading();

		new Setting(containerEl)
			.setName("Block")
			.setDesc("Enable block dataview queries evaluation");
	}
}
