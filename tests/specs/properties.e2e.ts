import type DataviewPlugin from "@enveloppe/obsidian-dataview/lib/main";
import { browser, expect } from "@wdio/globals";
import * as fs from "fs";
import * as path from "path";
import { obsidianPage } from "wdio-obsidian-service";
import { type DataviewPropertiesSettings, DEFAULT_SETTINGS } from "../../src/interfaces";
import type DataviewProperties from "../../src/main";

const manifest = JSON.parse(
	fs.readFileSync(`${path.resolve(__dirname, "..", "..", "manifest.json")}`, "utf-8")
) as { id: string; name: string; version: string };

console.log(`Running tests for ${manifest.name} v${manifest.version}`);

const folder = path.resolve(__dirname, "..");
const fixtures = path.resolve(folder, "fixtures");
const expected = path.resolve(folder, "expected");

describe("Dataview Properties Plugin E2E Tests", function () {
	beforeEach(async function () {
		await obsidianPage.resetVault();
		//reset the settings of the plugin
		await browser.executeObsidian(
			({ app }, pluginId, defaultSettings: DataviewPropertiesSettings) => {
				const plugin = app.plugins.getPlugin(pluginId) as DataviewProperties;
				if (plugin) {
					plugin.settings = defaultSettings;
					plugin.saveSettings();
				}
			},
			manifest.id,
			DEFAULT_SETTINGS
		);
	});

	function normalizeContent(content: string): string {
		return content
			.replace(/---\s+/g, "---")
			.replace(/\s+---/g, "---")
			.replace(/\s+/g, " ")
			.trim();
	}

	function getExceptedContent(fileName: string) {
		const content = fs.readFileSync(`${expected}/${fileName}`, "utf-8");
		return normalizeContent(content);
	}

	/**
	 * Helper function to create a test file and run the plugin command
	 */
	async function runTestWithFixture(fixtureName: string, fileName: string) {
		// Read the fixture content
		const fixtureContent = fs.readFileSync(`${fixtures}/${fixtureName}`, "utf-8");

		// Create a new note with the fixture content
		await browser.executeObsidian(
			async ({ app }, content, fileName) => {
				await app.vault.create(fileName, content);
			},
			fixtureContent,
			fileName
		);

		// Open the file
		await obsidianPage.openFile(fileName);

		// Verify that the file is opened
		const fileOpened = await browser.executeObsidian(({ app, obsidian }) => {
			const leaf = app.workspace.getActiveViewOfType(obsidian.MarkdownView)?.leaf;
			if (leaf?.view instanceof obsidian.MarkdownView) {
				return leaf.view.file?.path;
			}
			return null;
		});

		expect(fileOpened).toBe(fileName);

		// Run the command to add keys to the frontmatter
		await browser.executeObsidianCommand(`${manifest.id}:dataview-to-frontmatter`);
		//wait for the command to finish
		await browser.pause(500);

		// Get the updated content
		return await browser.executeObsidian(({ app, obsidian }, fileName) => {
			const file = app.vault.getAbstractFileByPath(fileName);
			if (file && file instanceof obsidian.TFile) {
				return app.vault.read(file);
			}
			return "";
		}, fileName);
	}

	it("Should have default settings", async function () {
		// Check if the plugin is loaded
		const dvPluginT = await browser.executeObsidian(({ app }, pluginId) => {
			const plug = app.plugins.getPlugin(pluginId) as DataviewProperties | undefined;
			if (!plug) {
				return null;
			}
			return plug.settings;
		}, manifest.id);
		expect(dvPluginT).not.toBeNull();
		if (!dvPluginT) {
			return;
		}
		expect(dvPluginT).toEqual(DEFAULT_SETTINGS);
		expect(dvPluginT.prefix).toEqual("dv_");
	});

	it("Should have the same manifest version as the plugin", async function () {
		const dvPluginT = await browser.executeObsidian(({ app }, pluginId) => {
			const plug = app.plugins.getPlugin(pluginId) as DataviewProperties | undefined;
			if (!plug) {
				return null;
			}
			return plug.manifest.version;
		}, manifest.id);
		expect(dvPluginT).not.toBeNull();
		expect(dvPluginT).toEqual(manifest.version);
		console.log(dvPluginT);
	});

	it("should add properties to existing frontmatter", async function () {
		const fileName = "existing_frontmatter.md";
		const content = await runTestWithFixture(fileName, "ExistingFrontmatter.md");

		// Compare frontmatter content (ignoring whitespace differences)
		expect(normalizeContent(content)).toEqual(getExceptedContent(fileName));
	});

	it("should respect ignored fields configuration", async function () {
		// Configure plugin to ignore specific fields
		await browser.executeObsidian(({ app }, pluginId) => {
			const plugin = app.plugins.getPlugin(pluginId) as DataviewProperties;
			if (plugin) {
				plugin.settings.ignoreFields.fields = ["ignored", "test", "/^prefix.*/i"];
				plugin.saveSettings();
			}
		}, manifest.id);

		const content = await runTestWithFixture("ignored_fields.md", "IgnoredFields.md");

		// Verify only non-ignored fields are added
		expect(normalizeContent(content)).toEqual(getExceptedContent("ignored_fields.md"));
	});

	it("should handle case sensitivity and accents correctly", async function () {
		// Configure plugin to be case insensitive and ignore accents
		const content = await runTestWithFixture("case_sensitivity.md", "CaseSensitivity.md");
		expect(normalizeContent(content)).toEqual(getExceptedContent("case_sensitivity.md"));
	});

	it("should not update when values are identical", async function () {
		const content = await runTestWithFixture("identical_values.md", "IdenticalValues.md");

		// Verify that identical values aren't changed and new values are added
		expect(normalizeContent(content)).toEqual(getExceptedContent("identical_values.md"));
	});

	it("should clean up values based on configuration", async function () {
		// Configure plugin to clean up specific terms
		await browser.executeObsidian(({ app }, pluginId) => {
			const plugin = app.plugins.getPlugin(pluginId) as DataviewProperties;
			if (plugin) {
				plugin.settings.cleanUpText.fields = ["épreuve", "/test\\d+test/g"];
				plugin.settings.cleanUpText.ignoreAccents = true;
				plugin.settings.cleanUpText.lowerCase = true;
				plugin.saveSettings();
			}
		}, manifest.id);

		const content = await runTestWithFixture("cleanup_values.md", "CleanupValues.md");

		// Verify that value is cleaned up
		expect(normalizeContent(content)).toEqual(getExceptedContent("cleanup_values.md"));
	});

	it("should not modify files without dataview properties", async function () {
		const fileName = "no_properties.md";
		const content = await runTestWithFixture(fileName, "NoProperties.md");
		expect(normalizeContent(content)).toEqual(getExceptedContent(fileName));
	});

	it("Should add the calculated field to the frontmatter", async function () {
		const fileName = "calc.md";
		const content = await runTestWithFixture(fileName, "Calc.md");
		expect(normalizeContent(content)).toEqual(getExceptedContent(fileName));
	});

	it("Should not create duplicate fields when a fields has space", async function () {
		const fileName = "space_fields.md";
		const content = await runTestWithFixture(fileName, "SpaceFields.md");
		expect(normalizeContent(content)).toEqual(getExceptedContent(fileName));
	});

	it("Should not process this file", async function () {
		const fileName = "excluded_file.md";
		const content = await runTestWithFixture(fileName, "ExcludedFile.md");
		expect(normalizeContent(content)).toEqual(getExceptedContent(fileName));
	});

	describe("List properties", function () {
		it("Should be a list in properties", async function () {
			const fileName = "lists.md";
			const content = await runTestWithFixture(fileName, "Lists.md");
			expect(normalizeContent(content)).toEqual(getExceptedContent(fileName));
		});
		it("Should markdownify lists in properties", async function () {
			const fileName = "markdownify_lists.md";
			const content = await runTestWithFixture(fileName, "MarkdownifyLists.md");
			expect(normalizeContent(content)).toEqual(getExceptedContent(fileName));
		});
		it("Should populate with a list from dataviewjs", async function () {
			const fileName = "dv_list.md";
			//enable dataviewjs
			await browser.executeObsidian(({ app }, pluginId) => {
				const plugin = app.plugins.getPlugin(pluginId) as DataviewPlugin;
				if (plugin) {
					plugin.settings.enableDataviewJs = true;
					plugin.updateSettings(plugin.settings);
				}
			}, "dataview");
			const content = await runTestWithFixture(fileName, "DataviewList.md");
			expect(normalizeContent(content)).toEqual(getExceptedContent(fileName));
		});
	});
});
