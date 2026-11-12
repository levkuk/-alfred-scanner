/* Встроенный PDF-генератор. JPEG-страницы не отправляются в сеть. */
(function(global){'use strict';
const enc=s=>new TextEncoder().encode(s);
async function generate(pages){
 if(!pages.length)throw new Error('Нет страниц для сохранения');
 const objects=[null],add=x=>(objects.push(x),objects.length-1),root=add(null),pagesRoot=add(null),refs=[];
 for(const p of pages){
  if(!(p.outputBlob instanceof Blob))throw new Error('Не удалось прочитать страницу');
  const imgData=new Uint8Array(await p.outputBlob.arrayBuffer());
  const image=add({head:`/Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,data:imgData});
  const pw=595.28,ph=841.89,s=Math.min((pw-24)/p.width,(ph-24)/p.height),dw=p.width*s,dh=p.height*s;
  const commands=enc(`q ${dw.toFixed(3)} 0 0 ${dh.toFixed(3)} ${((pw-dw)/2).toFixed(3)} ${((ph-dh)/2).toFixed(3)} cm /Im0 Do Q\n`);
  const content=add({head:'',data:commands});
  refs.push(add(`<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`));
 }
 objects[root]=`<< /Type /Catalog /Pages ${pagesRoot} 0 R >>`;
 objects[pagesRoot]=`<< /Type /Pages /Kids [${refs.map(n=>n+' 0 R').join(' ')}] /Count ${refs.length} >>`;
 const parts=[enc('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')],offsets=[0];let size=parts[0].length;
 for(let i=1;i<objects.length;i++){
  offsets[i]=size;const o=objects[i],p=typeof o==='string'?[enc(`${i} 0 obj\n${o}\nendobj\n`)]:[enc(`${i} 0 obj\n<< ${o.head} /Length ${o.data.byteLength} >>\nstream\n`),o.data,enc('\nendstream\nendobj\n')];
  for(const b of p){parts.push(b);size+=b.byteLength;}
 }
 let index=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
 for(let i=1;i<objects.length;i++)index+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
 parts.push(enc(index+`trailer\n<< /Size ${objects.length} /Root ${root} 0 R >>\nstartxref\n${size}\n%%EOF`));
 return new Blob(parts,{type:'application/pdf'});
}
global.ScannerPDF={generate};
})(window);
