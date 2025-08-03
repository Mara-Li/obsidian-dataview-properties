import * as fs from "node:fs";
import * as path from "node:path";
import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

const manifest = JSON.parse(
	fs.readFileSync(`${path.resolve(__dirname, "..", "..", "manifest.json")}`, "utf-8")
) as { id: string; name: string; version: string };

console.log(
	`Running tests for ${manifest.name} v${manifest.version} in ${process.env.VAULT_TEST}`
);

const folder = path.resolve(__dirname, "..");
const fixtures = path.resolve(folder, "fixtures");

describe("Test my plugin", () => {
	beforeEach(async () => {
		await obsidianPage.resetVault();
	});
	it("plugins should be loaded", async () => {
		// Check if the plugin is loaded in the vault
		const pluginIsLoaded = await browser.executeObsidian(({ app }, pluginId) => {
			return (
				app.plugins.getPlugin(pluginId)?._loaded &&
				app.plugins.getPlugin("dataview")?._loaded
			);
		}, manifest.id);
		expect(pluginIsLoaded).toBe(true);
	});

	it("List all files in the vault", async () => {
		// List all files in the vault
		const files = await browser.executeObsidian(({ app }) => {
			return app.vault.getMarkdownFiles().map((file) => file.path);
		});
		console.warn(`Files in the vault: ${files}`);
		expect(files.some((file) => file.match(/(welcome|bienvenue)\.md$/i))).toBe(true);
	});

	it("should add the keys to an empty frontmatter", async () => {
		const simpleAdd = fs.readFileSync(`${fixtures}/simple_add.md`, "utf-8");
		// Create a new note with empty frontmatter
		await browser.executeObsidian(async ({ app }, simpleAdd) => {
			await app.vault.create("Test.md", simpleAdd);
		}, simpleAdd);
		//open file
		await obsidianPage.openFile("Test.md");
		//verify that the file is opened
		const fileOpened = await browser.executeObsidian(({ app, obsidian }) => {
			const leaf = app.workspace.getActiveViewOfType(obsidian.MarkdownView)?.leaf;
			if (leaf?.view instanceof obsidian.MarkdownView) {
				return leaf.view.file?.path;
			}
			return null;
		});
		expect(fileOpened).toBe("Test.md");
		// Run the command to add keys to the frontmatter
		await browser.executeObsidianCommand(`${manifest.id}:dataview-to-frontmatter`);
		// Check if the keys were added to the frontmatter
		const content = await browser.executeObsidian(({ app, obsidian }) => {
			const file = app.vault.getAbstractFileByPath("Test.md");
			if (file && file instanceof obsidian.TFile) {
				return app.vault.read(file);
			}
			return null;
		});
		expect(content).toHaveText("foo: bar\n");
	});
});
