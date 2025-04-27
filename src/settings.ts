import { type App, PluginSettingTab, Setting } from "obsidian";
import <%= data.interfaceName %> from "./main";

export class <%= data.interfaceName %>SettingTab extends PluginSettingTab {
	plugin: <%= data.interfaceName %>;

	constructor(app: App, plugin: <%= data.interfaceName %>) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Setting #1")
			.setDesc("It's a secret")
			.addText(text => text
				.setPlaceholder("Enter your secret")
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
