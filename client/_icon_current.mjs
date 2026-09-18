import sharp from 'sharp';
const FG = 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png';
const S = 432, out='_icon_candidates';
const rsq = Math.round(S*0.235);
const maskSquircle = Buffer.from(`<svg width="${S}" height="${S}"><rect width="${S}" height="${S}" rx="${rsq}" ry="${rsq}" fill="#fff"/></svg>`);
const maskCircle = Buffer.from(`<svg width="${S}" height="${S}"><circle cx="${S/2}" cy="${S/2}" r="${S/2}" fill="#fff"/></svg>`);
// CURRENT adaptive: white bg + full-bleed foreground (the foreground is 432 already)
const fg = await sharp(FG).resize(S,S).toBuffer();
const composed = await sharp({create:{width:S,height:S,channels:4,background:'#FFFFFF'}}).composite([{input:fg}]).png().toBuffer();
await sharp(composed).composite([{input:maskSquircle,blend:'dest-in'}]).png().toFile(`${out}/CUR_squircle.png`);
await sharp(composed).composite([{input:maskCircle,blend:'dest-in'}]).png().toFile(`${out}/CUR_circle.png`);

// Probe shadow: is there grey ring in RGB, or is edge alpha? sample column x=216 (center) top rows, and x near card corner
const {data,info}=await sharp(FG).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const W=info.width,C=info.channels;
function px(x,y){const i=(y*W+x)*C;return [data[i],data[i+1],data[i+2],data[i+3]];}
console.log('Top-center column samples (x=216): y, [r,g,b,a]');
for(const y of [0,10,18,22,26,30,40]) console.log(' y='+y, px(216,y));
console.log('Left edge row samples (y=216): x, [r,g,b,a]');
for(const x of [0,10,18,22,26,30,40]) console.log(' x='+x, px(x,216));
console.log('Corner (near 22,22):');
for(const [x,y] of [[18,18],[22,22],[26,26],[30,30],[40,40]]) console.log(' ',x,y, px(x,y));
