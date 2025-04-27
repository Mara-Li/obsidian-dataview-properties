import { type App, Modal } from "obsidian";

export class DataviewPropertiesModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText("Woah!");
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}