import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import * as fs from "fs";
import * as path from "path";

const manifest = JSON.parse(
	fs.readFileSync(`${path.resolve(__dirname, "..", "..", "manifest.json")}`, "utf-8")
) as { id: string; name: string; version: string };

console.log(`Running tests for ${manifest.name} v${manifest.version}`);

const folder = path.resolve(__dirname, "..");
const fixtures = path.resolve(folder, "fixtures");

describe("Test my plugin", function () {
	beforeEach(async function () {
		await obsidianPage.resetVault();
	});
	it("plugins should be loaded", async function () {
		// Check if the plugin is loaded in the vault
		const pluginIsLoaded = await browser.executeObsidian(
			({ app, obsidian }, pluginId) => {
				return (
					app.plugins.getPlugin(pluginId)?._loaded &&
					app.plugins.getPlugin("dataview")?._loaded
				);
			},
			manifest.id
		);
		expect(pluginIsLoaded).toBe(true);
	});

	it("List all files in the vault", async function () {
		// List all files in the vault
		const files = await browser.executeObsidian(({ app }) => {
			return app.vault.getMarkdownFiles().map((file) => file.path);
		});
		expect(files).toContain("Bienvenue.md");
	});

	it("should add the keys to an empty frontmatter", async function () {
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
		expect(content).toContain("---\nfoo: bar\n---");
	});
});
