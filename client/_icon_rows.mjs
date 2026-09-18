import sharp from 'sharp';
const fg = 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png';
const { data, info } = await sharp(fg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
// For each row, count "ink" = opaque, saturated/dark pixels (not white bg)
const rows = [];
for (let y=0;y<H;y++){
  let ink=0;
  for(let x=0;x<W;x++){
    const i=(y*W+x)*C; const r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];
    if(a<40) continue;
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
    const isWhite = (mn>228);           // near-white bg
    const sat = mx-mn;
    if(!isWhite && (sat>40 || mx<200)) ink++; // colored or dark ink
  }
  rows.push(ink);
}
// print ink profile in 24 bands
const bands=27;
for(let bnd=0;bnd<bands;bnd++){
  const y0=Math.floor(bnd*H/bands), y1=Math.floor((bnd+1)*H/bands);
  let s=0; for(let y=y0;y<y1;y++) s+=rows[y];
  const avg=s/((y1-y0)*W)*100;
  const bar='#'.repeat(Math.round(avg));
  console.log(`y ${String(y0).padStart(3)}-${String(y1).padStart(3)} (${(100*y0/H).toFixed(0).padStart(3)}%): ${avg.toFixed(1).padStart(5)}% ${bar}`);
}
