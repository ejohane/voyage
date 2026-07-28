import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const pluginRoot = resolve(root, "plugins/voyage");
const manifest = JSON.parse(readFileSync(resolve(pluginRoot, ".codex-plugin/plugin.json"), "utf8"));
const mcp = JSON.parse(readFileSync(resolve(pluginRoot, ".mcp.json"), "utf8"));
const skill = readFileSync(resolve(pluginRoot, "skills/plan-with-voyage/SKILL.md"), "utf8");

if (manifest.name !== "voyage" || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
  throw new Error("Voyage plugin name and semantic version are required.");
}
if (manifest.author?.name !== "Erik Johansson") {
  throw new Error("Voyage plugin publisher metadata is missing.");
}
if (manifest.interface?.privacyPolicyURL !== "https://voyageplan.app/privacy") {
  throw new Error("Voyage plugin must advertise the production privacy policy.");
}
if (manifest.interface?.termsOfServiceURL !== "https://voyageplan.app/terms") {
  throw new Error("Voyage plugin must advertise the production terms.");
}
if (
  !Array.isArray(manifest.interface?.defaultPrompt) ||
  manifest.interface.defaultPrompt.length < 1 ||
  manifest.interface.defaultPrompt.length > 3 ||
  manifest.interface.defaultPrompt.some((prompt) => prompt.length > 128)
) {
  throw new Error("Voyage plugin needs one to three starter prompts of at most 128 characters.");
}
if (mcp.mcpServers?.voyage?.url !== "https://mcp.voyageplan.app/mcp") {
  throw new Error("Voyage plugin must use the production MCP endpoint.");
}
for (const path of [manifest.interface.composerIcon, manifest.interface.logo]) {
  if (!path?.startsWith("./") || !existsSync(resolve(pluginRoot, path))) {
    throw new Error(`Voyage plugin asset is missing: ${path}`);
  }
}
if (!skill.startsWith("---\nname: plan-with-voyage\n") || skill.includes("[TODO:")) {
  throw new Error("Voyage planning skill metadata is invalid or incomplete.");
}

console.log("Validated the Voyage plugin manifest, MCP endpoint, assets, and planning skill.");
