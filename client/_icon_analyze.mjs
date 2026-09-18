import sharp from 'sharp';
const densities = ['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi'];
const base = 'android/app/src/main/res/mipmap-';
for (const d of densities) {
  for (const name of ['ic_launcher','ic_launcher_foreground','ic_launcher_round']) {
    try {
      const m = await sharp(`${base}${d}/${name}.png`).metadata();
      console.log(`${d}/${name}: ${m.width}x${m.height} ch=${m.channels} alpha=${m.hasAlpha}`);
    } catch(e) { console.log(`${d}/${name}: MISSING`); }
  }
}
const fg = 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png';
const img = sharp(fg);
const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
let minX=W,minY=H,maxX=0,maxY=0, transparentPx=0, total=W*H;
for (let y=0;y<H;y++){for(let x=0;x<W;x++){const i=(y*W+x)*C; const a=data[i+3]; if(a<10){transparentPx++;continue;} if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y;}}
console.log(`\nFOREGROUND ${W}x${H}: opaque bbox = x[${minX}..${maxX}] y[${minY}..${maxY}] (w=${maxX-minX+1} h=${maxY-minY+1}) transparent=${(100*transparentPx/total).toFixed(1)}%`);
console.log(`Content fills ${(100*(maxX-minX+1)/W).toFixed(0)}% width, ${(100*(maxY-minY+1)/H).toFixed(0)}% height`);
