import { describe, expect, test } from "bun:test";
import type { DataviewApi } from "@enveloppe/obsidian-dataview";
import { Dataview } from "../../src/dataview";
import { type TextOptions, UtilsConfig } from "../../src/interfaces";
import type DataviewProperties from "../../src/main";
import { Utils } from "../../src/utils";

// Minimal fake Dataview API for testing regex prefixes
const FakeDvApi = (inlineQueryPrefix = "=", inlineJsQueryPrefix = "$=") => ({
	settings: { inlineQueryPrefix, inlineJsQueryPrefix },
});

describe("Dataview helpers", () => {
	test("containsDvQuery should detect DQL and DJS patterns", () => {
		const dvApi = FakeDvApi() as unknown as DataviewApi;
		const utils = new Utils({ ignoreAccents: false, lowerCase: false });
		const fakePlugin = { settings: {}, utils } as unknown as DataviewProperties;
		const dv = new Dataview(dvApi, "path.md", fakePlugin);

		expect(dv.containsDvQuery("`= 1 + 2`")).toBe(true);
		expect(dv.containsDvQuery("`$= dv.pages()`")).toBe(true);
		expect(dv.containsDvQuery("plain text")).toBe(false);
	});

	test("onlyModeAllowsField respects DQL detection and forceFields", async () => {
		const dvApi = FakeDvApi() as unknown as DataviewApi;
		const utils = new Utils({ ignoreAccents: false, lowerCase: true });
		const pluginSettings = {
			onlyMode: {
				enable: true,
				forceFields: { fields: ["force_me"], lowerCase: true, ignoreAccents: false },
			},
		} as const;
		const fakePlugin = {
			settings: pluginSettings,
			utils,
		} as unknown as DataviewProperties;

		// register OnlyMode config in utils so processString will use it when selected
		utils.setConfig(
			UtilsConfig.OnlyMode,
			(pluginSettings as unknown as { onlyMode: { forceFields: TextOptions } }).onlyMode
				.forceFields as TextOptions
		);

		const dv = new Dataview(dvApi, "path.md", fakePlugin);

		// DQL in value -> allowed
		expect(await dv.onlyModeAllowsField("b", "`= 1 + 2`")).toBe(true);

		// forced field name -> allowed
		expect(await dv.onlyModeAllowsField("force_me", "plain")).toBe(true);

		// not forced and not a query -> denied
		expect(await dv.onlyModeAllowsField("other", "plain")).toBe(false);
	});

	test("onlyModeAllowsField inspects source file when pageData is already evaluated", async () => {
		const dvApi = FakeDvApi() as unknown as DataviewApi;
		const utils = new Utils({ ignoreAccents: false, lowerCase: true });
		const pluginSettings = {
			onlyMode: {
				enable: true,
				forceFields: { fields: [], lowerCase: true, ignoreAccents: false },
			},
		} as const;

		const fakeVault = {
			getAbstractFileByPath: (_: string) => ({ path: "path.md" }),
			read: async (_f: unknown) => "c:: `= this.b + 3`\n",
		} as unknown as {
			getAbstractFileByPath: (p: string) => unknown;
			read: (f: unknown) => Promise<string>;
		};

		const fakePlugin = {
			settings: pluginSettings,
			utils,
			app: { vault: fakeVault },
		} as unknown as DataviewProperties;
		const dv = new Dataview(dvApi, "path.md", fakePlugin);

		// pageData already evaluated to a number, but source contains inline query
		expect(await dv.onlyModeAllowsField("c", 6)).toBe(true);

		// evaluateInline should substitute this.b with the evaluated value
		const res = await dv.evaluateInline("`= this.b + 3`", "c", { b: 3 });
		expect(res).toBe(6);
	});
});
