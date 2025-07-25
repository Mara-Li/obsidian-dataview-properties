import * as path from "node:path";
import * as os from "node:os";
import dotenv from "dotenv";
import { obsidianBetaAvailable, resolveObsidianVersions } from "wdio-obsidian-service";
const cacheDir = path.resolve(os.tmpdir(), ".obsidian-cache");
dotenv.config();

console.log(`Using obsidian vault: ${process.env.VAULT_TEST}`);
console.log(`Using obsidian cache dir: ${cacheDir}`);

let versions: [string, string][]; // [appVersion, installerVersion][]
if (process.env.OBSIDIAN_VERSIONS) {
	// Space separated list of appVersion/installerVersion, e.g. "1.7.7/latest latest/earliest"
	versions = process.env.OBSIDIAN_VERSIONS.split(/[ ,]+/).map((v) => {
		const [app, installer = "earliest"] = v.split("/"); // default to earliest installer
		return [app, installer];
	});
} else if (process.env.CI) {
	// Running in GitHub CI. You can use RUNNER_OS to select different versions on different
	// platforms in the workflow matrix if you want
	versions = [["latest", "latest"]];
	if (await obsidianBetaAvailable(cacheDir)) {
		versions.push(["latest-beta", "latest"]);
	}

	// Print the resolved Obsidian versions to use as the workflow cache key
	// (see .github/workflows/test.yaml)
	for (let [app, installer] of versions) {
		[app, installer] = await resolveObsidianVersions(app, installer, cacheDir);
		console.log(`${app}/${installer}`);
	}
} else {
	versions = [["latest", "latest"]];
}

export const config: WebdriverIO.Config = {
	runner: "local",

	specs: ["./tests/specs/**/*.e2e.ts"],
	maxInstances: 4,

	capabilities: versions.map(([appVersion, installerVersion]) => ({
		browserName: "obsidian",
		browserVersion: appVersion,
		"wdio:obsidianOptions": {
			installerVersion: installerVersion,
			plugins: ["./dist", { id: "dataview" }],
			// If you need to switch between multiple vaults, you can omit this and use
			// `reloadObsidian` to open vaults during the test.
			vault: process.env.VAULT_TEST,
		},
	})),

	framework: "mocha",
	services: ["obsidian"],
	reporters: ["obsidian"],

	mochaOpts: {
		ui: "bdd",
		timeout: 60000,
	},

	waitforInterval: 250,
	waitforTimeout: 5 * 1000,

	cacheDir: cacheDir,

	logLevel: "warn",
};
