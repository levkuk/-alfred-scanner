'use strict';
(() => {
const $=id=>document.getElementById(id), Vision=window.ScannerVision, PDF=window.ScannerPDF;
const MAX=2300,DB_NAME='alfred_scanner_2';
let db,docs=[],folders=[],selectedFolder='all',draft=null,activeDoc=null,working=null,workingIndex=-1,workingCorners=[],workingFilter='document',draggedCorner=-1,urls=[],currentView='libraryView',toastTimer,cameraStream=null,flashTimer;
const uid=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2);
function notify(text){const n=$('toast');n.textContent=text;n.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.classList.add('hidden'),4000);}
function changeView(id){currentView=id;for(const v of ['libraryView','batchView','cameraView','editorView','detailView'])$(v).classList.toggle('hidden',v!==id);$('bottomNav').classList.toggle('hidden',id!=='libraryView');window.scrollTo(0,0);}
function sheet(title,options){$('sheetTitle').textContent=title;const root=$('sheetActions');root.replaceChildren();for(const action of options){let b=document.createElement('button');b.className='sheet-action'+(action.danger?' danger':'');b.textContent=action.label;b.onclick=()=>{closeSheet();Promise.resolve().then(action.run).catch(e=>reportError(e));};root.append(b);}$('sheet').classList.remove('hidden');}
function closeSheet(){$('sheet').classList.add('hidden');}
function reportError(err){console.error(err);notify('Ошибка: '+(err?.message||'операция не выполнена'));}
$('sheetClose').onclick=closeSheet;$('sheet').onclick=e=>{if(e.target===$('sheet'))closeSheet()};
$('infoButton').onclick=()=>sheet('Альфред Сканер 3.0',[
 {label:'Документы обрабатываются локально, без сервера',run:()=>{}},
 {label:'Сканируйте страницы подряд, затем сохраните один PDF',run:()=>{}},
 {label:'Для резервных копий экспортируйте PDF в «Файлы»',run:()=>{}}
]);
function openDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,2);
 request.onupgradeneeded=()=>{const d=request.result;for(const name of ['docs','folders','drafts'])if(!d.objectStoreNames.contains(name))d.createObjectStore(name,{keyPath:'id'});};
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});}
const transaction=(name,action,record)=>new Promise((resolve,reject)=>{const tx=db.transaction(name,action==='all'?'readonly':'readwrite'),store=tx.objectStore(name);let req=action==='all'?store.getAll():action==='get'?store.get(record):action==='delete'?store.delete(record):store.put(record);
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
const all=name=>transaction(name,'all'),get=(name,id)=>transaction(name,'get',id),save=(name,value)=>transaction(name,'put',value),remove=(name,id)=>transaction(name,'delete',id);
async function reloadLibrary(){docs=await all('docs');folders=await all('folders');renderLibrary();}
function clearUrls(){for(const url of urls)URL.revokeObjectURL(url);urls=[];}
function blobURL(blob){if(!blob)return '';const u=URL.createObjectURL(blob);urls.push(u);return u;}
function formatDate(t){return new Date(t||Date.now()).toLocaleDateString('ru-RU',{day:'2-digit',month:'short'});}
function selectGroups(){const el=$('docFolder');el.replaceChildren();for(const f of [{id:'',name:'Без группы'},...folders]){let op=document.createElement('option');op.value=f.id;op.textContent=f.name;el.append(op);}el.value=draft?.folder||'';}
function renderLibrary(){clearUrls();const bar=$('folderList');bar.replaceChildren();let fcount=0;
 for(const f of [{id:'all',name:'Все'},...folders]){
  if(f.id!=='all')fcount++;const b=document.createElement('button');b.className='folder-chip'+(selectedFolder===f.id?' active':'');b.textContent=(f.id==='all'?'▤ ':'▰ ')+f.name;b.onclick=()=>{selectedFolder=f.id;renderLibrary()};bar.append(b);
  if(f.id!=='all'&&f.id===selectedFolder){const settings=document.createElement('button');settings.className='folder-chip';settings.textContent='•••';settings.title='Управление группой';settings.onclick=()=>folderMenu(f);bar.append(settings);}
 }
 $('folderCount').textContent=fcount+' групп';const q=$('searchInput').value.toLowerCase().trim();const items=docs.filter(d=>(selectedFolder==='all'||d.folder===selectedFolder)&&(d.name||'').toLowerCase().includes(q)).sort((a,b)=>(b.updated||b.created)-(a.updated||a.created));
 $('currentFolderTitle').textContent=selectedFolder==='all'?'Все документы':(folders.find(f=>f.id===selectedFolder)?.name||'Документы');$('documentCount').textContent=items.length+' PDF';
 $('emptyLibrary').classList.toggle('hidden',!!items.length);const root=$('documentList');root.replaceChildren();
 for(const d of items){let row=document.createElement('div');row.className='doc-row';let preview;
  if(d.previewBlob||d.pages?.[0]?.outputBlob){preview=document.createElement('img');preview.className='doc-thumb';preview.src=blobURL(d.previewBlob||d.pages[0].outputBlob);}else{preview=document.createElement('div');preview.className='doc-thumb placeholder';preview.textContent='▤';}
  const body=document.createElement('div');body.className='doc-copy';const title=document.createElement('b');title.textContent=d.name||'Документ';const sub=document.createElement('small');sub.textContent=`${d.pages?.length||d.count||1} стр. · ${formatDate(d.updated||d.created)}`;body.append(title,sub);row.append(preview,body);
  const more=document.createElement('button');more.className='dots';more.textContent='⋯';more.onclick=e=>{e.stopPropagation();documentMenu(d)};row.onclick=()=>openDocument(d.id);row.append(more);root.append(row);
 }
 $('draftNotice').classList.toggle('hidden',!draft?.pages?.length);if(draft?.pages?.length)$('draftCount').textContent=draft.pages.length+' стр. · '+draft.name;
}
async function createFolder(){let name=prompt('Название новой группы');if(!name?.trim())return;name=name.trim();if(folders.some(f=>f.name.toLowerCase()===name.toLowerCase())){notify('Такая группа уже существует');return;}
 const f={id:uid(),name,created:Date.now()};await save('folders',f);selectedFolder=f.id;await reloadLibrary();notify('Группа создана');}
$('createFolder').onclick=()=>createFolder().catch(reportError);$('searchInput').oninput=renderLibrary;$('resumeDraft').onclick=()=>{renderBatch();changeView('batchView')};
function folderMenu(f){sheet(f.name,[
 {label:'Переименовать группу',run:async()=>{let name=prompt('Новое название',f.name);if(!name?.trim())return;f.name=name.trim();await save('folders',f);reloadLibrary();}},
 {label:'Удалить группу (документы останутся)',danger:true,run:async()=>{if(!confirm('Удалить группу? Документы останутся в разделе «Все».'))return;for(const d of docs)if(d.folder===f.id){d.folder='';await save('docs',d)};if(draft?.folder===f.id){draft.folder='';await persistDraft()}await remove('folders',f.id);selectedFolder='all';reloadLibrary();}}
]);}
function documentMenu(d){sheet(d.name||'Документ',[
 {label:'Открыть документ',run:()=>openDocument(d.id)},
 {label:'Поделиться PDF',run:()=>shareDocument(d)},
 {label:'Переименовать',run:async()=>{let name=prompt('Название документа',d.name);if(!name?.trim())return;d.name=name.trim();await save('docs',d);await reloadLibrary();}},
 {label:'Переместить в группу',run:()=>sheet('Переместить',[{label:'Без группы',run:()=>moveDoc(d,'')},...folders.map(f=>({label:f.name,run:()=>moveDoc(d,f.id)}))])},
 {label:'Удалить документ',danger:true,run:async()=>{if(!confirm('Удалить этот документ?'))return;await remove('docs',d.id);await reloadLibrary();notify('Документ удалён');}}
]);}
async function moveDoc(d,id){d.folder=id;d.updated=Date.now();await save('docs',d);await reloadLibrary();notify('Документ перемещён');}
async function shareDocument(d){try{let blob=d.blob;if(!blob&&d.pages?.length)blob=await PDF.generate(d.pages);if(!blob)throw Error('PDF отсутствует');const filename=(d.name||'Документ').replace(/[\\/:*?"<>|]/g,'_')+'.pdf';const file=new File([blob],filename,{type:'application/pdf'});
 if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:d.name});return;}catch(e){if(e.name==='AbortError')return;}}
 const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(u),60000);
}catch(e){reportError(e)}}
function beginDraft(existing=null){draft={id:'active',name:existing?.name||'Скан '+new Date().toLocaleDateString('ru-RU'),folder:existing?.folder||(selectedFolder==='all'?'':selectedFolder),docId:existing?.id||null,pages:existing?.pages?existing.pages.slice():[],created:Date.now()};persistDraft().catch(reportError);renderBatch();changeView('batchView');}
function startDraft(withCamera=false,withGallery=false){if(draft?.pages?.length){sheet('Есть незаконченный документ',[
 {label:'Продолжить сканирование',run:()=>{renderBatch();changeView('batchView');if(withCamera)openCamera();else if(withGallery)openGallery();}},
 {label:'Создать новый документ',run:()=>{beginDraft();if(withCamera)openCamera();else if(withGallery)openGallery();}}
]);return;}
 beginDraft();if(withCamera)openCamera();else if(withGallery)openGallery();}
$('navCapture').onclick=()=>startDraft(true);$('navPhotos').onclick=()=>startDraft(false,true);$('navDocuments').onclick=()=>changeView('libraryView');
function stopCamera(){if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;}$('liveVideo').srcObject=null;}
function cameraCounter(){$('liveCounter').textContent=(draft?.pages.length||0)+' стр.';}
async function openCamera(){if(!navigator.mediaDevices?.getUserMedia){$('cameraInput').click();return;}
 try{
  if(!draft)beginDraft();changeView('cameraView');cameraCounter();$('cameraError').classList.add('hidden');$('liveShutter').disabled=true;
  cameraStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:2560}}});
  const video=$('liveVideo');video.srcObject=cameraStream;await video.play();$('liveShutter').disabled=false;
 }catch(e){stopCamera();$('cameraError').classList.remove('hidden');$('liveShutter').disabled=true;notify('Камера недоступна: выберите системную камеру');}
}
function openGallery(){$('galleryInput').click()};
$('cameraBack').onclick=()=>{stopCamera();renderBatch();changeView('batchView');};
$('cameraDone').onclick=()=>{stopCamera();renderBatch();changeView('batchView');};
$('nativeCamera').onclick=()=>{$('cameraInput').click();};
$('liveShutter').onclick=async()=>{
 const video=$('liveVideo');if(!video.videoWidth||!video.videoHeight||!draft)return;const b=$('liveShutter');b.disabled=true;
 try{const k=Math.min(1,MAX/Math.max(video.videoWidth,video.videoHeight)),c=Vision.canvas(Math.round(video.videoWidth*k),Math.round(video.videoHeight*k));
  c.getContext('2d').drawImage(video,0,0,c.width,c.height);
  const p=await processPhoto(await toJPEG(c,.94));draft.pages.push(p);await persistDraft();cameraCounter();
  $('captureFlash').classList.remove('hidden');clearTimeout(flashTimer);flashTimer=setTimeout(()=>$('captureFlash').classList.add('hidden'),700);
  if(p.needsReview)$('cameraInstructions').textContent='Последний лист нужно будет уточнить в редакторе. Можно продолжать съёмку.';
 }catch(e){reportError(e)}finally{b.disabled=false;}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&cameraStream)stopCamera();});
window.addEventListener('pagehide',stopCamera);

$('batchCamera').onclick=openCamera;$('batchGallery').onclick=openGallery;$('cameraInput').onchange=e=>readInput(e.currentTarget);$('galleryInput').onchange=e=>readInput(e.currentTarget);
async function imageToCanvas(blob){const url=URL.createObjectURL(blob);try{
 let img;try{img=await createImageBitmap(blob);}catch(e){img=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Этот формат изображения не поддерживается браузером'));im.src=url;});}
 const s=Math.min(1,MAX/Math.max(img.width,img.height)),out=Vision.canvas(Math.max(1,Math.round(img.width*s)),Math.max(1,Math.round(img.height*s)));out.getContext('2d').drawImage(img,0,0,out.width,out.height);if(img.close)img.close();return out;
 }finally{URL.revokeObjectURL(url);}}
const toJPEG=(c,quality=.9)=>new Promise((resolve,reject)=>c.toBlob(blob=>blob?resolve(blob):reject(Error('Не удалось сохранить изображение')),'image/jpeg',quality));
async function processPhoto(file){let image=await imageToCanvas(file),result=Vision.detect(image),originalBlob=await toJPEG(image,.93),out=result.found?Vision.warp(image,result.corners):image;
 Vision.filterImage(out,'document');const outputBlob=await toJPEG(out,.90);
 return {id:uid(),originalBlob,outputBlob,width:out.width,height:out.height,corners:result.found?result.corners:null,filter:'document',confidence:result.confidence,needsReview:!result.found};}
async function readInput(input){const files=[...input.files];input.value='';if(!files.length)return;if(!draft)beginDraft();stopCamera();changeView('batchView');$('batchHint').textContent='Обрабатываю снимки на iPhone…';
 try{for(const f of files){if(!f.type.startsWith('image/')&&!/\.(heic|heif|jpg|jpeg|png|webp)$/i.test(f.name))continue;const p=await processPhoto(f);draft.pages.push(p);await persistDraft();renderBatch();}
  const weak=draft.pages.filter(p=>p.needsReview).length;
  if(weak)notify('Проверьте границы: '+weak+' стр. требуют уточнения');else notify('Страницы добавлены. Можно снимать дальше.');
 }catch(e){reportError(e)}finally{renderBatch();}
}
async function persistDraft(){if(!db||!draft)return;await save('drafts',draft);}
function renderBatch(){if(!draft)return;clearUrls();$('docName').value=draft.name;$('batchCounter').textContent=draft.pages.length+' стр.';$('emptyBatch').classList.toggle('hidden',!!draft.pages.length);$('finishDocument').disabled=!draft.pages.length;
 selectGroups();const weak=draft.pages.filter(p=>p.needsReview).length;$('batchHint').textContent=weak?`Проверьте углы на ${weak} стр. Снимайте следующие страницы, не сохраняя PDF до завершения.`:'Снимайте страницы подряд. Один документ — один PDF. На миниатюру можно нажать для правки.';
 const grid=$('pageGrid');grid.replaceChildren();draft.pages.forEach((p,i)=>{
  const tile=document.createElement('div');tile.className='page-tile';const img=document.createElement('img');img.src=blobURL(p.outputBlob);img.alt='Страница '+(i+1);img.onclick=()=>editPage(i);
  const badge=document.createElement('span');badge.className='status-pill'+(p.needsReview?' warning':'');badge.textContent=p.needsReview?'Проверить углы':'Авто ✓';
  const row=document.createElement('div');row.className='tile-info';const label=document.createElement('span');label.textContent='Страница '+(i+1);
  const edit=document.createElement('button');edit.textContent='Править';edit.onclick=()=>editPage(i);
  const more=document.createElement('button');more.textContent='⋯';more.onclick=()=>pageMenu(i);
  row.append(label,edit,more);tile.append(img,badge,row);grid.append(tile);
 });
}
$('docName').oninput=()=>{if(draft){draft.name=$('docName').value;persistDraft().catch(reportError);}};$('docFolder').onchange=()=>{if(draft){draft.folder=$('docFolder').value;persistDraft().catch(reportError);}};
function pageMenu(i){sheet('Страница '+(i+1),[
 {label:'Настроить границы и фильтр',run:()=>editPage(i)},
 {label:'Переместить выше',run:()=>movePage(i,-1)},
 {label:'Переместить ниже',run:()=>movePage(i,1)},
 {label:'Удалить страницу',danger:true,run:async()=>{draft.pages.splice(i,1);await persistDraft();renderBatch();}}
]);}
async function movePage(i,d){const j=i+d;if(j<0||j>=draft.pages.length)return;[draft.pages[i],draft.pages[j]]=[draft.pages[j],draft.pages[i]];await persistDraft();renderBatch();}
$('batchBack').onclick=async()=>{if(draft){draft.name=$('docName').value.trim()||draft.name;draft.folder=$('docFolder').value;await persistDraft()}await reloadLibrary();changeView('libraryView')};
$('discardDraft').onclick=async()=>{if(!confirm('Удалить черновик со всеми страницами?'))return;draft=null;await remove('drafts','active');await reloadLibrary();changeView('libraryView')};
$('finishDocument').onclick=async()=>{if(!draft?.pages.length)return;const b=$('finishDocument');b.disabled=true;b.textContent='Создаю PDF…';
 try{draft.name=$('docName').value.trim()||'Скан документа';draft.folder=$('docFolder').value;
  const blob=await PDF.generate(draft.pages);let d=draft.docId?docs.find(x=>x.id===draft.docId):null;
  d={...(d||{}),id:draft.docId||uid(),name:draft.name,folder:draft.folder,pages:draft.pages,count:draft.pages.length,blob,previewBlob:draft.pages[0]?.outputBlob,created:d?.created||Date.now(),updated:Date.now()};
  await save('docs',d);await remove('drafts','active');draft=null;await reloadLibrary();openDocument(d.id);notify('PDF сохранён в библиотеке');
 }catch(e){reportError(e)}finally{b.textContent='Готово · Сохранить PDF';b.disabled=!draft?.pages?.length;}
};
async function openDocument(id){activeDoc=docs.find(d=>d.id===id);if(!activeDoc)return;clearUrls();$('detailTitle').textContent=activeDoc.name;$('detailMeta').textContent=formatDate(activeDoc.updated||activeDoc.created)+' · '+(activeDoc.pages?.length||activeDoc.count||1)+' стр.';
 $('detailCount').textContent=(activeDoc.pages?.length||activeDoc.count||1)+' стр.';const root=$('detailPages');root.replaceChildren();
 if(activeDoc.pages?.length){activeDoc.pages.forEach((p,i)=>{const tile=document.createElement('div');tile.className='page-tile';const img=document.createElement('img');img.src=blobURL(p.outputBlob);const b=document.createElement('div');b.className='tile-info';b.textContent='Страница '+(i+1);tile.append(img,b);root.append(tile);});$('addToSaved').disabled=false;}
 else{$('addToSaved').disabled=true;const info=document.createElement('div');info.className='tip';info.textContent='Документ создан в предыдущей версии. Его можно открыть и экспортировать, но добавление страниц в него недоступно.';root.append(info)}
 changeView('detailView');}
$('detailBack').onclick=()=>{reloadLibrary().catch(reportError);changeView('libraryView')};
$('exportSaved').onclick=()=>activeDoc&&shareDocument(activeDoc);
$('addToSaved').onclick=()=>{if(!activeDoc?.pages)return;draft={id:'active',name:activeDoc.name,folder:activeDoc.folder||'',docId:activeDoc.id,pages:activeDoc.pages.slice(),created:Date.now()};persistDraft().catch(reportError);renderBatch();changeView('batchView');};
$('detailMenu').onclick=()=>activeDoc&&documentMenu(activeDoc);
// Редактор точек — изображение и увеличительная лупа остаются на устройстве.
async function editPage(i){if(!draft||!draft.pages[i])return;workingIndex=i;working=await imageToCanvas(draft.pages[i].originalBlob);workingFilter=draft.pages[i].filter||'document';
 const found=Vision.detect(working);workingCorners=draft.pages[i].corners||found.corners||[[.035,.035],[.965,.035],[.965,.965],[.035,.965]];
 changeView('editorView');drawEditor();setDetectStatus(!!draft.pages[i].corners||found.found);selectFilter(workingFilter);}
function setDetectStatus(success){$('detectStatus').textContent=success?'Границы найдены. При необходимости уточните точки — при перемещении появляется лупа.':'Автоматика не уверена в границах. Расставьте четыре точки по углам листа с помощью лупы.';}
function drawEditor(){const availableH=Math.min(window.innerHeight*.53,580),availableW=Math.min(window.innerWidth-34,666),width=Math.min(availableW,availableH*working.width/working.height);
 const box=$('cropBox');box.style.width=Math.max(90,width)+'px';const c=$('sourceCanvas');c.width=working.width;c.height=working.height;c.getContext('2d').drawImage(working,0,0);renderCorners();}
function renderCorners(){const root=$('handles');root.replaceChildren();$('cropPolygon').setAttribute('points',workingCorners.map(p=>(p[0]*1000)+','+(p[1]*1000)).join(' '));
 workingCorners.forEach((p,i)=>{const b=document.createElement('div');b.className='corner';b.setAttribute('role','slider');b.setAttribute('aria-label','Угол '+(i+1));b.style.left=p[0]*100+'%';b.style.top=p[1]*100+'%';b.onpointerdown=e=>{e.preventDefault();draggedCorner=i;b.setPointerCapture(e.pointerId);updateCorner(e,i);};b.onpointermove=e=>{if(draggedCorner===i)updateCorner(e,i)};b.onpointerup=b.onpointercancel=()=>{draggedCorner=-1;$('lens').classList.add('hidden');};root.append(b);});}
function updateCorner(e,i){const box=$('cropBox'),r=box.getBoundingClientRect(),x=Vision.clamp((e.clientX-r.left)/r.width),y=Vision.clamp((e.clientY-r.top)/r.height);
 workingCorners[i]=[x,y];const node=$('handles').children[i];node.style.left=x*100+'%';node.style.top=y*100+'%';$('cropPolygon').setAttribute('points',workingCorners.map(p=>p[0]*1000+','+p[1]*1000).join(' '));drawLens(i);}
function drawLens(i){let p=workingCorners[i],box=$('cropBox'),lens=$('lens'),x=p[0]*box.clientWidth,y=p[1]*box.clientHeight;
 lens.classList.remove('hidden');let left=Math.max(0,Math.min(box.clientWidth-178,x-89));let top=y<210?Math.min(box.clientHeight-178,y+42):y-199;
 lens.style.left=left+'px';lens.style.top=Math.max(0,top)+'px';const ctx=$('lensCanvas').getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,170,170);ctx.imageSmoothingEnabled=true;const z=Math.max(60,Math.min(145,working.width*.055)),sx=p[0]*working.width,sy=p[1]*working.height;
 ctx.drawImage(working,sx-z/2,sy-z/2,z,z,0,0,170,170);ctx.strokeStyle='#3478f6';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(85,0);ctx.lineTo(85,170);ctx.moveTo(0,85);ctx.lineTo(170,85);ctx.stroke();}
$('redetect').onclick=()=>{const r=Vision.detect(working);if(r.found)workingCorners=r.corners;else workingCorners=[[.035,.035],[.965,.035],[.965,.965],[.035,.965]];setDetectStatus(r.found);renderCorners()};
$('rotateImage').onclick=()=>{const rotated=Vision.canvas(working.height,working.width),ctx=rotated.getContext('2d');ctx.translate(rotated.width,0);ctx.rotate(Math.PI/2);ctx.drawImage(working,0,0);working=rotated;const r=Vision.detect(working);workingCorners=r.corners||[[.035,.035],[.965,.035],[.965,.965],[.035,.965]];setDetectStatus(r.found);drawEditor()};
$('resetImage').onclick=async()=>{working=await imageToCanvas(draft.pages[workingIndex].originalBlob);const r=Vision.detect(working);workingCorners=r.corners||[[.035,.035],[.965,.035],[.965,.965],[.035,.965]];workingFilter='document';selectFilter(workingFilter);setDetectStatus(r.found);drawEditor()};
$('editBack').onclick=()=>{changeView('batchView');renderBatch()};
function selectFilter(type){workingFilter=type;for(const b of $('filterList').querySelectorAll('button'))b.classList.toggle('selected',b.dataset.filter===type);}
for(const b of $('filterList').querySelectorAll('button'))b.onclick=()=>selectFilter(b.dataset.filter);
async function applyEditor(takeNext=false){try{
 const quad=workingCorners,area=Math.abs(quad.reduce((s,p,i)=>s+p[0]*quad[(i+1)%4][1]-p[1]*quad[(i+1)%4][0],0))/2;
 if(area<.02)throw Error('Точки образуют слишком маленькую область');
 let out=Vision.warp(working,quad);Vision.filterImage(out,workingFilter);
 const p=draft.pages[workingIndex];p.originalBlob=await toJPEG(working,.93);p.outputBlob=await toJPEG(out,.9);p.width=out.width;p.height=out.height;p.corners=workingCorners.map(x=>x.slice());p.filter=workingFilter;p.needsReview=false;p.confidence=1;
 await persistDraft();changeView('batchView');renderBatch();if(takeNext)openCamera();else notify('Границы страницы сохранены');
 }catch(e){reportError(e)}}
$('applyCrop').onclick=()=>applyEditor(false);$('applyAndCamera').onclick=()=>applyEditor(true);
async function init(){try{db=await openDB();draft=await get('drafts','active')||null;docs=await all('docs');folders=await all('folders');renderLibrary();}catch(e){reportError(e)}}
init();
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js?v=3').catch(()=>{});
window.addEventListener('error',e=>console.error('Ошибка интерфейса:',e.message));
})();
