'use strict';

/* =====================================================
   HELPERS GLOBAIS
   ===================================================== */
function isVideoUrl(url) {
  const ext = (url||'').split('?')[0].split('.').pop().toLowerCase();
  return ['mp4','webm','mov'].includes(ext);
}
function getMediaSrc(el) { return el ? (el.src||el.currentSrc||'').split('?')[0] : ''; }
function getFilename(url) { return (url||'').split('?')[0].split('/').pop(); }

const videoVisObs = new IntersectionObserver(entries => {
  entries.forEach(({target:v, isIntersecting}) => {
    if (v.id==='hero-video') return;
    isIntersecting ? v.play().catch(()=>{}) : v.pause();
  });
}, { threshold:0.4 });

function buildMediaEl(url, alt, forCarousel=false) {
  if (isVideoUrl(url)) {
    const v=document.createElement('video');
    v.src=url; v.muted=true; v.loop=true; v.setAttribute('playsinline','');
    v.style.cssText='width:100%;height:100%;object-fit:cover;display:block;';
    videoVisObs.observe(v);
    v.onerror = () => { console.warn('Vídeo falhou ao carregar:', url); };
    if (forCarousel) {
      v.addEventListener('click', e => {
        e.stopPropagation(); v.muted=!v.muted;
        setSoundBadge(v.closest('.tl-slide,.tl-inline-item'), v.muted);
      });
    }
    return v;
  }
  const img=document.createElement('img'); img.src=url; img.alt=alt||'';
  img.style.cssText='width:100%;height:100%;object-fit:cover;display:block;';
  img.onerror = () => {
    console.warn('Imagem falhou ao carregar:', url);
    img.style.display='none';
    const p=img.parentElement;
    if (p && !p.querySelector('.media-load-err')) {
      const e=document.createElement('div'); e.className='media-load-err';
      e.style.cssText='display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--rose-deep,#C2185B);font-size:1.5rem;background:var(--rose-light,#FCE4EC);';
      e.textContent='⚠️'; p.appendChild(e);
    }
  };
  return img;
}

function setMediaBadge(container, url) {
  container.querySelectorAll('.media-badge').forEach(b=>b.remove());
  const b=document.createElement('span'); b.className='media-badge';
  b.textContent=isVideoUrl(url)?'🎬':'📷'; container.appendChild(b);
}
function setSoundBadge(container, isMuted) {
  if (!container) return;
  container.querySelectorAll('.sound-badge').forEach(b=>b.remove());
  if (!isMuted) { const b=document.createElement('span'); b.className='sound-badge'; b.textContent='🔊'; container.appendChild(b); }
}

async function getMaxNum(prefix) {
  try {
    const {files=[]} = await API.list(prefix);
    let max=0;
    files.filter(f=>f.startsWith(prefix+'-')).forEach(f=>{const m=f.match(/(\d+)(?:\.[^.]+)?$/);if(m)max=Math.max(max,+m[1]);});
    return max;
  } catch { return 0; }
}

async function batchUpload({files,prefix,onItem,progressEl,btn}) {
  if (!files.length) return;
  const orig=btn?.textContent||''; if(btn)btn.disabled=true;
  const maxNum=await getMaxNum(prefix);
  let done=0;
  const upd=()=>{
    const t=done>=files.length?`✓ ${files.length} arquivo${files.length>1?'s':''} enviado${files.length>1?'s':''}`:`Enviando ${done} de ${files.length}…`;
    if(progressEl){progressEl.hidden=false;progressEl.textContent=t;}
    if(btn&&done<files.length)btn.textContent=t;
  };
  upd();
  await Promise.all(files.map(async(file,i)=>{
    const slot=`${prefix}-${maxNum+1+i}`;
    try{const d=await API.upload(slot,file); if(d.success&&onItem)onItem(d.path+'?t='+Date.now(),slot);}catch{}
    done++; upd();
  }));
  if(progressEl)setTimeout(()=>{progressEl.hidden=true;progressEl.textContent='';},2500);
  if(btn)setTimeout(()=>{btn.textContent=orig;btn.disabled=false;},2500);
}

/* ─ Delete ─────────────────────────────────────────────────────────────────── */
function addDeleteBtn(container, getFile, onDeleted) {
  const btn=document.createElement('button');
  btn.className='media-delete-btn'; btn.type='button'; btn.textContent='🗑️';
  btn.setAttribute('aria-label','Remover'); container.appendChild(btn);
  btn.addEventListener('click', e=>{
    e.stopPropagation();
    // Remove existing confirm
    container.querySelectorAll('.delete-confirm').forEach(d=>d.remove());
    const conf=document.createElement('div'); conf.className='delete-confirm';
    conf.innerHTML='<span>Remover?</span><button class="del-yes" type="button">Sim</button><button class="del-no" type="button">Não</button>';
    container.appendChild(conf);
    conf.querySelector('.del-yes').addEventListener('click', async ev=>{
      ev.stopPropagation();
      const file=getFile(); if(!file){conf.remove();return;}
      const res=await API.remove(file).catch(()=>({success:false}));
      conf.remove(); if(res.success)onDeleted();
    });
    conf.querySelector('.del-no').addEventListener('click', ev=>{ev.stopPropagation();conf.remove();});
  });
}

/* ─ Timeline → álbum sync map ─────────────────────────────────────────────── */
const ALBUM_SYNC = {
  'ubatuba':         'tl-ubatuba1',
  'reveillon-praia': 'tl-reveillon2',
  'ouro-preto':      'tl-ouro-preto',
  'monte-verde':     'tl-monte-verde',
  'bahia':           'tl-bahia',
};

/* =====================================================
   EDITOR DE TEXTOS INLINE
   ===================================================== */
const textEditor = (function() {
  let saved={};

  async function load() {
    try { saved=await API.getTexts(); applyAll(); } catch {}
  }

  function applyAll() {
    Object.entries(saved).forEach(([key,val])=>{
      document.querySelectorAll(`[data-text-key="${key}"]`).forEach(el=>{el.textContent=val;});
    });
  }

  function apply(key, el) {
    if (saved[key]!==undefined) el.textContent=saved[key];
  }

  function init() {
    document.querySelectorAll('[data-text-key]').forEach(el=>wire(el));
  }

  function wire(el) {
    // Usa botão sibling — sem wrapper, evita HTML inválido (span>p, span>h3)
    if (el._textWired) return; el._textWired=true;
    const btn=document.createElement('button'); btn.className='text-edit-btn'; btn.type='button'; btn.textContent='✏️'; btn.setAttribute('aria-label','Editar texto');
    el.after(btn);

    // Hover: mostra o botão quando o mouse está sobre o elemento ou o botão
    let timer;
    const show=()=>{ clearTimeout(timer); btn.classList.add('visible'); };
    const hide=()=>{ timer=setTimeout(()=>btn.classList.remove('visible'),250); };
    el.addEventListener('mouseenter', show); el.addEventListener('mouseleave', hide);
    btn.addEventListener('mouseenter', show); btn.addEventListener('mouseleave', hide);
    btn.addEventListener('click', e=>{ e.stopPropagation(); startEdit(el); });
  }

  function startEdit(el) {
    const key=el.dataset.textKey;
    const multiline=el.tagName==='P'||el.dataset.multiline==='true';
    const orig=el.textContent;
    const inp=document.createElement(multiline?'textarea':'input');
    inp.className='text-edit-input'; inp.value=orig;
    if(multiline)inp.rows=Math.max(3,Math.ceil(orig.length/60));
    const bar=document.createElement('div'); bar.className='text-edit-bar';
    bar.innerHTML='<button class="teb-save" type="button">✓ Salvar</button><span class="teb-hint">ESC cancela</span>';
    el.hidden=true; el.after(inp); inp.after(bar); inp.focus();

    async function save() {
      const val=inp.value.trim()||orig;
      try {
        const d=await API.saveText(key,val);
        if(d.success){el.textContent=val;saved[key]=val;}
      }catch{}
      cancel();
    }
    function cancel(){inp.remove();bar.remove();el.hidden=false;}
    bar.querySelector('.teb-save').addEventListener('click',save);
    inp.addEventListener('keydown',e=>{
      if(e.key==='Escape')cancel();
      if(!multiline&&e.key==='Enter'){e.preventDefault();save();}
    });
  }

  return {load,init,wire,apply,saved:()=>saved};
})();

/* =====================================================
   COUNTER
   ===================================================== */
(function(){
  const S=new Date('2024-05-17T00:00:00');
  function u(){const d=Date.now()-S;const fmt=n=>String(n).padStart(2,'0');
    document.getElementById('cnt-days').textContent=Math.floor(d/86400000).toLocaleString('pt-BR');
    document.getElementById('cnt-hours').textContent=fmt(Math.floor((d%86400000)/3600000));
    document.getElementById('cnt-mins').textContent=fmt(Math.floor((d%3600000)/60000));}
  u();setInterval(u,60000);
})();

/* =====================================================
   PETALS
   ===================================================== */
(function(){
  const c=document.getElementById('petals-container');if(!c)return;
  const s=['🌸','💗','🌷','💕','✨','💖'];
  for(let i=0;i<22;i++){const el=document.createElement('span');el.className='petal';el.textContent=s[i%s.length];
    el.style.cssText=[`left:${Math.random()*100}%`,`animation-delay:${Math.random()*12}s`,`animation-duration:${10+Math.random()*10}s`,`font-size:${0.7+Math.random()*0.8}rem`,`--drift:${(Math.random()-.5)*120}px`].join(';');
    c.appendChild(el);}
})();

/* =====================================================
   HERO VIDEO
   ===================================================== */
(function initHeroVideo(){
  const videoEl=document.getElementById('hero-video');
  const heroBg=document.querySelector('.hero-bg');
  const changeBtn=document.getElementById('hero-video-btn');
  if(!videoEl||!heroBg||!changeBtn)return;
  const EXTS=['.mp4','.webm','.mov'];
  async function probe(){for(const ext of EXTS){if(await API.exists('photos',`hero-video${ext}`))return API.photoUrl(`hero-video${ext}`)+`?_=${Date.now()}`;}return null;}
  function load(url){videoEl.src=url;videoEl.load();videoEl.play().catch(()=>{});heroBg.classList.add('has-video');}
  probe().then(url=>{if(url)load(url);});
  const fi=document.createElement('input');fi.type='file';fi.accept='video/*';fi.style.display='none';document.body.appendChild(fi);
  changeBtn.addEventListener('click',()=>{fi.value='';fi.click();});
  fi.addEventListener('change',async()=>{const file=fi.files[0];if(!file)return;const orig=changeBtn.textContent;changeBtn.textContent='⏳ Enviando…';changeBtn.disabled=true;
    try{const d=await API.upload('hero-video',file);if(d.success){load(d.path+'?t='+Date.now());changeBtn.textContent='🎬 Trocar vídeo';}else{alert('Erro: '+(d.error||''));changeBtn.textContent=orig;}}catch(e){alert('Erro: '+e.message);changeBtn.textContent=orig;}
    changeBtn.disabled=false;});
})();

/* =====================================================
   PHOTO/VIDEO UPLOAD — slots estáticos
   ===================================================== */
const photoUpload=(function(){
  const PROBE=['.jpg','.jpeg','.png','.webp','.gif','.mp4','.webm','.mov'];
  let _i=null,_c=null,_s=null,_b=null;
  function getInput(){if(_i)return _i;_i=document.createElement('input');_i.type='file';_i.accept='image/*,video/*,.dng,.heic,.heif';_i.style.display='none';document.body.appendChild(_i);_i.addEventListener('change',handleChange);return _i;}
  async function handleChange(){const file=_i.files[0];if(!file||!_c||!_s)return;const orig=_b?.textContent;if(_b){_b.textContent='⏳ Enviando…';_b.disabled=true;}
    try{const d=await API.upload(_s,file);if(d.success){applyMedia(_c,d.path+'?t='+Date.now());ensureChangeBtn(_c,_s);}else{alert('Erro: '+(d.error||''));if(_b){_b.textContent=orig;_b.disabled=false;}}}catch(e){alert('Erro: '+e.message);if(_b){_b.textContent=orig;_b.disabled=false;}}}
  function trigger(c,s,b){_c=c;_s=s;_b=b;getInput().value='';getInput().click();}
  async function probe(slot){for(const ext of PROBE){if(await API.exists('photos',slot+ext))return API.photoUrl(slot+ext)+`?_=${Date.now()}`;}return null;}
  function applyMedia(cnt,url){
    if(cnt.classList.contains('hero-bg')){const img=cnt.querySelector('.hero-img');if(img&&!isVideoUrl(url)){img.src=url;img.style.opacity='1';}cnt.classList.remove('no-photo');cnt.classList.add('has-photo');return;}
    const isVid=isVideoUrl(url);
    const ex=cnt.querySelector('img:not(#hero-video ~ *),video:not(#hero-video)');
    if(isVid){const v=document.createElement('video');v.muted=true;v.loop=true;v.setAttribute('playsinline','');v.style.cssText='width:100%;height:100%;object-fit:cover;display:block;';if(ex){v.className=ex.className;ex.replaceWith(v);}else cnt.insertBefore(v,cnt.firstChild);v.src=url;videoVisObs.observe(v);}
    else{if(ex?.tagName==='VIDEO'){ex.pause();videoVisObs.unobserve(ex);const img=document.createElement('img');img.className=ex.className;img.alt='';ex.replaceWith(img);img.src=url;}else if(ex){ex.src=url;ex.style.opacity='1';}}
    cnt.classList.remove('no-photo');cnt.classList.add('has-photo');
  }
  function applyPlaceholder(cnt,slot){cnt.classList.add('no-photo');cnt.classList.remove('has-photo');const ex=cnt.querySelector('img,video');if(ex)ex.src='';if(cnt.querySelector('.photo-placeholder'))return;
    const ph=document.createElement('div');ph.className='photo-placeholder';ph.innerHTML=`<span class="photo-placeholder-icon">📸</span><span class="photo-placeholder-text">photos/${slot}.jpg</span><button class="photo-upload-btn" type="button">📎 Adicionar foto ou vídeo</button>`;cnt.appendChild(ph);
    ph.querySelector('.photo-upload-btn').addEventListener('click',()=>trigger(cnt,slot,ph.querySelector('.photo-upload-btn')));}
  function ensureChangeBtn(cnt,slot){if(cnt.querySelector('.photo-change-btn'))return;const btn=document.createElement('button');btn.className='photo-change-btn';btn.type='button';btn.textContent='✏️ Trocar';cnt.appendChild(btn);btn.addEventListener('click',()=>trigger(cnt,slot,btn));}
  function initSlot(cnt){const slot=cnt.dataset.slot;if(!slot)return;if(!cnt.querySelector('img,video')){const img=document.createElement('img');img.alt='';cnt.insertBefore(img,cnt.firstChild);}
    probe(slot).then(url=>{if(url){applyMedia(cnt,url);ensureChangeBtn(cnt,slot);}else{applyPlaceholder(cnt,slot);}});}
  return{init:()=>document.querySelectorAll('[data-slot]').forEach(initSlot),initSlot};
})();

/* =====================================================
   SCROLL ANIMATIONS
   ===================================================== */
(function(){
  const obs=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');obs.unobserve(e.target);}});},{threshold:0.12,rootMargin:'0px 0px -40px 0px'});
  document.querySelectorAll('.animate-fade-up').forEach(el=>obs.observe(el));
})();

/* =====================================================
   LIGHTBOX — foto e vídeo (com som automático)
   ===================================================== */
const lightbox=(function(){
  const lb=document.getElementById('lightbox'),lbImg=document.getElementById('lb-img'),lbVid=document.getElementById('lb-video'),lbClose=document.getElementById('lb-close'),lbPrev=document.getElementById('lb-prev'),lbNext=document.getElementById('lb-next'),lbCount=document.getElementById('lb-counter');
  if(!lb)return{open:()=>{}};
  let items=[],cur=0;
  function open(arr,idx){items=arr;cur=Math.max(0,Math.min(idx,arr.length-1));show();}
  function show(){if(!items.length)return;const{src,alt}=items[cur];
    if(isVideoUrl(src)){lbImg.hidden=true;lbVid.src=src;lbVid.muted=false;lbVid.hidden=false;lbVid.load();lbVid.play().catch(()=>{});}
    else{lbVid.pause();lbVid.src='';lbVid.hidden=true;lbImg.src=src;lbImg.alt=alt||'';lbImg.hidden=false;}
    lbCount.textContent=`${cur+1} / ${items.length}`;lb.hidden=false;document.body.style.overflow='hidden';lbClose.focus();}
  function close(){lb.hidden=true;lbImg.src='';lbImg.hidden=false;lbVid.pause();lbVid.src='';lbVid.hidden=true;if(!document.querySelector('.album-modal:not([hidden])'))document.body.style.overflow='';}
  const prev=()=>{cur=(cur-1+items.length)%items.length;show();};
  const next=()=>{cur=(cur+1)%items.length;show();};
  lbClose.addEventListener('click',close);lbPrev.addEventListener('click',prev);lbNext.addEventListener('click',next);
  lb.addEventListener('click',e=>{if(e.target===lb)close();});
  document.addEventListener('keydown',e=>{if(lb.hidden)return;if(e.key==='Escape')close();if(e.key==='ArrowLeft')prev();if(e.key==='ArrowRight')next();});

  // Swipe horizontal no mobile
  let _sx=0,_sy=0;
  lb.addEventListener('touchstart',e=>{_sx=e.touches[0].clientX;_sy=e.touches[0].clientY;},{passive:true});
  lb.addEventListener('touchend',e=>{
    const dx=_sx-e.changedTouches[0].clientX;
    const dy=Math.abs(_sy-e.changedTouches[0].clientY);
    if(dy>Math.abs(dx)||Math.abs(dx)<40)return; // ignora scroll vertical e swipes curtos
    dx>0?next():prev();
  },{passive:true});

  return{open};
})();

/* =====================================================
   GALERIA — dinâmica, batch upload
   ===================================================== */
(function initGallery(){
  const grid=document.getElementById('gallery-grid');if(!grid)return;
  const batchBtn=document.getElementById('gallery-batch-btn');
  const progress=document.getElementById('gallery-progress');

  function addItem(src){
    const item=document.createElement('div'); item.className='masonry-item';
    const media=buildMediaEl(src,'',false); item.appendChild(media); setMediaBadge(item,src);
    // Delete
    addDeleteBtn(item, ()=>getFilename(getMediaSrc(item.querySelector('img,video'))), ()=>{ item.style.transition='opacity 0.3s';item.style.opacity='0';setTimeout(()=>item.remove(),300); });
    item.addEventListener('click',()=>{
      const all=Array.from(grid.querySelectorAll('.masonry-item'));
      lightbox.open(all.map(el=>{const m=el.querySelector('img,video');return{src:getMediaSrc(m),alt:m?.alt||''};}),all.indexOf(item));
    });
    grid.appendChild(item);
    requestAnimationFrame(()=>{item.style.opacity='0';item.style.transition='opacity 0.3s';requestAnimationFrame(()=>item.style.opacity='1');});
  }

  (async()=>{try{const{files=[]}=await API.list('gallery');files.forEach(f=>addItem(API.photoUrl(f)));}catch{}})();

  if(!batchBtn)return;
  const fi=document.createElement('input');fi.type='file';fi.accept='image/*,video/*,.dng,.heic,.heif';fi.multiple=true;fi.style.display='none';document.body.appendChild(fi);
  batchBtn.addEventListener('click',()=>{fi.value='';fi.click();});
  fi.addEventListener('change',async()=>{const files=Array.from(fi.files);if(!files.length)return;await batchUpload({files,prefix:'gallery',onItem:src=>addItem(src),progressEl:progress,btn:batchBtn});});
})();

/* =====================================================
   TIMELINE CAROUSELS
   ===================================================== */
async function buildCarousel(carousel){
  const prefix=carousel.dataset.prefix;if(!prefix)return;
  const wrap=document.createElement('div');wrap.className='tl-track-wrap';
  const track=document.createElement('div');track.className='tl-track';
  wrap.appendChild(track);carousel.appendChild(wrap);
  const prevBtn=document.createElement('button');prevBtn.className='tl-arrow tl-arrow-prev';prevBtn.type='button';prevBtn.textContent='‹';
  const nextBtn=document.createElement('button');nextBtn.className='tl-arrow tl-arrow-next';nextBtn.type='button';nextBtn.textContent='›';
  prevBtn.addEventListener('click',()=>wrap.scrollBy({left:-270,behavior:'smooth'}));
  nextBtn.addEventListener('click',()=>wrap.scrollBy({left:270,behavior:'smooth'}));
  carousel.appendChild(prevBtn);carousel.appendChild(nextBtn);
  const addBtn=document.createElement('button');addBtn.className='tl-add-btn';addBtn.type='button';addBtn.textContent='📎 Adicionar foto ou vídeo';carousel.appendChild(addBtn);
  const prog=document.createElement('span');prog.className='upload-progress';prog.hidden=true;carousel.appendChild(prog);
  function updateArrows(){const show=track.children.length>1;prevBtn.hidden=!show;nextBtn.hidden=!show;}

  function addSlide(src){
    const slide=document.createElement('div');slide.className='tl-slide';
    const media=buildMediaEl(src,'',true);
    if(!isVideoUrl(src)){media.style.cursor='pointer';media.addEventListener('click',()=>{const slides=Array.from(track.querySelectorAll('.tl-slide'));lightbox.open(slides.map(s=>{const m=s.querySelector('img,video');return{src:getMediaSrc(m),alt:m?.alt||''};}),slides.indexOf(slide));});}
    slide.appendChild(media);setMediaBadge(slide,src);
    addDeleteBtn(slide, ()=>getFilename(getMediaSrc(slide.querySelector('img,video'))), ()=>{ slide.style.transition='opacity 0.3s';slide.style.opacity='0';setTimeout(()=>{slide.remove();updateArrows();if(track.children.length===0)addBtn.textContent='📎 Adicionar foto ou vídeo';},300); });
    track.appendChild(slide);addBtn.textContent='＋ Adicionar foto ou vídeo';updateArrows();
  }

  try{const{files=[]}=await API.list(prefix);files.forEach(f=>addSlide(API.photoUrl(f)));}catch{}
  updateArrows();

  const fi=document.createElement('input');fi.type='file';fi.accept='image/*,video/*,.dng,.heic,.heif';fi.multiple=true;fi.style.display='none';document.body.appendChild(fi);
  addBtn.addEventListener('click',()=>{fi.value='';fi.click();});
  fi.addEventListener('change',async()=>{const files=Array.from(fi.files);if(!files.length)return;await batchUpload({files,prefix,onItem:src=>addSlide(src),progressEl:prog,btn:addBtn});});
}
(function(){document.querySelectorAll('.tl-carousel').forEach(el=>buildCarousel(el));})();

/* =====================================================
   INLINE ALBUMS — carnaval, cruzeiro, cavalo
   ===================================================== */
(function initInlineAlbums(){
  document.querySelectorAll('.tl-ver-fotos').forEach(btn=>{
    const prefix=btn.dataset.inlinePrefix;
    const container=document.querySelector(`.tl-inline-album[data-inline-prefix="${prefix}"]`);
    if(!container)return;let loaded=false;
    btn.addEventListener('click',()=>{const open=container.classList.toggle('open');btn.textContent=open?'📷 Ocultar fotos':'📷 Ver fotos';if(!loaded&&open){loaded=true;buildInlineAlbum(container,prefix);}});
  });

  async function buildInlineAlbum(container,prefix){
    const grid=document.createElement('div');grid.className='tl-inline-grid';container.appendChild(grid);
    const addBtn=document.createElement('button');addBtn.className='tl-add-btn';addBtn.type='button';addBtn.textContent='📎 Adicionar foto ou vídeo';container.appendChild(addBtn);
    const prog=document.createElement('span');prog.className='upload-progress';prog.hidden=true;container.appendChild(prog);

    function addItem(src,isDeletable=true){
      const item=document.createElement('div');item.className='tl-inline-item';
      const media=buildMediaEl(src,'',true);
      if(!isVideoUrl(src)){media.style.cursor='pointer';media.addEventListener('click',()=>{const all=Array.from(grid.querySelectorAll('.tl-inline-item'));lightbox.open(all.map(it=>{const m=it.querySelector('img,video');return{src:getMediaSrc(m),alt:m?.alt||''};}),all.indexOf(item));});}
      item.appendChild(media);setMediaBadge(item,src);
      if(isDeletable)addDeleteBtn(item,()=>getFilename(getMediaSrc(item.querySelector('img,video'))),()=>{item.style.transition='opacity 0.3s';item.style.opacity='0';setTimeout(()=>item.remove(),300);});
      grid.appendChild(item);addBtn.textContent='＋ Adicionar foto ou vídeo';
    }

    try{const{files=[]}=await API.list(prefix);files.forEach(f=>addItem(API.photoUrl(f)));}catch{}

    const fi=document.createElement('input');fi.type='file';fi.accept='image/*,video/*,.dng,.heic,.heif';fi.multiple=true;fi.style.display='none';document.body.appendChild(fi);
    addBtn.addEventListener('click',()=>{fi.value='';fi.click();});
    fi.addEventListener('change',async()=>{const files=Array.from(fi.files);if(!files.length)return;await batchUpload({files,prefix,onItem:src=>addItem(src,true),progressEl:prog,btn:addBtn});});
  }
})();

/* =====================================================
   ÁLBUNS por viagem — dinâmicos + sync timeline
   ===================================================== */
(function initAlbums(){
  const ALBUMS=[
    {id:'ubatuba',         name:'Ubatuba',            emoji:'🌊',prefix:'album-ubatuba',   nameKey:'album-name-ubatuba'},
    {id:'reveillon-praia', name:'Reveillon na Praia',  emoji:'🎆',prefix:'album-reveillon',  nameKey:'album-name-reveillon'},
    {id:'ouro-preto',      name:'Ouro Preto',          emoji:'✨',prefix:'album-ouro-preto', nameKey:'album-name-ouro-preto'},
    {id:'monte-verde',     name:'Monte Verde',          emoji:'🌿',prefix:'album-monte-verde',nameKey:'album-name-monte-verde'},
    {id:'bahia',           name:'Bahia',                emoji:'☀️',prefix:'album-bahia',      nameKey:'album-name-bahia'},
  ];

  const openSet={},modals={};

  ALBUMS.forEach(album=>{
    const modal=buildModal(album);
    modals[album.id]=modal; document.body.appendChild(modal);
    document.querySelectorAll(`[data-album="${album.id}"]`).forEach(btn=>{
      btn.addEventListener('click',e=>{e.stopPropagation();modal.hidden=false;document.body.style.overflow='hidden';openSet[album.id]=modal;});
    });
  });

  document.querySelectorAll('.tl-album-link').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.getElementById('viagens').scrollIntoView({behavior:'smooth'});
      setTimeout(()=>{const modal=modals[btn.dataset.album];if(modal){modal.hidden=false;document.body.style.overflow='hidden';openSet[btn.dataset.album]=modal;}},650);
    });
  });

  function buildModal(album){
    const modal=document.createElement('div');modal.className='album-modal';modal.hidden=true;modal.setAttribute('role','dialog');modal.setAttribute('aria-label',`Álbum: ${album.name}`);
    const inner=document.createElement('div');inner.className='album-modal-inner';
    const header=document.createElement('div');header.className='album-modal-header';
    const title=document.createElement('h2');title.className='album-title';
    // Nome editável
    const savedName=textEditor.saved()[album.nameKey];
    title.textContent=`${album.emoji} ${savedName||album.name}`;
    title.dataset.textKey=album.nameKey;
    textEditor.wire(title);
    const closeBtn=document.createElement('button');closeBtn.className='album-close';closeBtn.type='button';closeBtn.textContent='✕';
    closeBtn.addEventListener('click',()=>closeModal(album.id));
    header.appendChild(title);header.appendChild(closeBtn);

    const uploadBar=document.createElement('div');uploadBar.style.cssText='display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap;';
    const batchBtn=document.createElement('button');batchBtn.className='photo-upload-btn';batchBtn.type='button';batchBtn.textContent='＋ Adicionar fotos e vídeos';batchBtn.style.cssText='font-size:.78rem;padding:.45rem 1rem;';
    const prog=document.createElement('span');prog.className='upload-progress';prog.hidden=true;
    uploadBar.appendChild(batchBtn);uploadBar.appendChild(prog);

    const grid=document.createElement('div');grid.className='album-grid';

    function addItem(src,isDeletable=true){
      const item=document.createElement('div');item.className='album-item has-photo';
      const media=buildMediaEl(src,'',false);item.appendChild(media);setMediaBadge(item,src);
      if(isDeletable)addDeleteBtn(item,()=>getFilename(getMediaSrc(item.querySelector('img,video'))),()=>{item.style.transition='opacity .3s';item.style.opacity='0';setTimeout(()=>item.remove(),300);});
      item.addEventListener('click',e=>{if(e.target.closest('.photo-change-btn,.media-delete-btn,.delete-confirm'))return;const all=Array.from(grid.querySelectorAll('.album-item'));lightbox.open(all.map(el=>{const m=el.querySelector('img,video');return{src:getMediaSrc(m),alt:m?.alt||''};}),all.indexOf(item));});
      grid.appendChild(item);
    }

    // Carrega: arquivos dedicados do álbum + sync da timeline (sem duplicar)
    (async()=>{
      const syncPrefix=ALBUM_SYNC[album.id];
      const [albumRes,syncRes]=await Promise.all([
        API.list(album.prefix).catch(()=>({files:[]})),
        syncPrefix ? API.list(syncPrefix).catch(()=>({files:[]})) : Promise.resolve({files:[]}),
      ]);
      (albumRes.files||[]).forEach(f=>addItem(API.photoUrl(f),true));
      (syncRes.files||[]).forEach(f=>addItem(API.photoUrl(f),false)); // synced: não deletável daqui
    })();

    const fi=document.createElement('input');fi.type='file';fi.accept='image/*,video/*,.dng,.heic,.heif';fi.multiple=true;fi.style.display='none';document.body.appendChild(fi);
    batchBtn.addEventListener('click',()=>{fi.value='';fi.click();});
    fi.addEventListener('change',async()=>{const files=Array.from(fi.files);if(!files.length)return;await batchUpload({files,prefix:album.prefix,onItem:src=>addItem(src,true),progressEl:prog,btn:batchBtn});});

    inner.appendChild(header);inner.appendChild(uploadBar);inner.appendChild(grid);modal.appendChild(inner);
    modal.addEventListener('click',e=>{if(e.target===modal)closeModal(album.id);});
    return modal;
  }

  function closeModal(id){const modal=openSet[id];if(!modal)return;modal.hidden=true;delete openSet[id];if(!Object.keys(openSet).length&&document.getElementById('lightbox').hidden)document.body.style.overflow='';}

  document.addEventListener('keydown',e=>{if(e.key!=='Escape'||!document.getElementById('lightbox').hidden)return;Object.keys(openSet).forEach(id=>closeModal(id));});
})();

/* =====================================================
   INIT — slots estáticos + textos
   ===================================================== */
photoUpload.init();
textEditor.load().then(()=>textEditor.init());

/* =====================================================
   AUDIO PLAYER
   ===================================================== */
(function initAudioPlayer(){
  const FADE=1500, VOL=0.4;
  let muted=true, inMusic=false, audioAvailable=false;
  const tA=new Audio(), tB=new Audio();
  tA.loop=tB.loop=true; tA.volume=tB.volume=0; tA.preload=tB.preload='none';

  const toggleBtn=document.getElementById('sound-toggle');
  const hint=document.getElementById('sound-hint');

  // Toggle oculto por padrão — só aparece se há áudio disponível
  if (toggleBtn) toggleBtn.style.display='none';
  if (hint)      hint.style.display='none';

  // Proba existência dos arquivos de áudio
  async function probeAudio(path, track, statusId, btnId) {
    try {
      const ok = await fetch(path, {method:'HEAD'}).then(r=>r.ok).catch(()=>false);
      if (ok) {
        track.src=path; track.load();
        audioAvailable=true;
        // Atualiza botão e status
        const btn=document.getElementById(btnId);
        const status=document.getElementById(statusId);
        if (btn)    btn.textContent = btn.textContent.replace('Adicionar','Trocar');
        if (status) status.textContent='✓ Carregado';
      }
    } catch {}
    // Mostra toggle se algum arquivo existe
    if (audioAvailable && toggleBtn) {
      toggleBtn.style.display='';
      if (hint) { hint.style.display=''; setTimeout(()=>hint.classList.add('hidden'),4000); }
    }
  }

  probeAudio(API.audioUrl('antes.mp3'), tA, 'status-antes', 'upload-antes');
  probeAudio(API.audioUrl('nossa.mp3'), tB, 'status-nossa', 'upload-nossa');

  if (toggleBtn) {
    toggleBtn.addEventListener('click',()=>{
      muted=!muted; toggleBtn.textContent=muted?'🔇':'🔊';
      if (muted) { fadeVol(tA,0,600); fadeVol(tB,0,600); }
      else { const a=inMusic?tB:tA; play(a); fadeVol(a,VOL,900); (inMusic?tA:tB).volume=0; }
    });
  }

  const ms=document.getElementById('musica');
  if (ms) {
    new IntersectionObserver(entries=>{entries.forEach(e=>{
      if(e.isIntersecting&&!inMusic){inMusic=true;if(!muted&&tB.src)crossfade(tA,tB);}
      else if(!e.isIntersecting&&inMusic){inMusic=false;if(!muted&&tA.src)crossfade(tB,tA);}
    });},{threshold:0.3}).observe(ms);
  }

  function play(t){if(!t.src)return;t.play().catch(()=>{});}
  function crossfade(from,to){play(to);fadeVol(from,0,FADE);fadeVol(to,VOL,FADE);}
  function fadeVol(a,tgt,dur){
    const s=a.volume,d=tgt-s,t0=performance.now();
    function step(ts){const p=Math.min((ts-t0)/dur,1);a.volume=Math.max(0,Math.min(1,s+d*p));if(p<1)requestAnimationFrame(step);}
    requestAnimationFrame(step);
  }

  function bindAudioUpload(btnId, statusId, slot, track, label) {
    const btn=document.getElementById(btnId); if(!btn)return;
    const status=document.getElementById(statusId);
    const inp=document.createElement('input'); inp.type='file'; inp.accept='audio/*,.mp3,.m4a,.ogg,.wav'; inp.style.display='none'; document.body.appendChild(inp);
    btn.addEventListener('click',()=>{inp.value='';inp.click();});
    inp.addEventListener('change', async()=>{
      const file=inp.files[0]; if(!file)return;
      const orig=btn.textContent; btn.textContent='⏳ Enviando…'; btn.disabled=true;
      if(status)status.textContent='';
      try {
        const d=await API.upload(slot,file);
        if (d.success) {
          track.src=d.path+'?t='+Date.now(); track.load();
          audioAvailable=true;
          if(status)status.textContent='✓ Música adicionada! Recarregue para ativar.';
          btn.textContent=`🎵 Trocar ${label}`;
          btn.disabled=false;
          // Mostra o toggle
          if(toggleBtn){toggleBtn.style.display='';if(hint){hint.style.display='';setTimeout(()=>hint.classList.add('hidden'),4000);}}
          // Toca imediatamente se não mutado
          if(!muted&&((slot==='antes'&&!inMusic)||(slot==='nossa'&&inMusic))){play(track);fadeVol(track,VOL,800);}
        } else {
          if(status)status.textContent='⚠️ Erro no upload';
          btn.textContent=orig; btn.disabled=false;
        }
      } catch(e) {
        if(status)status.textContent='⚠️ Erro de rede';
        btn.textContent=orig; btn.disabled=false;
      }
    });
  }

  bindAudioUpload('upload-antes','status-antes','antes',tA,'música de entrada');
  bindAudioUpload('upload-nossa','status-nossa','nossa',tB,'nossa música');
})();

/* =====================================================
   SMOOTH SCROLL
   ===================================================== */
document.querySelectorAll('a[href^="#"]').forEach(a=>{a.addEventListener('click',e=>{const t=document.querySelector(a.getAttribute('href'));if(!t)return;e.preventDefault();t.scrollIntoView({behavior:'smooth',block:'start'});});});
