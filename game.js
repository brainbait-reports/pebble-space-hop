/* Pebble's Space Hop v2 - BrainBait. Original code, art, music and sounds. No external assets, no network. */
(function () {
  'use strict';
  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  const Q = new URLSearchParams(location.search);
  const DEMO = Q.has('demo'), COVER = Q.has('cover');
  let seed = Q.has('seed') ? (+Q.get('seed') >>> 0) : (Math.random() * 1e9) >>> 0;
  function rnd() { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  const R = (a, b) => a + (b - a) * rnd(), clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---- constants (logical units) ----
  const W = 400, H = 711, G = 1500, JUMP = 820, MAXH = JUMP * JUMP / (2 * G), MOVE = 340, MAXGAP = 150;
  const INK = '#191437', PR = 34, PS = 1.4, HW = 30;   // HW = Pebble half-width; side walls are solid (no wrap)
  const REACH_X = 200;   // max centre-to-centre x step between required platforms
  const WORLDS = [
    { name: 'The Moon', at: 0, bg: ['#1b1640', '#3d2a78'], plat: '#cfc8ee', intro: 'move', key: 0 },
    { name: 'The Rings', at: 2500, bg: ['#0f2a4a', '#1f6a8a'], plat: '#3cc8b4', intro: 'break', key: -3 },
    { name: 'The Nebula', at: 6000, bg: ['#3a1450', '#b0408a'], plat: '#ff9fd0', intro: 'bouncy', key: 2 }];
  const OUTFITS = [{ id: 'classic', name: 'Classic Pebble', cost: 0 }, { id: 'bow', name: 'Bow Pebble', cost: 15 },
    { id: 'party', name: 'Party Pebble', cost: 30 }, { id: 'shades', name: 'Cool Pebble', cost: 50 }, { id: 'crown', name: 'Royal Pebble', cost: 80 }];
  const POWERS = { jet: { t: 2.2, c: '#ff8c3c' }, shield: { t: 0, c: '#5ad2ff' }, magnet: { t: 8, c: '#ff5a6e' } };

  // ---- saved data (never written in demo mode) ----
  const store = { get(k, d) { try { const v = localStorage.getItem('psh_' + k); return v === null ? d : v; } catch (e) { return d; } },
                  set(k, v) { if (DEMO) return; try { localStorage.setItem('psh_' + k, v); } catch (e) {} } };
  let best = +store.get('best', 0) || 0, bank = +store.get('bank', 0) || 0, muted = store.get('muted', '0') === '1';
  let owned = (store.get('owned', 'classic') + '').split(','), outfit = store.get('outfit', 'classic');
  if (!owned.includes(outfit)) outfit = 'classic';
  // Top 3 board, saved on this device only (localStorage)
  let board = []; try { board = JSON.parse(store.get('top', '[]')) || []; } catch (e) { board = []; }
  board = board.filter(e => e && typeof e.n === 'string' && isFinite(e.s)).sort((a, b) => b.s - a.s).slice(0, 3);
  const NB = new Set([32519,8130,16322,7426,27586,27093,1989,30804,7236,15428,7301,7181,11338,11586,9009,15157,3208,9672,1990,20558,11602,32712,9344,27605]);   // hashed short-word filter (no plain words in source)
  const nameCode = s => { let v = 0; for (let i = 0; i < 3; i++) v += ((s.charCodeAt(i) - 65) ^ (7 + 3 * i)) << (5 * i); return v; };
  const qualifies = s => s > 0 && (board.length < 3 || s > board[board.length - 1].s);
  let letters = [15, 4, 1], slot = 0, nameNote = 0;   // starts at 'PEB'
  let viewIdx = Math.max(0, OUTFITS.findIndex(o => o.id === outfit));

  // ---- canvas sizing ----
  let dpr = 1, cw = 0, ch = 0, sc = 1, ox = 0, oy = 0;
  const CORN = { sound: { x: 0, y: 0 }, pause: { x: 0, y: 0 }, restart: { x: 0, y: 0 } };
  const CR = 26; let safe = { t: 0, r: 0, b: 0, l: 0 }; const bgCache = [];
  function resize() {
    const vv = window.visualViewport;
    dpr = Math.min(window.devicePixelRatio || 1, 2); cw = Math.round(vv ? vv.width : innerWidth); ch = Math.round(vv ? vv.height : innerHeight);
    cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    const cs = getComputedStyle(document.getElementById('sa'));
    safe = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    const aw = cw - safe.l - safe.r, ah = ch - safe.t - safe.b;
    sc = Math.min(aw / W, ah / H); ox = safe.l + (aw - W * sc) / 2; oy = safe.t + (ah - H * sc) / 2;
    window.scrollTo(0, 0); bgCache.length = 0; updCorners();
  }
  addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 200));
  if (window.visualViewport) visualViewport.addEventListener('resize', resize);
  resize();
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());

  // ---- audio: created only after the first user gesture ----
  let ac = null, master = null, musicOn = false, nextNote = 0, stepN = 0, musicKey = 0;
  function ensureAudio() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ac.destination);
      const bf = ac.createBuffer(1, 1, 22050), src = ac.createBufferSource(); src.buffer = bf; src.connect(ac.destination); src.start(0); if (ac.resume) ac.resume(); } catch (e) { ac = null; }
  }
  function tone(f1, f2, dur, type, vol, when) {
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain(), t0 = when || ac.currentTime;
    o.type = type || 'sine'; o.frequency.setValueAtTime(f1, t0); if (f2 !== f1) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const sfx = { jump: () => tone(330, 620, 0.11, 'sine', 0.07), boing: () => tone(200, 900, 0.25, 'triangle', 0.1),
    star: () => { tone(880, 1320, 0.09, 'triangle', 0.08); tone(1320, 1760, 0.09, 'triangle', 0.06, ac && ac.currentTime + 0.06); },
    power: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.12, 'square', 0.04, ac && ac.currentTime + i * 0.07)),
    pop: () => tone(700, 200, 0.2, 'triangle', 0.1), crumble: () => tone(180, 90, 0.15, 'sawtooth', 0.04),
    over: () => tone(500, 180, 0.6, 'sine', 0.1), click: () => tone(600, 800, 0.05, 'square', 0.035),
    world: () => [392, 523, 659, 784].forEach((f, i) => tone(f, f, 0.18, 'triangle', 0.07, ac && ac.currentTime + i * 0.1)) };
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16], LEAD = [0, 2, 4, 2, 5, 4, 2, -1, 3, 4, 5, 7, 5, 4, 2, -1], BASS = [0, -1, 7, -1, 5, -1, 7, -1];
  const hz = semi => 261.63 * Math.pow(2, semi / 12);
  function musicTick() {                      // tiny lookahead scheduler, original 16-step chiptune
    if (!ac || !musicOn || muted) { if (ac) nextNote = ac.currentTime + 0.05; return; }
    const spb = 60 / 132 / 2;
    while (nextNote < ac.currentTime + 0.15) {
      const i = stepN % 16, l = LEAD[i];
      if (l >= 0) tone(hz(PENTA[l] + musicKey), hz(PENTA[l] + musicKey), spb * 0.9, 'square', 0.022, nextNote);
      const b = BASS[i % 8]; if (b >= 0) tone(hz(b - 24 + musicKey), hz(b - 24 + musicKey), spb * 1.6, 'triangle', 0.05, nextNote);
      if (i % 4 === 2) tone(2400, 1200, 0.03, 'square', 0.008, nextNote);
      nextNote += spb; stepN++;
    }
  }
  setInterval(musicTick, 40);
  function setMuted(m) { muted = m; store.set('muted', m ? '1' : '0'); if (master) master.gain.value = m ? 0 : 1; }

  // ---- particles (pooled) ----
  const POOL = []; for (let i = 0; i < 120; i++) POOL.push({ on: false }); let poolI = 0;
  function burst(x, y, n, color, spd, size) {
    for (let k = 0; k < n; k++) {
      const p = POOL[poolI]; poolI = (poolI + 1) % POOL.length; const a = Math.random() * 6.283, s = (0.4 + Math.random() * 0.6) * spd;
      p.on = true; p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.life = p.max = 0.5 + Math.random() * 0.4; p.c = color; p.s = size || 4;
    }
  }

  // ---- state ----
  let state = 'start', P, plats, stars, rocks, pows, camY, maxHeight, hOff = 0, runStars, starPts, overT, t = 0, world = 0, banner = 0, lastMain;
  const stats = { missed: 0, landChecks: 0, maxReach: 0, xMin: 1e9, xMax: -1e9, maxGap: 0, powers: { jet: 0, shield: 0, magnet: 0 }, worldsSeen: 0, bounces: 0, rockHits: 0, shieldSaves: 0 };
  const bgStars = []; for (let i = 0; i < 90; i++) bgStars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.4, p: Math.random() * 0.5 + 0.1 });
  let startWorld = DEMO && Q.has('world') ? clamp(+Q.get('world') - 1, 0, 2) : 0;
  let unlocked = clamp(+store.get('worlds', 1) || 1, 1, 3), selWorld = 0;   // worlds reached in real runs (Moon always)

  function reset() {
    hOff = WORLDS[startWorld].at;
    P = { x: W / 2, y: H - 120, vx: 0, vy: -JUMP, face: 1, squish: 0, spin: 0, power: null, pt: 0, shield: false, inv: 0 };
    plats = [{ x: 0, y: H - 40, w: W, vx: 0, kind: 'ground', main: true }]; lastMain = plats[0];
    stars = []; rocks = []; pows = []; camY = 0; maxHeight = 0; runStars = 0; starPts = 0; overT = 0; banner = 0;
    world = worldAt(hOff); stats.maxGap = 0; musicKey = WORLDS[world].key;
    for (const p of POOL) p.on = false;
    while (lastMain.y > -H) addChunk();
  }
  const worldAt = h => h >= WORLDS[2].at ? 2 : h >= WORLDS[1].at ? 1 : 0;
  const curH = () => maxHeight + hOff;
  const score = () => Math.round(curH() / 10) - Math.round(hOff / 10) + starPts;
  const diff = () => Math.min(1, curH() / 9000);

  function addChunk() {
    const d = diff(), y0 = lastMain.y, h = -y0 + hOff, wi = worldAt(h);
    const gap = Math.min(MAXGAP, R(62, 92) + d * 55);
    const w = Math.max(72, 104 - d * 30), y = y0 - gap;
    const pc = lastMain.kind === 'ground' ? W / 2 : lastMain.x + lastMain.w / 2;
    const cx = clamp(pc + R(-REACH_X, REACH_X), w / 2, W - w / 2), x = cx - w / 2;
    // reachability (no wrap): horizontal distance needed vs distance Pebble can travel during the jump
    const air = JUMP / G + Math.sqrt(2 * Math.max(0, MAXH - gap) / G), need = Math.max(0, Math.abs(cx - pc) - (w / 2 + 16));
    if (lastMain.kind !== 'ground') stats.maxReach = Math.max(stats.maxReach, need / (MOVE * air - 40));
    const kind = wi === 2 && rnd() < 0.18 ? 'bouncy' : 'rock';
    const m = { x, y, w, vx: 0, kind, main: true, wi };
    plats.push(m); stats.maxGap = Math.max(stats.maxGap, y0 - y); lastMain = m;
    // optional extra platform (never needed to progress) introduces the world's special type
    if (rnd() < 0.45) {
      let types = ['rock']; if (h > 800) types.push('move'); if (wi >= 1) types.push('break', 'break'); if (wi >= 2) types.push('bouncy');
      const k = types[Math.floor(rnd() * types.length)], ew = 80;
      let ex = (x + w / 2 > W / 2 ? R(0, x - ew) : R(x + w, W - ew)); ex = clamp(ex, 0, W - ew);
      plats.push({ x: ex, y: y + gap * R(0.35, 0.65), w: ew, vx: k === 'move' ? (rnd() < 0.5 ? -1 : 1) * R(35, 70) : 0, kind: k, main: false, wi });
    }
    if (rnd() < 0.42) stars.push({ x: x + w / 2 + R(-40, 40), y: y - R(45, 95), on: true });
    if (rnd() < (DEMO ? 0.13 : 0.06) && h > 300) { const ks = ['jet', 'shield', 'magnet']; pows.push({ x: x + w / 2, y: y - 32, k: ks[Math.floor(rnd() * 3)], on: true }); }
    if (h > (DEMO ? 250 : 800) && rnd() < 0.12 + d * 0.2)
      rocks.push({ x: R(20, W - 20), y: y + gap / 2 - 10, r: R(16, 22), vx: (rnd() < 0.5 ? -1 : 1) * R(25, 25 + 50 * d), rot: R(0, 6), on: true });
  }

  // ---- input ----
  const keys = {}, touches = {}, tsx = {}; let touchDir = 0, mouseDir = 0, slideX = null, slideId = null, mouseDown = false, mouseSX = 0;
  const L = (x, y) => [(x - ox) / sc, (y - oy) / sc];
  const inBtn = (lx, ly, b) => Math.abs(lx - b[0]) < b[2] / 2 && Math.abs(ly - b[1]) < b[3] / 2;
  const BTN = { up0: [120, 292, 76, 72], up1: [200, 292, 76, 72], up2: [280, 292, 76, 72], dn0: [120, 448, 76, 72], dn1: [200, 448, 76, 72], dn2: [280, 448, 76, 72], ok: [W / 2, 540, 170, 62], play: [W / 2, 642, 190, 62], w0: [72, 562, 116, 82], w1: [200, 562, 116, 82], w2: [328, 562, 116, 82], left: [62, 330, 56, 56], right: [338, 330, 56, 56], buy: [W / 2, 462, 210, 46],
                again: [W / 2, 472, 210, 56], home: [W / 2, 532, 160, 44], resume: [W / 2, 380, 200, 60] };
  function updCorners() { const r = ox + W * sc, y = oy + 8 + CR; CORN.sound.x = r - 8 - CR; CORN.pause.x = r - 16 - 3 * CR; CORN.restart.x = r - 24 - 5 * CR; CORN.sound.y = CORN.pause.y = CORN.restart.y = y; }
  function corners() { return CORN; }
  function cornerHit(x, y) {
    const c = corners(), hit = b => Math.hypot(x - b.x, y - b.y) < CR + 4;
    if (hit(c.sound)) { setMuted(!muted); if (!muted) sfx.click(); return true; }
    if (state === 'play' || state === 'pause') {
      if (hit(c.pause)) { togglePause(); return true; }
      if (hit(c.restart)) { start(); return true; }
    }
    return false;
  }
  function uiTap(x, y) {   // CSS px; true when the tap was used by UI
    ensureAudio();
    if (cornerHit(x, y)) return true;
    const [lx, ly] = L(x, y);
    if (state === 'start') {
      if (inBtn(lx, ly, BTN.left)) { viewIdx = (viewIdx + OUTFITS.length - 1) % OUTFITS.length; sfx.click(); }
      else if (inBtn(lx, ly, BTN.right)) { viewIdx = (viewIdx + 1) % OUTFITS.length; sfx.click(); }
      else if (inBtn(lx, ly, BTN.buy)) buyOrWear();
      else if (inBtn(lx, ly, BTN.w0)) pickWorld(0); else if (inBtn(lx, ly, BTN.w1)) pickWorld(1); else if (inBtn(lx, ly, BTN.w2)) pickWorld(2);
      else if (inBtn(lx, ly, BTN.play)) start();
      return true;
    }
    if (state === 'name') {
      for (let i = 0; i < 3; i++) { if (inBtn(lx, ly, BTN['up' + i])) { slot = i; cycle(1); } else if (inBtn(lx, ly, BTN['dn' + i])) { slot = i; cycle(-1); } }
      if (inBtn(lx, ly, BTN.ok)) submitName();
      return true;
    }
    if (state === 'over' && (overT <= 0.8 || P.qualify)) return true;
    if (state === 'over' && overT > 0.8) { if (inBtn(lx, ly, BTN.home)) { state = 'start'; sfx.click(); } else start(); return true; }
    if (state === 'pause') { togglePause(); return true; }
    return false;
  }
  function cycle(d) { letters[slot] = (letters[slot] + d + 26) % 26; sfx.click(); }
  function submitName() {
    let n = String.fromCharCode(65 + letters[0], 65 + letters[1], 65 + letters[2]);
    if (NB.has(nameCode(n))) { n = 'PEB'; nameNote = 2.5; }
    if (!DEMO) { board.push({ n, s: score() }); board.sort((a, b) => b.s - a.s); board = board.slice(0, 3); store.set('top', JSON.stringify(board)); }
    P.qualify = false; P.lastName = n; state = 'over'; overT = 1; sfx.power();
  }
  function pickWorld(i) { if (i < unlocked) { selWorld = i; sfx.click(); } }
  function buyOrWear() {
    const o = OUTFITS[viewIdx];
    if (owned.includes(o.id)) { outfit = o.id; store.set('outfit', outfit); sfx.click(); return; }
    if (bank >= o.cost) { bank -= o.cost; owned.push(o.id); outfit = o.id; store.set('bank', bank); store.set('owned', owned.join(',')); store.set('outfit', outfit); sfx.power(); }
  }
  const recompute = () => { let d = 0; for (const k in touches) d += touches[k]; touchDir = clamp(d, -1, 1); };
  cv.addEventListener('touchstart', e => { e.preventDefault(); for (const tc of e.changedTouches) { if (uiTap(tc.clientX, tc.clientY)) continue; tsx[tc.identifier] = tc.clientX; touches[tc.identifier] = tc.clientX < cw / 2 ? -1 : 1; } recompute(); }, { passive: false });
  cv.addEventListener('touchmove', e => { e.preventDefault();
    for (const tc of e.changedTouches) {
      const id = tc.identifier;
      if (id === slideId) { slideX = tc.clientX; continue; }
      if (id in tsx && Math.abs(tc.clientX - tsx[id]) > 6) { slideId = id; slideX = tc.clientX; delete touches[id]; }   // drag = 1:1 slider
      else if (id in touches) touches[id] = tc.clientX < cw / 2 ? -1 : 1;
    } recompute(); }, { passive: false });
  const tEnd = e => { e.preventDefault(); for (const tc of e.changedTouches) { const id = tc.identifier; delete touches[id]; delete tsx[id]; if (id === slideId) { slideId = null; slideX = null; } } recompute(); };
  cv.addEventListener('touchend', tEnd, { passive: false }); cv.addEventListener('touchcancel', tEnd, { passive: false }); cv.addEventListener('touchend', ensureAudio);
  cv.addEventListener('mousedown', e => { if (uiTap(e.clientX, e.clientY)) return; mouseDown = true; mouseSX = e.clientX; mouseDir = e.clientX < cw / 2 ? -1 : 1; });
  addEventListener('mousemove', e => { if (!mouseDown) return; if (slideId === 'm' || Math.abs(e.clientX - mouseSX) > 6) { slideId = 'm'; slideX = e.clientX; mouseDir = 0; } });
  addEventListener('mouseup', () => { mouseDown = false; mouseDir = 0; if (slideId === 'm') { slideId = null; slideX = null; } });
  addEventListener('keydown', e => {
    ensureAudio(); keys[e.code] = true;
    if (state === 'name') {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') slot = (slot + 2) % 3; if (e.code === 'ArrowRight' || e.code === 'KeyD') slot = (slot + 1) % 3;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') cycle(1); if (e.code === 'ArrowDown' || e.code === 'KeyS') cycle(-1);
      if (e.code === 'Enter' || e.code === 'Space') submitName();
      e.preventDefault(); return;
    }
    if (e.code === 'Space' || e.code === 'Enter') { if (state === 'start' || (state === 'over' && overT > 0.8 && !P.qualify)) start(); else if (state === 'pause') togglePause(); }
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    if (e.code === 'KeyM') setMuted(!muted);
    if (state === 'start') {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') viewIdx = (viewIdx + OUTFITS.length - 1) % OUTFITS.length;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') viewIdx = (viewIdx + 1) % OUTFITS.length;
      if (e.code === 'KeyB') buyOrWear();
      if (e.code === 'Digit1') pickWorld(0); if (e.code === 'Digit2') pickWorld(1); if (e.code === 'Digit3') pickWorld(2);
    }
    if (['ArrowLeft', 'ArrowRight', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => keys[e.code] = false);
  function clearInput() { for (const k in keys) keys[k] = false; for (const k in touches) delete touches[k]; for (const k in tsx) delete tsx[k]; touchDir = 0; mouseDir = 0; slideX = null; slideId = null; mouseDown = false; }
  addEventListener('blur', clearInput);
  function togglePause() { if (state === 'play') { state = 'pause'; musicOn = false; clearInput(); } else if (state === 'pause') { state = 'play'; musicOn = true; } }
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); last = performance.now(); acc = 0; });

  function start() { if (!DEMO) startWorld = selWorld; reset(); state = 'play'; musicOn = true; sfx.click(); }

  // ---- demo autopilot ----
  function demoDir() {
    let target = null;
    if (P.vy < 0) { const apex = P.y - P.vy * P.vy / (2 * G); for (const p of plats) if (!p.gone && p.y > apex + 15 && p.y < P.y - 5 && (!target || p.y < target.y)) target = p; }
    else for (const p of plats) if (!p.gone && p.y > P.y + PR - 4 && (!target || p.y < target.y)) target = p;
    if (!target) return 0;
    const dx = target.x + target.w / 2 - P.x;
    return Math.abs(dx) < 12 ? 0 : Math.sign(dx);
  }

  function givePower(k) {
    stats.powers[k]++; sfx.power(); burst(P.x, P.y, 10, POWERS[k].c, 200, 5);
    if (k === 'shield') P.shield = true; else { P.power = k; P.pt = POWERS[k].t; }
  }

  function compact(a, keep) { let j = 0; for (let i = 0; i < a.length; i++) if (keep(a[i])) a[j++] = a[i]; a.length = j; }
  let CUT = 0;
  const keepPlat = p => p.y < CUT && !(p.fall > 1.2), keepOn = o => o.on && o.y < CUT;
  // ---- update ----
  function step(dt) {
    t += dt;
    for (const p of POOL) if (p.on) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.life -= dt; if (p.life <= 0) p.on = false; }
    nameNote = Math.max(0, nameNote - dt);
    if (state === 'name') return;
    if (state === 'start' || state === 'pause') { if (DEMO && state === 'start' && t > 1) start(); return; }
    if (state === 'over') { overT += dt; P.spin += dt * 3; P.vy = Math.min(P.vy + 300 * dt, 120); P.y += P.vy * dt; if (P.qualify && overT > 0.9) { state = 'name'; slot = 0; } if (DEMO && overT > 2.5) start(); return; }
    let dir = 0;
    if (keys.ArrowLeft || keys.KeyA) dir -= 1; if (keys.ArrowRight || keys.KeyD) dir += 1;
    dir += touchDir + mouseDir; if (DEMO) dir = demoDir(); dir = clamp(dir, -1, 1);
    if (slideX !== null && !DEMO) {             // slider: Pebble's x = finger x, no easing
      const nx = clamp((slideX - ox) / sc, HW, W - HW); if (Math.abs(nx - P.x) > 0.5) P.face = nx > P.x ? 1 : -1; P.x = nx; P.vx = 0;
    } else { P.vx += (dir * MOVE - P.vx) * Math.min(1, dt * 12); if (dir) P.face = dir; }
    const prevB = P.y + PR;
    if (P.power === 'jet') { P.vy = Math.min(P.vy, -1050); if (Math.random() < 0.35) burst(P.x - P.face * 4, P.y + 30, 1, Math.random() < 0.5 ? '#ffd84a' : '#ff8c3c', 60, 5); }
    else P.vy += G * dt;
    if (P.power) { P.pt -= dt; if (P.pt <= 0) P.power = null; }
    P.inv = Math.max(0, P.inv - dt);
    P.x += P.vx * dt; P.y += P.vy * dt;
    if (P.x < HW) { P.x = HW; if (P.vx < 0) P.vx = 0; } if (P.x > W - HW) { P.x = W - HW; if (P.vx > 0) P.vx = 0; }   // solid walls
    stats.xMin = Math.min(stats.xMin, P.x); stats.xMax = Math.max(stats.xMax, P.x);
    let land = null;
    for (const p of plats) {
      if (p.vx) { p.x += p.vx * dt; if (p.x < 0) { p.x = 0; p.vx *= -1; } if (p.x + p.w > W) { p.x = W - p.w; p.vx *= -1; } }
      if (p.gone) { p.fall = (p.fall || 0) + dt; p.y += 200 * dt; continue; }
      // swept test: bottom went from above the top to at/below it this step, while falling; hitbox 16 wider each side
      if (P.vy > 0 && prevB <= p.y + 2 && P.y + PR >= p.y && P.x > p.x - 16 && P.x < p.x + p.w + 16 && (!land || p.y < land.y)) land = p;
    }
    const curB = P.y + PR, vyPre = P.vy;
    if (land) {
      const p = land; P.y = p.y - PR; P.squish = 1; stats.bounces++;
      if (p.kind === 'bouncy') { P.vy = -JUMP * 1.45; sfx.boing(); } else { P.vy = -JUMP; sfx.jump(); }
      if (p.kind === 'break') { p.gone = true; sfx.crumble(); burst(p.x + p.w / 2, p.y + 6, 6, '#b07a48', 120, 4); }
      else burst(P.x, p.y, 3, 'rgba(255,255,255,.8)', 60, 3);
    }
    // independent check: any platform crossed downward with real overlap that did not produce a landing = a missed bounce
    if (vyPre > 0 && !land) for (const p of plats) if (!p.gone && prevB <= p.y && curB >= p.y && P.x > p.x - 4 && P.x < p.x + p.w + 4) { stats.missed++; break; }
    if (land) stats.landChecks++;
    P.squish = Math.max(0, P.squish - dt * 5);
    maxHeight = Math.max(maxHeight, (H - 120) - P.y);
    const nw = worldAt(curH());
    if (nw > world) { world = nw; banner = 2.5; musicKey = WORLDS[world].key; sfx.world(); if (!DEMO && world + 1 > unlocked) { unlocked = world + 1; store.set('worlds', unlocked); } }
    stats.worldsSeen = Math.max(stats.worldsSeen, world + 1);
    banner = Math.max(0, banner - dt);
    const want = P.y - H * 0.45; if (want < camY) camY = want;
    while (lastMain.y > camY - 140) addChunk();
    const cut = camY + H + 80; CUT = cut;
    compact(plats, keepPlat);
    for (const s of stars) {
      if (!s.on) continue;
      const d = Math.hypot(s.x - P.x, s.y - P.y);
      if (P.power === 'magnet' && d < 170) { s.x += (P.x - s.x) * Math.min(1, dt * 6); s.y += (P.y - s.y) * Math.min(1, dt * 6); }
      if (d < 40) { s.on = false; runStars++; starPts += 25; sfx.star(); burst(s.x, s.y, 8, '#ffd84a', 160, 4); }
    }
    compact(stars, keepOn);
    for (const q of pows) if (q.on && Math.hypot(q.x - P.x, q.y - P.y) < 44) { q.on = false; givePower(q.k); }
    compact(pows, keepOn);
    for (const r of rocks) {
      if (!r.on) continue;
      r.x += r.vx * dt; r.rot += dt * 0.6;
      if (r.x < r.r) { r.x = r.r; r.vx = Math.abs(r.vx); } if (r.x > W - r.r) { r.x = W - r.r; r.vx = -Math.abs(r.vx); }
      if (Math.hypot(r.x - P.x, r.y - (P.y - 5)) < r.r * 0.8 + 22) {
        if (P.power === 'jet' || P.inv > 0) continue;
        if (P.shield) { P.shield = false; P.inv = 1; r.on = false; stats.shieldSaves++; sfx.pop(); burst(r.x, r.y, 10, '#5ad2ff', 220, 5); burst(r.x, r.y, 6, '#b8a6d9', 150, 5); continue; }
        stats.rockHits++; return gameOver('bonk');
      }
    }
    compact(rocks, keepOn);
    if (P.y - PR > camY + H) gameOver('fall');
  }
  function gameOver(why) {
    state = 'over'; overT = 0; P.vy = why === 'bonk' ? -120 : 60; P.why = why; P.power = null; musicOn = false; sfx.over();
    P.newBest = false; P.qualify = false;
    if (!DEMO) {
      bank += runStars; store.set('bank', bank);
      if (score() > best) { best = score(); store.set('best', best); P.newBest = true; }
      P.qualify = qualifies(score());
    }
  }

  const PARTY = [-3, -18, 3, -21, 0, -25], CRAT = [-0.45, -0.35, 0.2, 0.4, 0.4, 0.16, 0.5, -0.3, 0.12], MCRAT = [-15, -10, 9, 12, 8, 7, 5, -22, 5];
  const FONTS = {};
  // ---- drawing helpers ----
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function ell(x, y, rx, ry, fill, stroke) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) ctx.stroke(); }
  function starPath(x, y, r, k) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * (k || 0.48) : r; ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } ctx.closePath(); }
  function text(s, x, y, size, color, align, weight) {
    const fk = (weight || '800') + size; ctx.font = FONTS[fk] || (FONTS[fk] = (weight || '800') + ' ' + size + 'px "Trebuchet MS","Arial Rounded MT Bold",Verdana,system-ui,sans-serif');
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.22; ctx.strokeStyle = INK; ctx.strokeText(s, x, y); ctx.fillStyle = color; ctx.fillText(s, x, y);
  }

  function drawOutfit(id) {
    ctx.lineWidth = 1.8; ctx.strokeStyle = INK;
    if (id === 'bow') { ctx.fillStyle = '#ff6fae'; ctx.beginPath(); ctx.moveTo(9, -13); ctx.lineTo(3, -19); ctx.lineTo(3, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(9, -13); ctx.lineTo(16, -19); ctx.lineTo(16, -7); ctx.closePath(); ctx.fill(); ctx.stroke(); ell(9, -13, 2.4, 2.4, '#ff9fd0', true); }
    if (id === 'party') { ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(8, -14); ctx.lineTo(1, -31); ctx.closePath(); ctx.fillStyle = '#8b6cff'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd84a'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(PARTY[i * 2], PARTY[i * 2 + 1], 1.5, 0, 7); ctx.fill(); } ell(1, -31, 2.6, 2.6, '#ff6fae', true); }
    if (id === 'shades') { ctx.fillStyle = '#2d233c'; rr(-10.5, -6.5, 9, 6.5, 2.5); ctx.fill(); rr(1.5, -6.5, 9, 6.5, 2.5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-1.5, -4); ctx.lineTo(1.5, -4); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(-8.5, -5.5, 2.5, 1.5); ctx.fillRect(3.5, -5.5, 2.5, 1.5); }
    if (id === 'crown') { ctx.beginPath(); ctx.moveTo(-9, -13); ctx.lineTo(-10, -24); ctx.lineTo(-5, -18); ctx.lineTo(0, -26); ctx.lineTo(5, -18); ctx.lineTo(10, -24); ctx.lineTo(9, -13); ctx.closePath();
      ctx.fillStyle = '#ffd84a'; ctx.fill(); ctx.stroke(); ell(0, -17, 1.8, 1.8, '#ff5a6e', false); }
  }
  // Pebble (BrainBait printables design) in color with a space helmet; squash & stretch via sx/sy
  function drawPebble(x, y, s, face, sx, sy, spin, mood, fit) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(spin || 0); ctx.scale(s * sx * (face < 0 ? -1 : 1), s * sy);
    ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ell(-9, 17, 7, 4, '#d6784f', true); ell(9, 17, 7, 4, '#d6784f', true);
    if (fit !== 'crown' && fit !== 'party') { ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(1, -21); ctx.strokeStyle = '#3c7a3c'; ctx.stroke(); ctx.strokeStyle = INK;
      ell(6, -23, 6, 3.4, '#6ebe5a', true); ell(-5, -22, 5, 3, '#5aaa50', true); }
    ell(0, 0, 17, 16.5, '#f6a070', true);
    ell(-5, -6, 6, 5, 'rgba(255,200,160,.85)', false);
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, 16.5, 16, 0, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = '#28aaaa'; ctx.fillRect(-20, 3, 40, 6); ctx.restore();
    rr(4, 5, 4.5, 9, 2); ctx.fillStyle = '#1e9696'; ctx.fill(); ctx.stroke();
    ell(0, 0, 17, 16.5, null, true);
    for (const ex of [-5.5, 5.5]) { ell(ex, -3, 3.6, 4.3, '#fff', false); ell(ex + 0.6, -2.5, 2.2, 2.7, '#2d233c', false); ell(ex + 1.3, -3.8, 0.8, 0.8, '#fff', false); }
    ell(-10.5, 1, 2.6, 1.6, '#f07878', false); ell(10.5, 1, 2.6, 1.6, '#f07878', false);
    ctx.fillStyle = '#782832'; ctx.beginPath(); if (mood === 'oops') ctx.ellipse(0, 2.8, 2, 2.4, 0, 0, 7); else ctx.arc(0, 1.2, 3, 0, Math.PI); ctx.fill();
    if (fit) drawOutfit(fit);
    ctx.beginPath(); ctx.arc(0, -2, 27, 0, Math.PI * 2); ctx.fillStyle = 'rgba(170,220,255,.2)'; ctx.fill(); ctx.lineWidth = 2.4; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -2, 22, Math.PI * 1.1, Math.PI * 1.45); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.2; rr(-15, 22, 30, 6, 3); ctx.fillStyle = '#c9d2f0'; ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function drawPlayer(x) {
    const st = P.vy < 0 && state === 'play' ? clamp(-P.vy / JUMP, 0, 1) * 0.12 : 0;
    const sx = 1 + 0.28 * P.squish - st, sy = 1 - 0.24 * P.squish + st * 1.2;
    const y = P.y - 5 + 0.24 * P.squish * 20;
    if (P.power === 'jet') { ctx.lineWidth = 2.2; ctx.strokeStyle = INK; rr(x - P.face * 34 - 7, y - 10, 14, 30, 5); ctx.fillStyle = '#ff8c3c'; ctx.fill(); ctx.stroke(); }
    drawPebble(x, y, PS, P.face, sx, sy, P.spin, state === 'over' ? 'oops' : '', outfitNow());
    if (P.shield || P.inv > 0) { ctx.beginPath(); ctx.arc(x, y - 3, 46 + Math.sin(t * 6) * 2, 0, 7); ctx.strokeStyle = 'rgba(90,210,255,' + (P.shield ? .9 : .4) + ')'; ctx.lineWidth = 4; ctx.stroke(); }
    if (P.power === 'magnet') { ctx.setLineDash([5, 7]); ctx.beginPath(); ctx.arc(x, y, 60 + (t * 40) % 20, 0, 7); ctx.strokeStyle = 'rgba(255,90,110,.6)'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([]); }
  }
  const outfitNow = () => DEMO ? OUTFITS[Math.floor(t / 8) % OUTFITS.length].id : outfit;
  function drawPlat(p) {
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK;
    if (p.kind === 'ground') { rr(-10, p.y, W + 20, 60, 14); ctx.fillStyle = '#8a7ad8'; ctx.fill(); ctx.stroke(); return; }
    ctx.globalAlpha = p.gone ? Math.max(0, 1 - p.fall) : 1;
    const col = { rock: WORLDS[p.wi || 0].plat, move: '#ffb347', break: '#d9a066', bouncy: '#7ee081' }[p.kind];
    rr(p.x, p.y, p.w, 15, 7.5); ctx.fillStyle = col; ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; rr(p.x + 6, p.y + 3, p.w - 12, 3.5, 2); ctx.fill();
    if (p.kind === 'break') { ctx.beginPath(); ctx.moveTo(p.x + p.w * 0.35, p.y); ctx.lineTo(p.x + p.w * 0.45, p.y + 8); ctx.lineTo(p.x + p.w * 0.38, p.y + 15);
      ctx.moveTo(p.x + p.w * 0.7, p.y); ctx.lineTo(p.x + p.w * 0.62, p.y + 9); ctx.lineWidth = 2; ctx.stroke(); }
    else if (p.kind === 'bouncy') { ctx.beginPath(); for (let i = 0; i <= 6; i++) ctx.lineTo(p.x + p.w / 2 + (i % 2 ? 9 : -9), p.y - i * 2.2); ctx.lineWidth = 2.5; ctx.stroke(); rr(p.x + p.w / 2 - 12, p.y - 17, 24, 5, 2.5); ctx.fillStyle = '#ff6fae'; ctx.fill(); ctx.stroke(); }
    else if (p.kind === 'move') { ctx.fillStyle = INK; for (const s of [-1, 1]) { ctx.beginPath(); const cx = p.x + p.w / 2 + s * (p.w / 2 - 10); ctx.moveTo(cx + s * 4, p.y + 7.5); ctx.lineTo(cx - s * 2, p.y + 4); ctx.lineTo(cx - s * 2, p.y + 11); ctx.fill(); } }
    ctx.globalAlpha = 1;
  }
  function drawStar(s) {
    const bob = Math.sin(t * 4 + s.x) * 3; ctx.lineWidth = 2.4; ctx.strokeStyle = INK; starPath(s.x, s.y + bob, 14); ctx.fillStyle = '#ffd84a'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(s.x - 3.5, s.y + bob, 1.4, 0, 7); ctx.arc(s.x + 3.5, s.y + bob, 1.4, 0, 7); ctx.fill();
  }
  function drawPow(q) {
    const y = q.y + Math.sin(t * 3 + q.x) * 4, c = POWERS[q.k].c;
    ctx.beginPath(); ctx.arc(q.x, y, 19, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = c; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.fillStyle = c;
    if (q.k === 'jet') { rr(q.x - 5, y - 10, 10, 16, 4); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.moveTo(q.x - 4, y + 7); ctx.lineTo(q.x, y + 13); ctx.lineTo(q.x + 4, y + 7); ctx.fill(); }
    if (q.k === 'shield') { ctx.beginPath(); ctx.arc(q.x, y, 10, 0, 7); ctx.globalAlpha = .6; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke(); ell(q.x - 3, y - 4, 3, 2, '#fff', false); }
    if (q.k === 'magnet') { ctx.beginPath(); ctx.arc(q.x, y - 1, 8, Math.PI, 0); ctx.lineWidth = 6; ctx.strokeStyle = c; ctx.stroke(); ctx.fillStyle = '#ddd'; ctx.fillRect(q.x - 11, y - 1, 6, 6); ctx.fillRect(q.x + 5, y - 1, 6, 6); }
  }
  function drawRock(r) {
    ctx.save(); ctx.translate(r.x, r.y); ctx.lineWidth = 2.5; ctx.strokeStyle = INK;
    ctx.save(); ctx.rotate(r.rot); ctx.beginPath();
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, k = 1 + 0.1 * Math.sin(i * 2.7); ctx.lineTo(Math.cos(a) * r.r * k, Math.sin(a) * r.r * k); }
    ctx.closePath(); ctx.fillStyle = '#b8a6d9'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9a86c2'; for (let i = 0; i < 9; i += 3) { ctx.beginPath(); ctx.arc(CRAT[i] * r.r, CRAT[i + 1] * r.r, CRAT[i + 2] * r.r, 0, 7); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-r.r * 0.3, -1, 1.8, 0, 7); ctx.arc(r.r * 0.3, -1, 1.8, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(0, r.r * 0.12, r.r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI); ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(240,120,140,.7)'; ctx.beginPath(); ctx.arc(-r.r * 0.55, r.r * 0.15, 2.5, 0, 7); ctx.arc(r.r * 0.55, r.r * 0.15, 2.5, 0, 7); ctx.fill();
    ctx.restore();
  }
  function drawBgIn(scroll, wi) { const sw = cw, sh = ch; ctx.save(); ctx.translate(ox, oy); cw = W * sc; ch = H * sc; drawBg(scroll, wi); cw = sw; ch = sh; ctx.restore(); }
  function drawBg(scroll, wi) {
    const key = (cw * 4096 + ch) * 4 + wi; let bc = bgCache[wi];
    if (!bc || bc.key !== key) {                       // built once per world/size, then reused every frame
      const oc = document.createElement('canvas'); oc.width = Math.max(1, Math.round(cw * dpr)); oc.height = Math.max(1, Math.round(ch * dpr));
      const o = oc.getContext('2d'); o.scale(dpr, dpr); const Wd = WORLDS[wi], gr = o.createLinearGradient(0, 0, 0, ch);
      gr.addColorStop(0, Wd.bg[0]); gr.addColorStop(1, Wd.bg[1]); o.fillStyle = gr; o.fillRect(0, 0, cw, ch);
      if (wi === 2) for (let i = 0; i < 4; i++) {
        const x = cw * (0.2 + 0.25 * i), y = ch * (0.15 + 0.28 * i), rg = o.createRadialGradient(x, y, 0, x, y, 160 * sc);
        rg.addColorStop(0, i % 2 ? 'rgba(140,120,255,.3)' : 'rgba(255,150,220,.35)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); o.fillStyle = rg; o.fillRect(x - 160 * sc, y - 160 * sc, 320 * sc, 320 * sc);
      }
      bc = bgCache[wi] = { key, c: oc };
    }
    ctx.drawImage(bc.c, 0, 0, cw, ch);
    for (const s of bgStars) {
      const y = ((s.y * ch + scroll * s.p * sc) % ch + ch) % ch;
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + s.x * 40); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x * cw, y, s.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.strokeStyle = INK;
    const py = ((ch * 0.55 + scroll * 0.05 * sc) % (ch * 1.6) + ch * 1.6) % (ch * 1.6) - ch * 0.3;
    if (wi === 0) { ell(cw * 0.86, py, 46 * sc, 46 * sc, '#e8e4f8', true); ctx.fillStyle = '#cfc8ee'; for (let i = 0; i < 9; i += 3) { ctx.beginPath(); ctx.arc(cw * 0.86 + MCRAT[i] * sc, py + MCRAT[i + 1] * sc, MCRAT[i + 2] * sc, 0, 7); ctx.fill(); } }
    if (wi === 1) { ell(cw * 0.84, py, 40 * sc, 40 * sc, '#f6a070', true); ctx.save(); ctx.translate(cw * 0.84, py); ctx.rotate(-0.3); ctx.beginPath(); ctx.ellipse(0, 0, 72 * sc, 15 * sc, 0, 0.05, Math.PI - 0.05); ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 6 * sc; ctx.stroke(); ctx.restore(); }
    if (wi === 2) { starPath(cw * 0.85, py, 30 * sc, 0.45); ctx.fillStyle = 'rgba(255,240,180,.8)'; ctx.fill(); }
  }
  function button(label, b, color, dim) {
    const x = b[0], y = b[1], w = b[2], h = b[3]; ctx.globalAlpha = dim ? 0.55 : 1;
    ctx.lineWidth = 3; ctx.strokeStyle = INK; rr(x - w / 2, y - h / 2 + 4, w, h, h / 2); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
    rr(x - w / 2, y - h / 2, w, h, h / 2); ctx.fillStyle = color || '#3cc8b4'; ctx.fill(); ctx.stroke(); text(label, x, y, Math.min(h * 0.42, 26), '#fff'); ctx.globalAlpha = 1;
  }
  function roundIcon(x, y, kind) {
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.beginPath(); ctx.arc(x, y, CR, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = INK;
    ctx.save(); ctx.translate(x, y); ctx.scale(1.2, 1.2); ctx.beginPath();
    if (kind === 0) { ctx.moveTo(-9, -4); ctx.lineTo(-4, -4); ctx.lineTo(2, -10); ctx.lineTo(2, 10); ctx.lineTo(-4, 4); ctx.lineTo(-9, 4); ctx.closePath(); ctx.fill(); ctx.beginPath();
      if (muted) { ctx.moveTo(6, -5); ctx.lineTo(13, 5); ctx.moveTo(13, -5); ctx.lineTo(6, 5); } else { ctx.arc(4, 0, 6, -0.9, 0.9); ctx.moveTo(8, -10); ctx.arc(4, 0, 11, -0.9, 0.9); } ctx.stroke(); }
    else if (kind === 1) { ctx.moveTo(-5, -8); ctx.lineTo(7, 0); ctx.lineTo(-5, 8); ctx.fill(); }
    else if (kind === 2) { ctx.fillRect(-6, -8, 4, 16); ctx.fillRect(2, -8, 4, 16); }
    else { ctx.arc(0, 0, 8, -0.3, Math.PI * 1.5); ctx.lineWidth = 3; ctx.stroke(); ctx.beginPath(); ctx.moveTo(1, -12); ctx.lineTo(7, -8); ctx.lineTo(1, -4); ctx.fill(); }
    ctx.restore();
  }
  function cornerIcons() {
    roundIcon(CORN.sound.x, CORN.sound.y, 0);
    if (state === 'play' || state === 'pause') { roundIcon(CORN.pause.x, CORN.pause.y, state === 'pause' ? 1 : 2); roundIcon(CORN.restart.x, CORN.restart.y, 3); }
  }

  // ---- render ----
  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (COVER) return renderCover();
    const playing = state !== 'start';
    ctx.fillStyle = '#100c2a'; ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = 'rgba(8,6,24,.45)'; ctx.fillRect(0, 0, cw, ch); ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, W * sc, H * sc); ctx.clip();
    drawBgIn(playing ? -camY : t * 30, playing ? world : 0); ctx.restore();
    ctx.save(); ctx.translate(ox, oy); ctx.scale(sc, sc); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    if (!playing) renderStart();
    else {
      ctx.save(); ctx.translate(0, -camY);
      for (const p of plats) drawPlat(p);
      for (const s of stars) drawStar(s);
      for (const q of pows) drawPow(q);
      for (const r of rocks) drawRock(r);
      drawPlayer(P.x);
      for (const p of POOL) if (p.on) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1; ctx.restore();
      text(String(score()), W / 2 - 60, 40, 34, '#fff');
      text('Best ' + Math.max(best, DEMO ? 0 : score()), 14, 26, 15, '#ffd84a', 'left', '700');
      text('\u2605 ' + runStars, 14, 50, 17, '#ffd84a', 'left', '800');
      if (P.power) { const k = POWERS[P.power]; rr(W / 2 - 110, 64, 100, 10, 5); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fill(); rr(W / 2 - 110, 64, 100 * clamp(P.pt / k.t, 0, 1), 10, 5); ctx.fillStyle = k.c; ctx.fill(); }
      if (banner > 0) { ctx.globalAlpha = Math.min(1, banner); text('World ' + (world + 1) + ': ' + WORLDS[world].name + '!', W / 2, 150, 30, '#fff'); ctx.globalAlpha = 1; }
      if (state === 'pause') {
        ctx.fillStyle = 'rgba(20,16,50,.6)'; ctx.fillRect(-ox / sc, -oy / sc, cw / sc, ch / sc);
        text('Paused', W / 2, 290, 48, '#ffd84a'); button('RESUME', BTN.resume);
        text('Tap or press P to keep hopping', W / 2, 450, 17, '#fff', 'center', '700');
      }
      if (state === 'name') renderName();
      if (state === 'over' && overT > 0.6 && !P.qualify) {
        ctx.fillStyle = 'rgba(20,16,50,.55)'; ctx.fillRect(-ox / sc, -oy / sc, cw / sc, ch / sc);
        ctx.lineWidth = 3; ctx.strokeStyle = INK; rr(40, 165, W - 80, 405, 24); ctx.fillStyle = '#fff7e8'; ctx.fill(); ctx.stroke();
        text(P.why === 'bonk' ? 'Bonk! Time for a rest' : 'Oops! Pebble floated off', W / 2, 205, 22, '#f6a070');
        drawPebble(W / 2, 278, 1.6, 1, 1, 1, Math.sin(t * 2) * 0.2, 'oops', outfitNow());
        text('Score ' + score(), W / 2, 350, 32, '#fff');
        text(DEMO ? 'Demo run' : P.newBest ? 'New best score!' : 'Best ' + best, W / 2, 386, 19, '#ffd84a', 'center', '700');
        text('+' + runStars + ' \u2605   Bank: ' + bank + ' \u2605', W / 2, 412, 18, '#ffd84a', 'center', '700');
        text(topLine(), W / 2, 436, 14, '#fff', 'center', '700');
        if (nameNote > 0) text('Let\'s use PEB!', W / 2, 190, 14, '#3cc8b4', 'center', '700');
        button('PLAY AGAIN', BTN.again); button('OUTFITS', BTN.home, '#8b6cff');
      }
      if (DEMO) text('DEMO', W / 2, 92, 13, '#fff', 'center', '700');
    }
    ctx.restore();
    if (!DEMO) cornerIcons();
  }
  function topLine() {
    if (!board.length) return 'Top 3: be the first!';
    let s = 'Top 3:'; for (let i = 0; i < board.length; i++) s += '  ' + (i + 1) + '. ' + board[i].n + ' ' + board[i].s; return s;
  }
  function renderName() {
    ctx.fillStyle = 'rgba(20,16,50,.65)'; ctx.fillRect(-ox / sc, -oy / sc, cw / sc, ch / sc);
    ctx.lineWidth = 3; ctx.strokeStyle = INK; rr(30, 150, W - 60, 430, 24); ctx.fillStyle = '#fff7e8'; ctx.fill(); ctx.stroke();
    text('Top 3 score! ' + score(), W / 2, 190, 26, '#ffd84a'); text('Enter your initials', W / 2, 228, 18, '#f6a070', 'center', '700');
    for (let i = 0; i < 3; i++) {
      const u = BTN['up' + i], d = BTN['dn' + i];
      button('\u25B2', u, i === slot ? '#ff8c3c' : '#3cc8b4'); button('\u25BC', d, i === slot ? '#ff8c3c' : '#3cc8b4');
      rr(u[0] - 34, 335, 68, 70, 12); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = i === slot ? 5 : 3; ctx.strokeStyle = i === slot ? '#ff8c3c' : INK; ctx.stroke();
      text(String.fromCharCode(65 + letters[i]), u[0], 371, 46, '#8b6cff');
    }
    button('OK', BTN.ok, '#8b6cff');
  }
  function renderStart() {
    text("Pebble's", W / 2, 92, 44, '#ffd84a'); text('Space Hop', W / 2, 142, 52, '#ffd84a');
    text('Best ' + best + '     \u2605 ' + bank, W / 2, 190, 19, '#fff', 'center', '700');
    text(topLine(), W / 2, 216, 14, '#ffd84a', 'center', '700');
    const o = OUTFITS[viewIdx];
    drawPebble(W / 2, 330 - Math.abs(Math.sin(t * 3)) * 26, 2.3, 1, 1 + Math.max(0, Math.cos(t * 6)) * 0.05, 1, 0, '', o.id);
    rr(W / 2 - 70, 400, 140, 14, 7); ctx.fillStyle = '#cfc8ee'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    roundIconL(BTN.left[0], BTN.left[1], -1); roundIconL(BTN.right[0], BTN.right[1], 1);
    text(o.name, W / 2, 428, 18, '#fff', 'center', '700');
    const have = owned.includes(o.id);
    if (have) button(outfit === o.id ? 'WEARING' : 'WEAR IT', BTN.buy, '#8b6cff', outfit === o.id);
    else button('BUY \u2605' + o.cost, BTN.buy, '#ff8c3c', bank < o.cost);
    text('Pick a world', W / 2, 505, 16, '#fff', 'center', '700');
    for (let i = 0; i < 3; i++) worldBtn(i, i === 0 ? BTN.w0 : i === 1 ? BTN.w1 : BTN.w2);
    button('PLAY', BTN.play);
    text('Drag or hold a side to move \u2022 P = pause', W / 2, 694, 15, '#fff', 'center', '700');
  }
  const WCOL = ['#8a7ad8', '#1e8aa0', '#c0408a'];
  function worldBtn(i, b) {
    const x = b[0] - b[2] / 2, y = b[1] - b[3] / 2, lock = i >= unlocked, sel = i === selWorld;
    ctx.globalAlpha = lock ? 0.5 : 1; ctx.lineWidth = sel ? 5 : 3; ctx.strokeStyle = sel ? '#ffd84a' : INK;
    rr(x, y, b[2], b[3], 16); ctx.fillStyle = WCOL[i]; ctx.fill(); ctx.stroke();
    text(WORLDS[i].name.replace('The ', ''), b[0], b[1] + (lock ? 14 : 0), 19, '#fff');
    if (lock) { ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.fillStyle = '#ffd84a'; rr(b[0] - 9, b[1] - 20, 18, 14, 3); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(b[0], b[1] - 21, 6, Math.PI, 0); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  function roundIconL(x, y, s) { ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 24, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(x + s * 9, y); ctx.lineTo(x - s * 6, y - 10); ctx.lineTo(x - s * 6, y + 10); ctx.fill(); }
  function renderCover() {
    drawBg(t * 20, 1); const s = ch / 720; ctx.save(); ctx.scale(s, s); const w = cw / s;
    for (const [x, y, pw, k] of [[w * 0.1, 610, 120, 'rock'], [w * 0.3, 480, 110, 'bouncy'], [w * 0.62, 580, 120, 'break'], [w * 0.82, 430, 110, 'move']]) drawPlat({ x: x - pw / 2, y, w: pw, kind: k, wi: 1 });
    drawStar({ x: w * 0.82, y: 380 }); drawStar({ x: w * 0.12, y: 550 }); drawStar({ x: w * 0.47, y: 520 });
    drawPow({ x: w * 0.2, y: 420, k: 'shield' }); drawPow({ x: w * 0.5, y: 640, k: 'jet' });
    drawRock({ x: w * 0.93, y: 590, r: 34, rot: 0.4 }); drawRock({ x: w * 0.7, y: 490, r: 24, rot: 1 });
    drawPebble(w * 0.3, 320, 4.2, 1, 1.05, 0.97, -0.1, '', 'party');
    text("Pebble's", w * 0.67, 170, 82, '#ffd84a'); text('Space Hop', w * 0.67, 262, 98, '#ffd84a');
    text('A BrainBait game', w * 0.67, 342, 30, '#fff', 'center', '700'); ctx.restore();
  }

  // ---- loop: fixed 120 Hz simulation, render every animation frame ----
  const STEP = 1 / 120; let last = performance.now(), acc = 0, ppx = 0, ppy = 0, pcam = 0;
  const FT = new Float32Array(240); let ftI = 0, ftN = 0;
  function advance(sec) {
    acc += Math.min(0.05, sec);
    while (acc >= STEP) { ppx = P.x; ppy = P.y; pcam = camY; step(STEP); acc -= STEP; }
  }
  function frame(now) {
    const t0 = performance.now();
    advance((now - last) / 1000); last = now;
    // render interpolation between the last two physics states (x uses the latest value while sliding)
    const a = acc / STEP, sx = P.x, sy = P.y, sc_ = camY;
    if (state === 'play' && Math.abs(P.y - ppy) < 200) { if (slideX === null) P.x = ppx + (P.x - ppx) * a; P.y = ppy + (P.y - ppy) * a; camY = pcam + (camY - pcam) * a; }
    render(); P.x = sx; P.y = sy; camY = sc_;
    FT[ftI] = performance.now() - t0; ftI = (ftI + 1) % FT.length; if (ftN < FT.length) ftN++;
    requestAnimationFrame(frame);
  }
  reset(); requestAnimationFrame(frame);

  // read-only hooks for automated play-tests (nothing leaves the page)
  window.__psh = { get state() { return state; }, get score() { return score(); }, get best() { return best; }, get bank() { return bank; },
    get outfit() { return outfit; }, get owned() { return owned.slice(); }, get world() { return world; }, get touchDir() { return touchDir; },
    get px() { return P.x; }, get board() { return JSON.parse(JSON.stringify(board)); }, get letters() { return String.fromCharCode(65 + letters[0], 65 + letters[1], 65 + letters[2]); },
    _end() { gameOver('bonk'); }, _addScore(n) { starPts += n; }, _setLetters(s) { for (let i = 0; i < 3; i++) letters[i] = s.charCodeAt(i) - 65; }, get unlocked() { return unlocked; }, get selWorld() { return selWorld; }, get scale() { return sc; }, get pxScreen() { return ox + P.x * sc; }, cornerPos(n) { return corners()[n]; }, get shield() { return P.shield; }, get power() { return P.power; }, get muted() { return muted; }, stats, MAXGAP, MAXH, HW, W,
    btn(name) { const b = BTN[name]; return { x: ox + b[0] * sc, y: oy + b[1] * sc }; },
    corner(name) { return corners()[name === 'mute' ? 'sound' : name]; },
    frameStats() { const a = Array.from(FT.slice(0, ftN)).sort((x, y) => x - y); return { n: ftN, avg: a.reduce((s, v) => s + v, 0) / (ftN || 1), p95: a[Math.floor(ftN * 0.95)] || 0, max: a[ftN - 1] || 0 }; },
    _sim(frames, js) {   // test harness: drive the real frame accumulator with jittered dt and spikes (no rendering)
      let r = js >>> 0; const jr = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let i = 0; i < frames; i++) { const dt = jr() < 0.01 ? 0.08 + jr() * 0.25 : 0.008 + jr() * 0.026; advance(dt); }
      return { missed: stats.missed, landings: stats.landChecks, xMin: stats.xMin, xMax: stats.xMax, worlds: stats.worldsSeen };
    },
    _give(k) { givePower(k); }, visibleRocks() { return rocks.filter(r => r.on && r.y > camY && r.y < camY + H).length; }, _rockOnPlayer() { rocks.push({ x: P.x, y: P.y - 5, r: 18, vx: 0, rot: 0, on: true }); } };
})();
