import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Look-alike and invisible characters that copy-paste pipelines commonly
// inject, mapped to the plain ASCII the code actually needs.
const REPLACEMENTS = [
  [/\u00A0/g, " "],            // non-breaking space -> normal space
  [/[\u201C\u201D\u201E]/g, '"'], // curly double quotes -> "
  [/[\u2018\u2019\u201A]/g, "'"], // curly single quotes -> '
  [/\uFF02/g, '"'],            // fullwidth quote -> "
  [/\uFF07/g, "'"],            // fullwidth apostrophe -> '
  [/\uFF1C/g, "<"],            // fullwidth < -> 
  [/\uFF1E/g, ">"],            // fullwidth > -> >
  [/\uFF1D/g, "="],            // fullwidth = -> =
  [/\uFF08/g, "("],            // fullwidth ( -> (
  [/\uFF09/g, ")"],            // fullwidth ) -> )
  [/[\u200B\u200C\u200D\u2060\uFEFF]/g, ""], // zero-width chars -> removed
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

let touched = 0;
for (const file of walk("src")) {
  const before = readFileSync(file, "utf8");
  let after = before;
  for (const [pattern, replacement] of REPLACEMENTS) {
    after = after.replace(pattern, replacement);
  }
  if (after !== before) {
    writeFileSync(file, after, "utf8");
    console.log("fixed:", file);
    touched++;
  }
}
console.log(touched === 0 ? "No corrupted characters found." : "Repaired " + touched + " file(s).");