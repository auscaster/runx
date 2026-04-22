import fs from "node:fs";
import path from "node:path";

const inputs = JSON.parse(process.env.RUNX_INPUTS_JSON || "{}");
const callerRoot = process.env.RUNX_CWD || process.cwd();
const repoRoot = path.resolve(callerRoot, String(inputs.repo_root || "."));
const hasScafld = fs.existsSync(path.join(repoRoot, ".ai"));
const packageJsonPath = path.join(repoRoot, "package.json");
const packageJson = fs.existsSync(packageJsonPath)
  ? JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
  : null;
const languages = [];

if (packageJson) {
  languages.push("javascript");
}
if (fs.existsSync(path.join(repoRoot, "pnpm-workspace.yaml"))) {
  languages.push("typescript");
}

process.stdout.write(JSON.stringify({
  repo_profile: {
    root: repoRoot,
    has_scafld: hasScafld,
    languages,
    risk_signals: hasScafld ? [] : ["missing_scafld"],
  },
}));
