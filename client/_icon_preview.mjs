import sharp from 'sharp';
const SRC = 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png';
const S = 432;
const out = '_icon_candidates';
import { mkdirSync } from 'fs';
mkdirSync(out, { recursive: true });

// rounded-square mask (approx launcher squircle)
const r = Math.round(S*0.235);
const maskSvg = Buffer.from(`<svg width="${S}" height="${S}"><rect x="0" y="0" width="${S}" height="${S}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);

async function mask(buf){
  return sharp(buf).composite([{ input: maskSvg, blend: 'dest-in' }]).png().toBuffer();
}
// trim source art to its opaque bbox
const trimmed = await sharp(SRC).trim({ threshold: 10 }).toBuffer();
const tm = await sharp(trimmed).metadata();
console.log('trimmed full art:', tm.width, 'x', tm.height);

// --- Candidate A: full logo (incl wordmark) fit to 66% safe zone on white ---
{
  const target = Math.round(S*0.66);
  const inner = await sharp(trimmed).resize({ width: target, height: target, fit: 'inside' }).toBuffer();
  const canvas = sharp({ create: { width: S, height: S, channels: 4, background: '#FFFFFF' } });
  const comp = await canvas.composite([{ input: inner, gravity: 'center' }]).png().toBuffer();
  await sharp(await mask(comp)).toFile(`${out}/A_full_white.png`);
}

// --- crop to MARK only (drop wordmark band ~ below 72% of art height) ---
const cutY = Math.round(tm.height*0.72);
const markCrop = await sharp(trimmed).extract({ left:0, top:0, width: tm.width, height: cutY }).trim({ threshold: 10 }).toBuffer();
const mm = await sharp(markCrop).metadata();
console.log('mark crop:', mm.width, 'x', mm.height);

// --- Candidate B: mark only on white, filling ~74% ---
{
  const target = Math.round(S*0.74);
  const inner = await sharp(markCrop).resize({ width: target, height: target, fit: 'inside' }).toBuffer();
  const comp = await sharp({ create: { width: S, height: S, channels: 4, background: '#FFFFFF' } })
    .composite([{ input: inner, gravity: 'center' }]).png().toBuffer();
  await sharp(await mask(comp)).toFile(`${out}/B_mark_white.png`);
}

// --- Candidate C: mark only on blue brand gradient ---
{
  const target = Math.round(S*0.72);
  const inner = await sharp(markCrop).resize({ width: target, height: target, fit: 'inside' }).toBuffer();
  const grad = Buffer.from(`<svg width="${S}" height="${S}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2B9DF4"/><stop offset="1" stop-color="#1560D8"/></linearGradient></defs><rect width="${S}" height="${S}" fill="url(#g)"/></svg>`);
  const comp = await sharp(grad).png().composite([{ input: inner, gravity: 'center' }]).png().toBuffer();
  await sharp(await mask(comp)).toFile(`${out}/C_mark_bluegrad.png`);
}
console.log('done -> _icon_candidates/');
