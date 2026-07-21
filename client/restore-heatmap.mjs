import { readFileSync, writeFileSync } from "node:fs";

const b64 = readFileSync("heatmap.b64", "utf8").replace(/\s+/g, "");
const code = Buffer.from(b64, "base64").toString("utf8");
writeFileSync("src/features/super-admin/pages/SuperAdminHeatmap.tsx", code, "utf8");
console.log("SuperAdminHeatmap.tsx restored, " + code.length + " bytes.");