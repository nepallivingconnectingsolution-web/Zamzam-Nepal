/**
 * Turn the raw service illustrations (multi-MB, ~3:2) into small square
 * webp tiles the app can ship. Source art lives in design/service-icons-source
 * (kept out of src/ so it never enters the bundle); outputs go to
 * src/assets/services/<id>.webp and are imported by src/assets/services/index.ts.
 *
 * Run: node scripts/optimize-service-icons.mjs
 *
 * Filenames in the source dir must be the service id (taxi.png, bike.png, …)
 * because that id is what the app keys the image map on.
 */
import sharp from "sharp";
import { readdir, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, basename } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(here, "..", "design", "service-icons-source");
const OUT_DIR = join(here, "..", "src", "assets", "services");
const SIZE = 256;

// The grid uses a square cover-crop, so a centre crop clips whatever sits off
// to the sides. Override the crop focus per image where the subject isn't
// centred; tuned by eye against the generated tiles.
const POSITION = {
  // e.g. bike: "right", food: "left"
};

const files = (await readdir(SRC_DIR)).filter((f) => /\.(png|jpe?g)$/i.test(f));
await mkdir(OUT_DIR, { recursive: true });

for (const file of files.sort()) {
  const id = basename(file, extname(file));
  const position = POSITION[id] ?? "centre";
  const info = await sharp(join(SRC_DIR, file))
    .resize(SIZE, SIZE, { fit: "cover", position })
    .webp({ quality: 82 })
    .toFile(join(OUT_DIR, `${id}.webp`));
  console.log(`${id.padEnd(9)} ${file} -> ${id}.webp  ${(info.size / 1024).toFixed(1)}KB  pos=${position}`);
}
