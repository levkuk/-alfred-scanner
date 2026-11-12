/* Альфред Сканер — автономная обработка изображений, без внешних библиотек */
(function(global){
'use strict';
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const area=q=>Math.abs(q.reduce((s,p,i)=>s+p[0]*q[(i+1)%4][1]-p[1]*q[(i+1)%4][0],0))/2;
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const quantile=(a,q)=>{const s=Array.from(a).sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(q*(s.length-1)))];};
function components(mask,w,h){
 const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let out=[];
 for(let idx=0;idx<mask.length;idx++){
  if(!mask[idx]||seen[idx])continue;let head=0,tail=1;queue[0]=idx;seen[idx]=1;
  let n=0,minX=w,minY=h,maxX=0,maxY=0,ext=[[Infinity,null],[-Infinity,null],[-Infinity,null],[Infinity,null]],touch=0;
  while(head<tail){const p=queue[head++],x=p%w,y=(p/w)|0;n++;
   if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
   if(x===0||x===w-1||y===0||y===h-1)touch++;
   const vals=[x+y,x-y,x+y,x-y];
   if(vals[0]<ext[0][0])ext[0]=[vals[0],[x,y]];
   if(vals[1]>ext[1][0])ext[1]=[vals[1],[x,y]];
   if(vals[2]>ext[2][0])ext[2]=[vals[2],[x,y]];
   if(vals[3]<ext[3][0])ext[3]=[vals[3],[x,y]];
   const ns=[x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1];
   for(let i=0;i<4;i++){let j=ns[i];if(j>=0&&mask[j]&&!seen[j]){seen[j]=1;queue[tail++]=j;}}
  }
  if(n>w*h*.055){const q=ext.map(e=>e[1]);out.push({n,minX,minY,maxX,maxY,touch,quad:q,quadArea:area(q),density:n/((maxX-minX+1)*(maxY-minY+1))});}
 }
 return out;
}
function detect(image){
 const w=Math.min(440,Math.max(100,Math.round(image.width*440/Math.max(image.width,image.height))));
 const h=Math.min(440,Math.max(100,Math.round(image.height*440/Math.max(image.width,image.height))));
 const c=canvas(w,h),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,w,h);
 const pix=ctx.getImageData(0,0,w,h).data,l=new Uint8Array(w*h),chroma=new Uint8Array(w*h),border=[],center=[];
 const step=Math.max(1,Math.floor(Math.max(w,h)/95));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,j=i*4,r=pix[j],g=pix[j+1],b=pix[j+2];l[i]=.299*r+.587*g+.114*b;
  chroma[i]=Math.max(r,g,b)-Math.min(r,g,b);
  if(x%step===0&&y%step===0){if(x<w*.09||x>w*.91||y<h*.07||y>h*.93)border.push(l[i]);else center.push(l[i]);}
 }
 if(!border.length||!center.length)return {found:false,corners:null,confidence:0,reason:'Недостаточно данных'};
 const bg=quantile(border,.5),bright=quantile(center,.82),highest=quantile(center,.96),gap=bright-bg;
 // Пробуем несколько порогов, поскольку оттенки бумаги и освещение отличаются.
 const thresholds=Array.from(new Set([bg+gap*.32,bg+gap*.46,Math.min(highest-17,bg+gap*.23),145,165].map(x=>Math.round(clamp(x,75,228)))));
 let best=null;
 for(const t of thresholds){
  const mask=new Uint8Array(w*h);
  for(let i=0;i<mask.length;i++){
   // Нейтральный светлый лист: светлее поверхности и без сильного цветового оттенка.
   mask[i]=(l[i]>t && chroma[i]<75)?1:0;
  }
  // Закрытие разрывов на бумаге и вокруг мелкого текста: большинство таких разрывов незначительно.
  const dil=new Uint8Array(w*h);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
   let i=y*w+x;if(mask[i]||mask[i-1]||mask[i+1]||mask[i-w]||mask[i+w])dil[i]=1;
  }
  const closed=new Uint8Array(w*h);
  for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
   let i=y*w+x;if(dil[i]&&dil[i-1]&&dil[i+1]&&dil[i-w]&&dil[i+w])closed[i]=1;
  }
  for(const cc of components(closed,w,h)){
   const q=cc.quad,pa=cc.quadArea/(w*h),bw=cc.maxX-cc.minX,bh=cc.maxY-cc.minY;
   const hlen=(distance(q[0],q[3])+distance(q[1],q[2]))/2;
   const wlen=(distance(q[0],q[1])+distance(q[3],q[2]))/2;
   const aspect=wlen/(hlen||1),ratio=cc.n/(w*h);
   if(pa<.13||pa>.92||ratio<.10||bw<w*.30||bh<h*.30||cc.density<.37||aspect<.30||aspect>3.2)continue;
   if(new Set(q.map(p=>p.join(','))).size!==4)continue;
   const margin=Math.min(...q.map(p=>Math.min(p[0],p[1],w-1-p[0],h-1-p[1])));
   const touchesPenalty=cc.touch>Math.max(25,.12*(w+h))?.18:0;
   const score=pa*.44+Math.min(.25,(bright-bg)/230)+Math.min(.20,cc.density*.20)+Math.min(.14,margin/Math.min(w,h)) - touchesPenalty;
   if(!best||score>best.score)best={score,q,pa,ratio,margin,threshold:t,density:cc.density};
  }
 }
 if(!best||gap<15)return {found:false,corners:null,confidence:0,reason:'Лист слабо отличается от фона'};
 const corners=best.q.map(([x,y])=>[clamp(x/(w-1)),clamp(y/(h-1))]);
 // Не считаем границы надёжными, если лист упирается в кадр или сильное слияние с фоном.
 const confidence=clamp(.38+best.pa*.5+Math.min(.18,gap/300)-(best.margin<=2?.25:0));
 return {found:confidence>=.58,corners,confidence,reason:confidence>=.58?'Предварительные границы найдены':'Границы требуют проверки'};
}
function solve(A,b){const n=b.length;for(let i=0;i<n;i++){let k=i;for(let j=i+1;j<n;j++)if(Math.abs(A[j][i])>Math.abs(A[k][i]))k=j;[A[i],A[k]]=[A[k],A[i]];[b[i],b[k]]=[b[k],b[i]];if(Math.abs(A[i][i])<1e-9)throw Error('Некорректные границы');let v=A[i][i];for(let m=i;m<n;m++)A[i][m]/=v;b[i]/=v;for(let j=0;j<n;j++)if(j!==i){let f=A[j][i];for(let m=i;m<n;m++)A[j][m]-=f*A[i][m];b[j]-=f*b[i];}}return b;}
function homography(dst,src){const A=[],b=[];for(let i=0;i<4;i++){const [x,y]=dst[i],[u,v]=src[i];A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v);}return solve(A,b);}
function warp(image,corners,max=2250){const sw=image.width,sh=image.height,pts=corners.map(([x,y])=>[x*(sw-1),y*(sh-1)]);let w=Math.round(Math.max(distance(pts[0],pts[1]),distance(pts[2],pts[3]))),h=Math.round(Math.max(distance(pts[0],pts[3]),distance(pts[1],pts[2])));if(w<60||h<60)throw Error('Область слишком мала');const scale=Math.min(1,max/Math.max(w,h));w=Math.max(1,Math.round(w*scale));h=Math.max(1,Math.round(h*scale));
 const H=homography([[0,0],[w-1,0],[w-1,h-1],[0,h-1]],pts);let sc=image.getContext('2d',{willReadFrequently:true}).getImageData(0,0,sw,sh).data;
 let out=canvas(w,h),ctx=out.getContext('2d'),res=ctx.createImageData(w,h),dst=res.data;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const den=H[6]*x+H[7]*y+1,sx=(H[0]*x+H[1]*y+H[2])/den,sy=(H[3]*x+H[4]*y+H[5])/den,z=(y*w+x)*4;
  if(sx<0||sy<0||sx>=sw-1||sy>=sh-1){dst[z]=dst[z+1]=dst[z+2]=255;dst[z+3]=255;continue;}
  const ix=sx|0,iy=sy|0,fx=sx-ix,fy=sy-iy,a=(iy*sw+ix)*4,b=a+4,c=a+4*sw,d=c+4;
  for(let t=0;t<3;t++)dst[z+t]=sc[a+t]*(1-fx)*(1-fy)+sc[b+t]*fx*(1-fy)+sc[c+t]*(1-fx)*fy+sc[d+t]*fx*fy;
  dst[z+3]=255;
 }
 ctx.putImageData(res,0,0);return out;
}
function filterImage(c,mode){if(mode==='original')return c;const ctx=c.getContext('2d',{willReadFrequently:true}),im=ctx.getImageData(0,0,c.width,c.height),d=im.data;
 for(let i=0;i<d.length;i+=4){let r=d[i],g=d[i+1],b=d[i+2],v=.299*r+.587*g+.114*b;
  if(mode==='gray'){r=g=b=v;}
  else if(mode==='bw'){const x=clamp((v-122)*1.75+122,0,255);r=g=b=x;}
  else if(mode==='document'){const v0=1.11;const lift=8;r=clamp((r-128)*v0+128+lift,0,255);g=clamp((g-128)*v0+128+lift,0,255);b=clamp((b-128)*v0+128+lift,0,255);}
  d[i]=r;d[i+1]=g;d[i+2]=b;
 }
 ctx.putImageData(im,0,0);return c;
}
global.ScannerVision={detect,warp,filterImage,canvas,clamp};
})(window);
