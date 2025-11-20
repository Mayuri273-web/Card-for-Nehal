// homepage.js
// Floating-only stickers (no dragging). Reset layout button kept.
// Single, consistent music handling and saved states.

const STICKER_STATE_KEY = 'babii_stickers_v2';
const BGM_STATE_KEY = 'babii_bgm_state_v1';
const RESET_ID = 'resetBtn';

const stickerWall = document.getElementById('stickerWall');

// ------------------- AUDIO / UI -------------------
let bgm = document.getElementById('bgm');
if (!bgm) {
  bgm = document.createElement('audio');
  bgm.id = 'bgm';
  bgm.preload = 'auto';
  bgm.src = 'bgm.mp3';
  bgm.loop = true;
  bgm.volume = 0.9;
  document.body.appendChild(bgm);
}

// create / reuse play button
let playBtn = document.getElementById('playBgm');
if (!playBtn) {
  playBtn = document.createElement('button');
  playBtn.id = 'playBgm';
  playBtn.className = 'musicBtn';
  document.body.appendChild(playBtn);
}

// overlay CTA in case autoplay is blocked
let overlay = document.getElementById('audioOverlay');
if (!overlay) {
  overlay = document.createElement('div');
  overlay.id = 'audioOverlay';
  overlay.style.cssText = `
    position:fixed; inset:0; display:none; align-items:center; justify-content:center;
    z-index:9998; background:linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55));
  `;
  overlay.innerHTML = `<button id="enableAudio" style="
    padding:14px 20px;border-radius:12px;border:0;background:linear-gradient(180deg,#ff6ea3,#ff2e72);
    font-family: 'Press Start 2P'; font-size:13px; cursor:pointer;">▶ Enable Audio</button>`;
  document.body.appendChild(overlay);
}

function persistBgmState() {
  try {
    localStorage.setItem(BGM_STATE_KEY, JSON.stringify({
      playing: !bgm.paused && !bgm.ended,
      currentTime: Math.floor(bgm.currentTime || 0),
      volume: +bgm.volume.toFixed(2)
    }));
  } catch (e) { /* ignore */ }
}

function setPlayBtnUI(isPlaying){
  if(!playBtn) return;
  playBtn.textContent = isPlaying ? '⏸ Pause Music' : '▶ Play Music';
  playBtn.classList.toggle('playing', !!isPlaying);
}

// tryAutoplay (respects saved playing flag so pause persists across pages)
async function tryAutoplay() {
  try {
    const raw = localStorage.getItem(BGM_STATE_KEY);
    if (raw) {
      const st = JSON.parse(raw);
      if (st && st.playing === false) {
        // user paused previously: restore time/volume but do not autoplay
        if (typeof st.currentTime === 'number') try { bgm.currentTime = Math.max(0, st.currentTime); } catch(e){}
        if (typeof st.volume === 'number') bgm.volume = st.volume;
        setPlayBtnUI(false);
        overlay.style.display = 'none';
        return;
      }
      // if playing === true, we will attempt autoplay below
      if (st && typeof st.currentTime === 'number') try { bgm.currentTime = Math.max(0, st.currentTime); } catch(e){}
      if (st && typeof st.volume === 'number') bgm.volume = st.volume;
    }
  } catch(e){
    console.warn('bgm state read error', e);
  }

  // attempt autoplay
  try {
    await bgm.play();
    setPlayBtnUI(true);
    overlay.style.display = 'none';
    persistBgmState();
  } catch (err) {
    // autoplay blocked — ask for a user gesture
    setPlayBtnUI(false);
    overlay.style.display = 'flex';
  }
}

// overlay enable button
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'enableAudio') {
    bgm.play().then(()=> {
      overlay.style.display = 'none';
      setPlayBtnUI(true);
      persistBgmState();
    }).catch(()=> {});
  }
});

// play/pause toggle
playBtn.addEventListener('click', async () => {
  if (bgm.paused) {
    try {
      await bgm.play();
      setPlayBtnUI(true);
    } catch(e) {
      overlay.style.display = 'flex';
    }
  } else {
    bgm.pause();
    setPlayBtnUI(false);
  }
  persistBgmState();
});

// persist periodically & on unload
setInterval(persistBgmState, 1000);
window.addEventListener('pagehide', persistBgmState);
window.addEventListener('beforeunload', persistBgmState);

// ------------------- STICKERS -------------------
if (!stickerWall) {
  console.warn('No #stickerWall found in DOM — skipping stickers.');
} else {
  const CATALOG = [
    {cls:'pastelStar', label:'✩'},
    {cls:'pastelHeart', label:'❤'},
    {cls:'pastelMoon', label:'🌙'},
    {cls:'retroStar', label:'★'},
    {cls:'retroPixel', label:'◼'},
    {cls:'kawaiiBear', label:'ʕ•ᴥ•ʔ'},
    {cls:'sparkle', label:'✦'},
    {cls:'minecraftFull', label:'❤'},
    {cls:'pastelPixelHeart', label:'❤'}
  ];

  const DEFAULT_COUNT = 25;
  let stickersState = [];

  Object.assign(stickerWall.style, {
    position:'fixed', inset:'0', width:'100vw', height:'100vh',
    pointerEvents:'none', zIndex:'2', overflow:'hidden'
  });

  function rand(min,max){ return Math.random()*(max-min)+min; }
  function uid(){ return Math.random().toString(36).slice(2,9); }

  function loadStickersState(){
    const raw = localStorage.getItem(STICKER_STATE_KEY);
    if(raw){
      try{
        const parsed = JSON.parse(raw);
        if(Array.isArray(parsed) && parsed.length) { stickersState = parsed; return; }
      } catch(e){ console.warn('invalid saved sticker data, regenerating'); }
    }
    stickersState = [];
    for(let i=0;i<DEFAULT_COUNT;i++){
      const t = CATALOG[Math.floor(Math.random()*CATALOG.length)];
      stickersState.push(makeRandomStickerState(t));
    }
  }

  function makeRandomStickerState(t){
    const left = +rand(4,96).toFixed(2);
    const top  = +rand(6,92).toFixed(2);
    const s = +rand(0.85,1.25).toFixed(2);
    const rot = Math.floor(rand(-30,30));
    const fx = Math.floor(rand(-10,10));
    const fy = Math.floor(rand(-10,10));
    const dur = (rand(4.0,9.0)).toFixed(2) + 's';
    const delay = (rand(0,3)).toFixed(2) + 's';
    return { id: uid(), cls: t.cls, label: t.label, left, top, fx, fy, dur, delay, rot: rot+'deg', s };
  }

  function renderStickers(){
    stickerWall.innerHTML = '';
    stickersState.forEach(st => {
      const el = document.createElement('div');
      el.className = `sticker ${st.cls}`;
      el.dataset.id = st.id;
      el.textContent = st.label;

      el.style.left = st.left + '%';
      el.style.top  = st.top + '%';

      el.style.setProperty('--fx', st.fx + 'px');
      el.style.setProperty('--fy', st.fy + 'px');
      el.style.setProperty('--rot', st.rot);
      el.style.setProperty('--s', st.s);
      el.style.setProperty('--dur', st.dur);
      el.style.setProperty('--delay', st.delay);
      el.style.pointerEvents = 'none';

      stickerWall.appendChild(el);

      // micro-stagger float
      setTimeout(() => {
        const fx = Math.floor(rand(-8,8));
        const fy = Math.floor(rand(-8,8));
        el.style.setProperty('--fx', fx + 'px');
        el.style.setProperty('--fy', fy + 'px');
      }, Math.floor(rand(200, 2800)));
    });
  }

  function saveStickers(){ localStorage.setItem(STICKER_STATE_KEY, JSON.stringify(stickersState)); }

  function resetLayout(){
    if(confirm('Reset sticker layout to a fresh random layout?')) {
      localStorage.removeItem(STICKER_STATE_KEY);
      loadStickersState();
      renderStickers();
      saveStickers();
      alert('Sticker layout reset.');
    }
  }

  // init stickers
  loadStickersState();
  renderStickers();
  saveStickers();

  // attach reset button if present
  const resetBtn = document.getElementById(RESET_ID);
  if (resetBtn) resetBtn.addEventListener('click', resetLayout);

  // rerender on resize
  window.addEventListener('resize', ()=> renderStickers());
}

// ------------------- BOOT -------------------
document.addEventListener('DOMContentLoaded', () => {
  tryAutoplay();
  setTimeout(()=> setPlayBtnUI(!bgm.paused && !bgm.ended), 200);
});
