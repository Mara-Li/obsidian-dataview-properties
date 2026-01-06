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

for (const option of ["default", "unflatted"]) {
	const settings: DataviewPropertiesSettings =
		option === "default"
			? DEFAULT_SETTINGS
			: Object.assign({}, DEFAULT_SETTINGS, {
					unflatten: {
						enabled: true,
						separator: "__",
					},
				});

	describe(`Dataview Properties Plugin E2E Tests (${option})`, () => {
		beforeEach(async () => {
			await obsidianPage.resetVault();
			// reset plugin settings
			await browser.executeObsidian(
				({ app }, pluginId, defaultSettings: DataviewPropertiesSettings) => {
					const plugin = app.plugins.getPlugin(pluginId) as DataviewProperties;
					if (plugin) {
						plugin.settings = defaultSettings;
						plugin.saveSettings();
					}
				},
				manifest.id,
				settings
			);
		});

		function normalizeContent(content: string): string {
			return content
				.replace(/---\s+/g, "---")
				.replace(/\s+---/g, "---")
				.replace(/\s+/g, " ")
				.trim();
		}

		function getExpectedContent(fileName: string) {
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
			// wait for the command to finish
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

		it("Should have the settings assignated", async () => {
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
			expect(dvPluginT).toEqual(settings);
			expect(dvPluginT.prefix).toEqual("dv_");
		});

		it("Should have the same manifest version as the plugin", async () => {
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

		// Découverte automatique des tests à partir des fichiers présents
		const allFixtures = fs
			.readdirSync(fixtures)
			.filter((f) => f.toLowerCase().endsWith(".md"));
		const runnable = allFixtures.filter((f) => fs.existsSync(path.join(expected, f)));

		for (const fileName of runnable) {
			// nested.md n'est pertinent que pour l'option unflatted
			if (fileName === "nested.md" && option === "default") continue;

			it(`should process ${fileName}`, async () => {
				// Pré-configurations spécifiques par fichier
				if (fileName === "ignored_fields.md") {
					await browser.executeObsidian(({ app }, pluginId) => {
						const plugin = app.plugins.getPlugin(pluginId) as DataviewProperties;
						if (plugin) {
							plugin.settings.ignoreFields.fields = ["ignored", "test", "/^prefix.*/i"];
							plugin.saveSettings();
						}
					}, manifest.id);
				}

				if (fileName === "cleanup_values.md") {
					await browser.executeObsidian(({ app }, pluginId) => {
						const plugin = app.plugins.getPlugin(pluginId) as DataviewProperties;
						if (plugin) {
							plugin.settings.cleanUpText.fields = ["épreuve", "/test\\d+test/g"];
							plugin.settings.cleanUpText.ignoreAccents = true;
							plugin.settings.cleanUpText.lowerCase = true;
							plugin.saveSettings();
						}
					}, manifest.id);
				}

				if (fileName === "dv_list.md") {
					// Activer dataviewjs dans le plugin Dataview
					await browser.executeObsidian(({ app }, pluginId) => {
						const plugin = app.plugins.getPlugin(pluginId) as DataviewPlugin;
						if (plugin) {
							plugin.settings.enableDataviewJs = true;
							plugin.updateSettings(plugin.settings);
						}
					}, "dataview");
				}
				if (fileName === "ReplaceExpressions.md") {
					await browser.executeObsidian(({ app }, pluginId) => {
						const plugin = app.plugins.getPlugin(pluginId) as DataviewProperties;
						if (plugin) {
							//update the configuration here
							plugin.settings.replaceInlineFieldsWith.enabled = true;
							plugin.saveSettings();
						}
					}, manifest.id);
				}
				const content = await runTestWithFixture(fileName, fileName);
				expect(normalizeContent(content)).toEqual(getExpectedContent(fileName));
			});
		}
	});
}
