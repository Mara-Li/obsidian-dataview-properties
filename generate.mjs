import c from "ansi-colors";
import ejs from "ejs";
import fs from "node:fs";
import path from "node:path";
import prompts from "prompts";
import licenses from "spdx-license-list/full.js";
import { getLicense } from "license";
import packageJson from "./package.json" with { type: "json" };
import { execa } from "execa";
import gitUserName from "git-user-name";

// Color configuration
const { dim, reset } = c;
c.theme({
  danger: c.red,
  dark: c.dim.gray,
  disabled: c.gray,
  em: c.italic,
  heading: c.bold.underline,
  info: c.cyan,
  muted: c.dim,
  primary: c.blue,
  strong: c.bold,
  success: c.green.bold,
  underline: c.underline,
  warning: c.yellow.underline,
});

// Utility
const capitalize = (s) => typeof s === "string" ? s.charAt(0).toUpperCase() + s.slice(1) : "";

/**
 * Readdir synchronously and recursively
 * @param {string} dir
 * @returns {fs.Dirent[]}
 */
function readdirRecursiveSync(dir) {
  const results = [];
  
  function readDirRecursive(currentPath) {
    fs.readdirSync(currentPath, { withFileTypes: true }).forEach(entry => {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        readDirRecursive(fullPath);
      } else {
        results.push(entry);
      }
    });
  }
  
  readDirRecursive(dir);
  return results;
}

/**
 * Ejs template processing
 * @param {fs.Dirent|string} file - Fichier ou chemin à traiter
 * @param {Object} data - Données pour le template
 */
function processTemplate(file, data) {
  const filePath = typeof file === 'string' ? file : path.join(file.path, file.name);
  const content = fs.readFileSync(filePath, { encoding: "utf-8" });
  const processed = ejs.render(content, { data });
  
  // README special gestion
  const finalContent = filePath.endsWith('README.md') 
    ? processed.replace("{{TEMPLATE_PLACEHOLDER LOCALE}}", "<% tp.obsidian.moment.locale() %>")
    : processed;
    
  fs.writeFileSync(filePath, finalContent, { encoding: "utf-8" });
}

/**
 * Package manager detection
 * @returns {"pnpm" | "yarn" | "npm" | "bun" | undefined}
 */
function detectPackageManager() {
  if (fs.existsSync("yarn.lock")) return "yarn";
  if (fs.existsSync("pnpm-lock.yaml")) return "pnpm";
  if (fs.existsSync("package-lock.json")) return "npm";
  if (fs.existsSync("bun.lockb") || fs.existsSync("bun.lock")) return "bun";
  return undefined;
}

/**
 * Update dependencies based on the detected package manager
 * @param {"pnpm" | "npm" | "yarn" | "bun" | undefined} packageManager
 */
async function updateDependencies(packageManager) {
  if (!packageManager) {
    throw new Error("No package manager detected. Actually supported: pnpm, npm, yarn and bun");
  }
  
  const managerConfigs = {
    yarn: { cmd: "yarn", args: ["install"], replace: "yarn" },
    npm: { cmd: "npm", args: ["install"], replace: "npm" },
    pnpm: { cmd: "pnpm", args: ["install"], replace: "pnpm" },
    bun: { cmd: "bun", args: ["install"], replace: "bun" }
  };
  
  const config = managerConfigs[packageManager];
  console.log(c.info(`Package manager ${packageManager} detected, execute ${config.cmd} ${config.args.join('')}`));

  // Updating package.json for other than pnpm
  if (packageManager !== 'pnpm') {
    const pkgContent = fs.readFileSync("package.json", "utf-8");
    fs.writeFileSync(
      "package.json", 
      pkgContent.replace(/pnpm/g, config.replace),
      "utf-8"
    );
  }
  
  await execa(config.cmd, config.args);
  console.log(c.success("✅ Dependencies updated successfully!"));
}

/**
 * Generate .env file with default vault path
 * @param {string} vaultPath 
 */
function generateEnvFile(vaultPath) {
  if (!vaultPath) return;
  
  const envContent = `VAULT=${vaultPath}`;
  fs.writeFileSync(".env", envContent, { encoding: "utf-8" });
  console.log(c.success("✅ Created .env file."));
}

/**
 * Fonction principale d'exécution
 */
async function main() {
  // Plugin default based on folder
  const defaultPluginID = process.cwd()
    .split(path.sep)
    .pop()
    .toLowerCase()
    .replaceAll(" ", "-")
    .replace(/-?obsidian-?/, "");
  
  // User informations
  const answer = await prompts(
    [
      {
        type: "text",
        name: "id",
        message: `Enter the plugin id ${reset("(lower-case, without space)")}`,
        initial: defaultPluginID,
        format: (value) => value.toLowerCase().replaceAll(" ", "-"),
        validate: (value) => value.length > 0 ? true : "Please enter a valid plugin ID",
      },
      {
        type: "text",
        name: "name",
        message: "Enter the plugin name",
        initial: (prev) => prev
          .replace("obsidian-plugin", "")
          .split("-")
          .filter((word) => word.length > 0)
          .map((word) => capitalize(word))
          .join(" "),
      },
      {
        type: "text",
        name: "description",
        message: "Enter the plugin description",
      },
      {
        type: "text",
        name: "author",
        message: "Enter the author name",
        initial: gitUserName(),
      },
      {
        type: "text",
        name: "authorUrl",
        message: "Enter the author URL (optional)",
        initial: (prev) => `https://github.com/${prev}`,
      },
      {
        type: "confirm",
        name: "desktopOnly",
        message: "Is this plugin only for desktop?",
        initial: false,
      },
      {
        type: "text",
        name: "fundingUrl",
        message: "Enter the funding URL (optional)",
      },
      {
        type: "text",
        name: "vaultPath",
        message: "Enter the default vault path, used with the << --vault >> command option (optional)",
      },
      {
        type: "autocomplete",
        name: "license",
        message: `Choose the license ${reset(dim("(Tape to filter, ↑ or ↓ to navigate)"))}`,
        initial: "MIT",
        choices: Object.entries(licenses).map(([id, license]) => ({
          value: id,
          title: license.name,
          description: (license.osiApproved && "OSI Approved") || "",
        })),
      },
    ],
    {
      onCancel: () => {
        console.log(c.warning("❌ Cancelled"));
        process.exit(0);
      },
    }
  );
  
  // Préparation des données
  const data = {
    name: answer.name || "Sample Plugin",
    id: answer.id || "sample-plugin",
    description: answer.description || "This is a sample plugin",
    interfaceName: answer.name.replaceAll(" ", "") || "SamplePlugin",
    author: {
      url: answer.authorUrl || "",
      name: answer.author || "Sample Author",
    },
    isDesktopOnly: !!answer.desktopOnly,
    packageManager: detectPackageManager(),
  };
  
  if (answer.fundingUrl) {
    data.fundingUrl = answer.fundingUrl;
  }
  
  // Traitement des fichiers
  console.log(c.info("Files generations..."));
  
  // Fichiers de template
  const templateFiles = readdirRecursiveSync("./src");
  for (const file of templateFiles) {
    processTemplate(file, data);
  }
  
  // Fichiers spéciaux
  processTemplate("./manifest.json", data);
  fs.writeFileSync("manifest-beta.json", fs.readFileSync("manifest.json", { encoding: "utf-8" }), { encoding: "utf-8" });
  
  // Génération de la licence
  const license = getLicense(answer.license, {
    author: data.author.name,
    year: new Date().getFullYear(),
  });
  fs.writeFileSync("LICENSE", license, { encoding: "utf-8" });
  
  // Autres fichiers
  processTemplate("./README.md", data);
  processTemplate("./.github/workflows/ci.yaml", data);
  processTemplate("./.github/ISSUE_TEMPLATE/bug.yml", data);
  
  // Mise à jour package.json
  console.log(c.info("Updating package.json..."));
  packageJson.author = data.author.name;
  packageJson.name = data.id;
  packageJson.license = answer.license;
  packageJson.description = data.description;
  
  // Delete unwanted deps
  const depsToRemove = [
    "scripts.generate", 
    "devDependencies.@types/ejs", 
    "dependencies.ejs", 
    "dependencies.prompts",
    "dependencies.spdx-license-list", 
    "dependencies.execa", 
    "dependencies.license",
    "dependencies.git-user-name"
  ];
  
  depsToRemove.forEach(depPath => {
    const parts = depPath.split('.');
    let obj = packageJson;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) break;
      obj = obj[parts[i]];
    }
    
    if (obj) delete obj[parts[parts.length - 1]];
  });
  
  fs.writeFileSync("package.json", JSON.stringify(packageJson, null, 2), { encoding: "utf-8" });
  
  // Création fichier hotreload
  fs.writeFileSync(".hotreload", "", { encoding: "utf-8" });
  
  // Création du fichier .env si un chemin de vault est fourni
  if (answer.vaultPath) {
    generateEnvFile(answer.vaultPath);
  }
  
  // Update deps
  await updateDependencies(data.packageManager);
  
  // Clean-up
  fs.unlinkSync("generate.mjs");
  
  console.log(c.success("✅ Plugin generation done successfully!"));
}

// Exécution
main().catch(err => {
  console.error(c.danger("Error during generation:"), err);
  process.exit(1);
});
