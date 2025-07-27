import dedent from "dedent";
import i18next from "i18next";
import { type App, Component, MarkdownRenderer, Modal, Setting } from "obsidian";
import type { Ignore } from "./interfaces";
export class ExcludedFilesModal extends Modal {
	app: App;
	ignored: Ignore;
	onSubmit: (result: Ignore) => void;
	constructor(app: App, ignored: Ignore, onSubmit: (result: Ignore) => void) {
		super(app);
		this.app = app;
		this.onSubmit = onSubmit;
		this.ignored = structuredClone(ignored);
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("dataview-properties-modal");

		const markdown = dedent(`
		# Fichier exclus
		Vous pouvez ici exclure des fichiers de la résolutions de Dataview Properties en les ajoutant à la liste ci-dessous.
		
		Les fichiers exclus peuvent l'être par :
		- Un regex, sous forme \`/regex/flags\`
		- Le chemin du fichier, par exemple \`/path/to/file.md\`
		- Ou simplement par une partie du nom
		
		De plus, il est possible de rapidement exclure un fichier par l'utilisation d'une clé dans le frontmatter.
		> [!EXAMPLE] Exemple
		> \`\`\`yaml
		> ${this.ignored.keyName}: true
		> \`\`\`
		`);

		const component = new Component();
		component.load();
		await MarkdownRenderer.render(this.app, markdown, contentEl, "", component);
		new Setting(contentEl).setName(i18next.t("excluded.keyName")).addText((text) => {
			text.setValue(this.ignored.keyName).onChange((value) => {
				this.ignored.keyName = value;
			});
		});
		new Setting(contentEl).setName(i18next.t("excluded.title")).setHeading();

		for (const ignore of this.ignored.files) {
			const index = this.ignored.files.indexOf(ignore);
			new Setting(contentEl)
				.setNoInfo()
				.addText((text) => {
					text
						.setValue(ignore)
						.setPlaceholder(i18next.t("excluded.placeholder"))
						.onChange((value) => {
							this.ignored.files[index] = value;
						});
				})
				.addExtraButton((button) => {
					button
						.setIcon("cross")
						.setTooltip(i18next.t("excluded.remove"))
						.onClick(() => {
							this.ignored.files.splice(index, 1);
							this.onOpen();
						});
				});
		}

		new Setting(contentEl)
			.addExtraButton((button) => {
				button
					.setIcon("plus")
					.setTooltip(i18next.t("excluded.add"))
					.onClick(() => {
						this.ignored.files.push("");
						this.onOpen();
					});
			})
			.addButton((button) => {
				button
					.setButtonText(i18next.t("excluded.save"))
					.setCta()
					.onClick(() => {
						this.close();
						this.onSubmit(this.ignored);
					});
			});
		component.unload();
	}
	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
