/// firefly.js
// Game logic kept, but bgm restore/resume & subtle target blending fixes included.
// SMALL PATCH: nicer repel, flash feedback, backdrop-close, safety guards.

const BGM_STATE_KEY = 'babii_bgm_state_v1';

// restore bgm state on game page (best-effort)
(function restoreBgmOnGame(){
  let bgm = document.getElementById('bgmGame') || document.getElementById('bgm');

  if (!bgm) {
    bgm = document.createElement('audio');
    bgm.id = 'bgmGame';
    bgm.preload = 'auto';
    bgm.src = 'bgm.mp3';
    bgm.loop = true;
    bgm.volume = 0.9;
    document.body.appendChild(bgm);
  } else {
    bgm.loop = true;
    bgm.volume = bgm.volume || 0.9;
  }

  function showResumeCTA() {
    if (document.getElementById('resumeMusicBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'resumeMusicBtn';
    btn.textContent = '▶ Resume Music';
    btn.style.cssText = `
      position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%);
      z-index:9999; padding:12px 18px; border-radius:12px;
      font-family: 'Press Start 2P'; cursor:pointer;
      background: linear-gradient(180deg,#ff9ad2,#ff5ba8); border:2px solid rgba(0,0,0,0.6);
    `;
    document.body.appendChild(btn);
    btn.addEventListener('click', async () => {
      try {
        await bgm.play();
        btn.remove();
      } catch(e){ console.warn('resume failed', e); }
    });
  }

  function persist(){
    try {
      localStorage.setItem(BGM_STATE_KEY, JSON.stringify({
        playing: !bgm.paused && !bgm.ended,
        currentTime: Math.floor(bgm.currentTime || 0),
        volume: +bgm.volume.toFixed(2)
      }));
    } catch(e){}
  }

  try {
    const raw = localStorage.getItem(BGM_STATE_KEY);
    if (raw) {
      const st = JSON.parse(raw);
      if (typeof st.currentTime === 'number') {
        try { bgm.currentTime = Math.max(0, Math.min(st.currentTime, bgm.duration || st.currentTime)); } catch(e){}
      }
      if (typeof st.volume === 'number') bgm.volume = st.volume;

      if (st && st.playing === true) {
        bgm.play().then(()=> {
          persist();
        }).catch(()=> {
          showResumeCTA();
        });
      } else {
        persist();
      }
    } else {
      bgm.play().catch(()=> showResumeCTA());
    }
  } catch(e){
    console.warn('restore bgm error', e);
    bgm.play().catch(()=> showResumeCTA());
  }

  setInterval(persist, 1000);
  window.addEventListener('pagehide', persist);
  window.addEventListener('beforeunload', persist);
})();

/* -------------------------
   Game: fireflies + popup
   ------------------------- */

// canvas + state
let canvas, ctx;
let fireflies = [];
let animId = null;
let targetIndex = -1;

const messages = [
  "Sometimes you test my patience so much… and then one tiny smile from you and I’m acting hopelessly in love again. know life hasn’t always been soft with you… but you still show up & love so beautifully.",
  "I love you Babii", 
  "Even after everything we survived… the fights, the fears. you still pull me close like I’m your safest place. That kind of desire is rare.",
  "Remember our long rides? You acting cool, me holding you like my whole life depends on it.. cinematic stuff tbh.",
  "No matter how much drama we go through, you still call me morni and suddenly I forget all my attitude. It’s unfair and effective."
];

class Firefly {
  constructor(isTarget=false){
    this.x = Math.random() * (canvas ? canvas.width / (window.devicePixelRatio||1) : window.innerWidth);
    this.y = Math.random() * (canvas ? canvas.height / (window.devicePixelRatio||1) : window.innerHeight);
    this.size = 7;
    this.speedX = (Math.random() - 0.5) * 0.35;
    this.speedY = (Math.random() - 0.5) * 0.35;
    this.isTarget = isTarget;
    this.wob = Math.random() * Math.PI * 2;
    this.flash = 0; // visual feedback on repel
  }

  move(){
    this.wob += 0.03;
    this.x += this.speedX + Math.sin(this.wob) * 0.3;
    this.y += this.speedY + Math.cos(this.wob) * 0.25;

    // gently decay flash
    this.flash = Math.max(0, this.flash - 0.06);

    if(!canvas) return;
    const cw = canvas.width / (window.devicePixelRatio||1);
    const ch = canvas.height / (window.devicePixelRatio||1);

    if(this.x < -10) this.x = cw + 10;
    if(this.x > cw + 10) this.x = -10;
    if(this.y < -10) this.y = ch + 10;
    if(this.y > ch + 10) this.y = -10;
  }

  draw(){
    if(!ctx) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // compute simple alpha influenced by flash for visible feedback
    const baseAlpha = this.isTarget ? 1 : 0.9;
    const alpha = Math.min(1, baseAlpha + this.flash * 0.6);

    // background square (very faint) — subtle so target blends in
    ctx.fillStyle = this.isTarget ? `rgba(250,220,140,${0.10 + this.flash*0.06})` : `rgba(250,220,140,${0.08 + this.flash*0.04})`;
    ctx.fillRect(this.x-3, this.y-3, this.size+6, this.size+6);

    // body: target slightly darker but still subtle
    ctx.fillStyle = this.isTarget ? `rgba(224,184,90,${alpha})` : `rgba(255,220,168,${alpha})`;
    ctx.fillRect(this.x, this.y, this.size, this.size);

    // small head strip (tiny contrast)
    ctx.fillStyle = `rgba(165,127,58,${Math.min(1, 0.9 + this.flash*0.4)})`;
    ctx.fillRect(this.x, this.y-1, this.size, 1);

    // wings (subtle)
    ctx.fillStyle = `rgba(255,255,255,${0.45 + this.flash*0.12})`;
    ctx.fillRect(this.x-2, this.y+1, 1, this.size-1);
    ctx.fillRect(this.x+this.size+1, this.y+1, 1, this.size-1);

    ctx.restore();
  }
}

function getPointerPos(evt){
  const rect = canvas.getBoundingClientRect();
  // map CSS mouse coords to canvas CSS pixel coords (we store positions in CSS pixels)
  return {
    x: (evt.clientX - rect.left),
    y: (evt.clientY - rect.top)
  };
}

function resizeCanvas(){
  if(!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  // canvas internal pixels
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  // CSS size
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  if(ctx) ctx.setTransform(dpr,0,0,dpr,0,0);
}

function startGame(){
  canvas = document.getElementById('gameCanvas');
  if(!canvas) return console.warn('No #gameCanvas found');
  ctx = canvas.getContext('2d');
  resizeCanvas();

  fireflies = [];
  for(let i=0;i<12;i++) fireflies.push(new Firefly(false));
  targetIndex = Math.floor(Math.random() * fireflies.length);
  if(fireflies[targetIndex]) fireflies[targetIndex].isTarget = true;

  // use pointerdown for better touch support and prevent default to avoid double events
  canvas.addEventListener('pointerdown', onCanvasPointer, { passive: false });
  if(!animId) animId = requestAnimationFrame(loop);
}

function loop(){
  if(!ctx || !canvas) return;
  // clear the CSS-sized canvas area in device pixels
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  for(const f of fireflies){
    f.move();
    f.draw();
  }
  animId = requestAnimationFrame(loop);
}

function stopAnim(){
  if(animId) {
    cancelAnimationFrame(animId);
    animId = null;
  }
}

function onCanvasPointer(e){
  // prevent default to reduce pointer emulation issues on mobile
  e.preventDefault();

  const popup = document.getElementById('notePopup');
  if(popup && popup.style.display === 'flex') return;

  const pos = getPointerPos(e);
  for(let i=0;i<fireflies.length;i++){
    const f = fireflies[i];
    const cx = f.x + f.size/2;
    const cy = f.y + f.size/2;
    const d = Math.hypot(pos.x - cx, pos.y - cy);
    if(d < Math.max(12, f.size + 4)){
      if(f.isTarget){
        showNote();
        return;
      } else {
        // nicer repel: vector from click -> fly, add scaled impulse, set flash
        const dx = f.x - pos.x;
        const dy = f.y - pos.y;
        const dist = Math.max(Math.hypot(dx,dy), 1);
        const nx = dx / dist;
        const ny = dy / dist;
        const impulse = 6 + Math.random() * 4; // tuned impulse
        f.x += nx * impulse * 4;
        f.y += ny * impulse * 4;
        // also nudge intrinsic speeds so it continues fleeing
        f.speedX += nx * (impulse * 0.02);
        f.speedY += ny * (impulse * 0.02);
        f.flash = 1.2;
      }
    }
  }
}

function showNote(){
  stopAnim();
  const dynamic = document.getElementById('noteMsg');
  if(dynamic) dynamic.textContent = messages[Math.floor(Math.random() * messages.length)];
  const popup = document.getElementById('notePopup');
  if(popup) {
    popup.style.display = 'flex';
    const box = popup.querySelector('.noteContent');
    if(box) { box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop'); }
  }
  // also allow clicking backdrop to close
  const popupEl = document.getElementById('notePopup');
  if(popupEl && !popupEl._backdropListener) {
    popupEl._backdropListener = (ev) => {
      if(ev.target === popupEl) closeNote();
    };
    popupEl.addEventListener('click', popupEl._backdropListener);
  }
}

function closeNote(){
  const popup = document.getElementById('notePopup');
  if(popup) {
    popup.style.display = 'none';
    // remove backdrop listener (cleanup)
    if(popup._backdropListener) {
      popup.removeEventListener('click', popup._backdropListener);
      popup._backdropListener = null;
    }
  }
  // reassign target randomly & ensure animation restarts
  fireflies.forEach(f => f.isTarget = false);
  targetIndex = Math.floor(Math.random() * fireflies.length);
  if(fireflies[targetIndex]) fireflies[targetIndex].isTarget = true;
  if(!animId) animId = requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', ()=> {
  const backBtn = document.getElementById('backToGame');
  if(backBtn) backBtn.addEventListener('click', closeNote);
  startGame();
  window.addEventListener('resize', ()=> {
    resizeCanvas();
    // clamp fireflies into new bounds (CSS pixel space)
    const cw = canvas ? canvas.width / (window.devicePixelRatio||1) : window.innerWidth;
    const ch = canvas ? canvas.height / (window.devicePixelRatio||1) : window.innerHeight;
    fireflies.forEach(f => {
      f.x = Math.max(6, Math.min(f.x, cw - 6));
      f.y = Math.max(6, Math.min(f.y, ch - 6));
    });
  });
});
