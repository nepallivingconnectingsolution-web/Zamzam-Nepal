import sharp from 'sharp';
const SRC='android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png';
const S=432,out='_icon_candidates';
const rsq=Math.round(S*0.235);
const mask=Buffer.from(`<svg width="${S}" height="${S}"><rect width="${S}" height="${S}" rx="${rsq}" ry="${rsq}" fill="#fff"/></svg>`);
const circle=Buffer.from(`<svg width="${S}" height="${S}"><circle cx="${S/2}" cy="${S/2}" r="${S/2}" fill="#fff"/></svg>`);
const card=await sharp(SRC).trim({threshold:10}).toBuffer(); // 389 tight card

// A1: inset 74% on solid color-matched bg
{
  const t=Math.round(S*0.74);
  const inner=await sharp(card).resize({width:t,height:t,fit:'inside'}).toBuffer();
  const comp=await sharp({create:{width:S,height:S,channels:4,background:'#F4F8FD'}})
    .composite([{input:inner,gravity:'center'}]).png().toBuffer();
  await sharp(comp).composite([{input:mask,blend:'dest-in'}]).png().toFile(`${out}/A1_solid_sq.png`);
  await sharp(comp).composite([{input:circle,blend:'dest-in'}]).png().toFile(`${out}/A1_solid_circle.png`);
}
// A2: soft full-bleed backdrop derived from card (swooshes bleed softly) + crisp inset
{
  const bg=await sharp(card).resize(Math.round(S*1.18),Math.round(S*1.18),{fit:'cover'})
    .extract({left:Math.round(S*0.09),top:Math.round(S*0.09),width:S,height:S})
    .blur(22).modulate({brightness:1.06,saturation:0.9}).toBuffer();
  const t=Math.round(S*0.72);
  const inner=await sharp(card).resize({width:t,height:t,fit:'inside'}).toBuffer();
  const comp=await sharp(bg).composite([{input:inner,gravity:'center'}]).png().toBuffer();
  await sharp(comp).composite([{input:mask,blend:'dest-in'}]).png().toFile(`${out}/A2_backdrop_sq.png`);
}
console.log('done');
