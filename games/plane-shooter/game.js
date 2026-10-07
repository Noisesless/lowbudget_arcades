// ===== NEON STRIKE — plane shooter =====
// Canvas 2D + requestAnimationFrame. Zero dependency:
// SFX & BGM = WAV hasil assets/gen_audio.py (Python stdlib), visual procedural.

'use strict';

// ---------- Konstanta ----------
const W = 540;               // logical width
const H = 810;              // logical height
const MAX_PARTICLES = 350;
const PLAYER_R = 7;         // hitbox pemain kecil biar fair (dan terasa skilled)
const WEAPON_MAX = 6;

// Pesawat playable: beda speed, nyawa, gaya senjata. Pilih di menu (1/2/3).
const SHIPS = [
    { name: 'INTERCEPTOR', color: '#00e5ff', speed: 350, lives: 3, bombs: 2, weapon: 'spread' },
    { name: 'BLADE', color: '#3fd44a', speed: 430, lives: 2, bombs: 1, weapon: 'twin' },
    { name: 'BULWARK', color: '#ffd54a', speed: 270, lives: 4, bombs: 3, weapon: 'laser' }
];

// Tema stage: gradient bg + warna nebula, bergilir per level.
const STAGE_THEMES = [
    { bg0: '#0a0a1a', bg1: '#07070f', neb: 'rgba(90,40,160,0.10)', neb2: 'rgba(0,90,160,0.08)' },
    { bg0: '#0a1520', bg1: '#060a10', neb: 'rgba(0,150,180,0.10)', neb2: 'rgba(120,40,160,0.07)' },
    { bg0: '#150a12', bg1: '#0d060a', neb: 'rgba(200,40,120,0.09)', neb2: 'rgba(200,120,30,0.07)' },
    { bg0: '#0a150c', bg1: '#060d07', neb: 'rgba(40,190,90,0.09)', neb2: 'rgba(0,140,160,0.07)' }
];

const canvas = document.getElementById('gameCanvas');
const dctx = canvas.getContext('2d');
// Tampilan "128-bit": render di buffer half-res, upscale 2x tanpa smoothing
// => pixel besar ala CRT arcade. Semua logik gambar tetap pakai koordinat W/H.
const PIX = 2, PW = W / PIX, PH = H / PIX;
const pixelCanvas = document.createElement('canvas');
pixelCanvas.width = PW;
pixelCanvas.height = PH;
const ctx = pixelCanvas.getContext('2d');

const hud = {
    score: document.getElementById('score'),
    multi: document.getElementById('multi'),
    level: document.getElementById('level'),
    weapon: document.getElementById('weapon'),
    weaponBar: document.getElementById('weaponBar'),
    lives: document.getElementById('lives'),
    bombs: document.getElementById('bombs'),
    best: document.getElementById('best'),
    fps: document.getElementById('fps'),
    sfx: document.getElementById('sfxState'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlayTitle'),
    overlaySub: document.getElementById('overlaySub'),
    overlayKeys: document.getElementById('overlayKeys')
};

// ---------- Audio (aset WAV: assets/gen_audio.py, pitch-shift via playbackRate) ----------
const SFX_NAMES = ['shoot', 'hit', 'boom', 'bigboom', 'power', 'death', 'bomb', 'alarm', 'levelup'];
const BGM_NAMES = ['kick', 'hat', 'hatopen', 'bass', 'lead'];

let audioCtx = null;
let soundOn = true;
let audioReady = false;
let audioFailed = false;
const samples = {};

function ensureAudio() {
    if (!audioCtx) {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); loadAudio(); }
        catch (e) { soundOn = false; return; }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

// Preload di background saat halaman load — decodeAudioData jalan di
// context suspended, jadi frame pertama tidak jank lagi.
try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    loadAudio();
    // Browser suspend context saat tab ditinggal (autoplay/background policy).
    // Bangunin lagi otomatis + reset timeline BGM biar not gak ke-buang.
    audioCtx.onstatechange = () => {
        if (audioCtx.state === 'running' && BGM.running) {
            BGM.nextTime = Math.max(BGM.nextTime, audioCtx.currentTime + 0.06);
        }
    };
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    });
    document.addEventListener('pointerdown', ensureAudio);
} catch (e) { /* browser tanpa WebAudio */ }

async function loadAudio() {
    if (audioReady || audioFailed || !audioCtx) return;
    try {
        const path = n => (SFX_NAMES.includes(n) ? 'assets/sfx/' : 'assets/bgm/') + n + '.wav';
        const all = [...SFX_NAMES, ...BGM_NAMES];
        await Promise.all(all.map(async n => {
            const res = await fetch(path(n));
            if (!res.ok) throw new Error(n + ': ' + res.status);
            samples[n] = await audioCtx.decodeAudioData(await res.arrayBuffer());
        }));
        audioReady = true;
        hud.sfx.textContent = soundOn ? '♪ on' : '♪ off';
    } catch (e) {
        // fetch/decode gagal (mis. file:// diblokir CORS): SFX & BGM lewat
        // fallback HTMLAudioElement di play(), bukan berarti tanpa suara.
        audioFailed = true;
        hud.sfx.textContent = '♪ basic';
    }
}

const audioPath = n => (SFX_NAMES.includes(n) ? 'assets/sfx/' : 'assets/bgm/') + n + '.wav';

// when=0 → sekarang; when>0 → jadwalkan di jam AudioContext (buat BGM)
// Clamp: jangan pernah start di masa lalu (context abis di-suspend/resume →
// jam-nya lompat, not lama harus di-shift ke depan, bukan dibuang).
function play(name, vol = 0.3, rate = 1, when = 0) {
    if (!soundOn) return;
    const buf = (audioReady && audioCtx) ? samples[name] : null;
    if (buf) {
        const src = audioCtx.createBufferSource();
        const g = audioCtx.createGain();
        src.buffer = buf;
        src.playbackRate.value = rate;
        g.gain.value = vol;
        src.connect(g).connect(audioCtx.destination);
        if (when > 0) src.start(Math.max(when, audioCtx.currentTime + 0.02));
        else src.start();
        return;
    }
    // Fallback HTMLAudio: wajib kalau file dibuka via file:// (fetch WAV
    // diblokir CORS di scheme file) atau webview tanpa Web Audio.
    if (!audioReady) {
        try {
            const a = new Audio(audioPath(name));
            a.volume = Math.min(1, vol);
            try { a.playbackRate = rate; } catch (e) { /* tidak didukung */ }
            a.play().catch(() => {});
        } catch (e) { /* audio sama sekali tak tersedia */ }
    }
}

const sfx = {
    shoot: () => play('shoot', 0.12),
    hit: () => play('hit', 0.18),
    boom: () => play('boom', 0.30),
    bigBoom: () => play('bigboom', 0.50),
    power: () => play('power', 0.22),
    death: () => play('death', 0.35),
    bomb: () => play('bomb', 0.50),
    alarm: () => play('alarm', 0.25),
    levelup: () => play('levelup', 0.22)
};

// ---------- BGM: chiptune sequencer (lookahead scheduler) ----------
// Loop 16 step: kick + hi-hat (noise), bass (triangle), lead (square arp).
// 2 intensitas: normal & boss (tempo naik, pattern lebih agresif).
// Scheduler lookahead 0.12s dipakai dari game loop — tahan stutter, no setInterval.
const BGM = {
    running: false,
    step: 0,
    nextTime: 0,
    intensity: 0, // 0 normal, 1 boss
    bpm: [132, 156],
};

// Minor progression: Am - F - C - G dalam derajat (root freq per bar)
const BGM_ROOTS = [110, 87.31, 130.81, 98]; // A2 F2 C3 G2
const BGM_LEAD = [
    [440, 523, 659, 523, 587, 523, 440, 392, 440, 0, 659, 784, 659, 523, 0, 440],
    [349, 440, 523, 440, 440, 523, 659, 523, 440, 0, 523, 0, 440, 349, 0, 330],
    [523, 659, 784, 659, 659, 784, 880, 784, 659, 0, 784, 659, 523, 0, 440, 523],
    [392, 494, 587, 494, 587, 698, 784, 698, 587, 0, 698, 587, 494, 392, 0, 392]
];

// Fallback BGM HTMLAudio (loop bgm.wav) saat Web Audio load/decode gagal
let bgmEl = null;
function bgmFallbackStart() {
    if (bgmEl) return;
    bgmEl = new Audio('assets/bgm/bgm.wav');
    bgmEl.loop = true;
    bgmEl.volume = 0.32;
    bgmEl.playbackRate = BGM.bpm[BGM.intensity] / BGM.bpm[0];
    bgmEl.play().catch(() => {});
}
function bgmFallbackStop() {
    if (bgmEl) { try { bgmEl.pause(); } catch (e) {} bgmEl = null; }
}

function bgmStart() {
    ensureAudio();
    if (!audioCtx || BGM.running) return;
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    BGM.running = true;
    BGM.step = 0;
    BGM.nextTime = audioCtx.currentTime + 0.06;
    if (audioFailed) bgmFallbackStart(); // fetch/decode mati -> loop via <audio>
}

function bgmStop() {
    BGM.running = false;
    bgmFallbackStop();
}

function bgmSetIntensity(v) {
    BGM.intensity = v;
    if (bgmEl) { try { bgmEl.playbackRate = BGM.bpm[v] / BGM.bpm[0]; } catch (e) {} }
}

// Pitch-shift stem: playbackRate = freq / freq referensi sample
const BASS_REF = 110;  // bass.wav = A2
const LEAD_REF = 440;  // lead.wav = A4

function bgmStep(step, t) {
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const root = BGM_ROOTS[bar];
    const boss = BGM.intensity === 1;

    // kick: four-on-the-floor (normal) + kick ekstra di pattern boss
    if (s % 4 === 0) play('kick', 0.30, 1, t);
    if (boss && s === 10) play('kick', 0.30, 1, t);

    // hi-hat: setiap 2 step, open hat di hitungan genap
    if (s % 2 === 0) {
        const open = s % 8 === 6;
        play(open ? 'hatopen' : 'hat', open ? 0.10 : 0.07, 1, t);
    }

    // bass: root oktaf 1, oktaf naik di step aksen saat boss
    if (s % 2 === 0) {
        const oct = boss && (s === 4 || s === 12) ? 2 : 1;
        play('bass', 0.16, (root * oct) / BASS_REF, t);
    }

    // lead: melodi per bar, boss = oktaf naik
    const lead = BGM_LEAD[bar][s];
    if (lead) play('lead', boss ? 0.09 : 0.07, (boss ? lead * 2 : lead) / LEAD_REF, t);
}

function bgmUpdate() {
    if (!BGM.running || !audioCtx || !soundOn) return;
    // Context ketidur (tab background / autoplay policy): jangan jadwalkan
    // not ke masa lalu, tunggu resume — timeline di-reset di event resume.
    // Saat audioReady=false (mode fallback HTMLAudio), play() main instant.
    if (audioReady && audioCtx.state === 'suspended') return;
    const spb = 60 / BGM.bpm[BGM.intensity] / 4; // 16th per step
    const LOOKAHEAD = 0.12;
    const now = audioCtx.currentTime;
    while (BGM.nextTime < now + LOOKAHEAD) {
        bgmStep(BGM.step, BGM.nextTime);
        BGM.step = (BGM.step + 1) % 64;
        BGM.nextTime += spb;
    }
    // Kalau tab sempat sleep, nextTime tertinggal — reset biar gak burst
    if (BGM.nextTime < now) BGM.nextTime = now + 0.06;
}

// ---------- State ----------
let gameState = 'menu'; // menu | playing | paused | gameover
let score = 0, level = 1, lives = 3, bombs = 2, weapon = 1;
let kills = 0, killQuota = 25;
let highScore = Number(localStorage.getItem('neonstrike-highscore') || 0);

let player = { x: W / 2, y: H - 90, invuln: 0, shield: 0 };
let shipIndex = Number(localStorage.getItem('neonstrike-ship') || 0);
if (!(shipIndex >= 0 && shipIndex < SHIPS.length)) shipIndex = 0;
let bullets = [];       // peluru pemain
let ebullets = [];      // peluru musuh
let enemies = [];
let asteroids = [];     // hazard netral, muncul mulai level 2
let derelicts = [];     // sampah luar angkasa: rintangan besar penyumbat layar, lvl 3+
let powerups = [];
let particles = [];
let stars = [];
let boss = null;
let bossWave = false;
let banner = null;      // {text, ttl}
let shake = 0;
let lastShot = 0;
let bombFlash = 0;

// Wave system: formasi (line/vee/pincer/stream) di-queue lalu di-spawn bertahap
let spawnQueue = [];
let lastWaveAt = 0;

// Combo: kill beruntun → multiplier skor, reset saat kena / idle kelamaan
let combo = 0, comboTimer = 0;
const comboMult = () => 1 + Math.min(4, Math.floor(combo / 5));

const keys = new Set();

// ---------- Setup ----------
let canvasDpr = 1;
function setupCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvasDpr = dpr;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dctx.imageSmoothingEnabled = false;
    // world W/H -> buffer PW/PH
    ctx.setTransform(1 / PIX, 0, 0, 1 / PIX, 0, 0);
}

function initStars() {
    stars = [];
    for (let i = 0; i < 70; i++) {
        stars.push({ x: Math.random() * W, y: Math.random() * H, s: 0.4 + Math.random() * 1.6, v: 30 + Math.random() * 90 });
    }
}

function resetGame() {
    const ship = SHIPS[shipIndex];
    score = 0; level = 1; lives = ship.lives; bombs = ship.bombs; weapon = 1;
    kills = 0; killQuota = 25;
    player = { x: W / 2, y: H - 90, invuln: 1.5, shield: 0 };
    bullets = []; ebullets = []; enemies = []; asteroids = []; derelicts = []; powerups = []; particles = [];
    popTexts = [];
    boss = null; bossWave = false; banner = null;
    shake = 0; bombFlash = 0;
    lastShot = 0; lastWaveAt = 0;
    spawnQueue = [];
    combo = 0; comboTimer = 0;
}

// ---------- HUD ----------
function updateHud() {
    hud.score.textContent = score;
    hud.level.textContent = level;
    hud.weapon.textContent = 'Lv ' + weapon;
    hud.weaponBar.style.setProperty('--fill', (weapon / WEAPON_MAX * 100) + '%');
    hud.lives.textContent = '♥'.repeat(Math.max(0, lives));
    hud.bombs.textContent = bombs;
    hud.best.textContent = highScore;
    const mult = comboMult();
    hud.multi.textContent = (mult > 1 ? 'x' + mult + ' · ' : '')
        + (bossWave ? 'BOSS WAVE' : `${kills}/${killQuota}`) + ' · ' + SHIPS[shipIndex].name;
}

// ---------- Helper ----------
const rand = (a, b) => a + Math.random() * (b - a);

function addParticles(x, y, color, n, speed = 160) {
    for (let i = 0; i < n && particles.length < MAX_PARTICLES; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = rand(speed * 0.3, speed);
        particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ttl: rand(0.25, 0.6), color });
    }
}

function showBanner(text, dur = 1.6) {
    banner = { text, ttl: dur };
}

// ---------- Senjata: tiap pesawat punya 6 tingkat pola sendiri ----------
// Balance: Blade rapid-fire (dps rendah, mobilitas tinggi),
// Interceptor seimbang (dps tertinggi, single-target),
// Bulwark dps terendah tapi laser pierce + tanky. Homing dmg turun ke 2.
function fireInterval() {
    const w = SHIPS[shipIndex].weapon;
    if (w === 'twin') return Math.max(85, 160 - weapon * 8);
    if (w === 'laser') return Math.max(180, 260 - weapon * 12);
    return Math.max(95, 210 - weapon * 18);
}

// model: bentuk render peluru (bolt | twin | laser)
function mkBullet(x, y, vx, vy, opts = {}) {
    bullets.push({ x, y, vx, vy, r: 3, model: SHIPS[shipIndex].weapon, dmg: 1, ...opts });
}

function shoot(now) {
    if (now - lastShot < fireInterval()) return;
    lastShot = now;
    const w = SHIPS[shipIndex].weapon;
    const { x, y } = player;
    const lvl = weapon;

    if (w === 'spread') {
        // Interceptor: kipas melebar; bolt tengah dmg 2 mulai lvl 4
        const push = (dx, vx = 0) => mkBullet(x + dx, y - 14, vx, -560, { dmg: (lvl >= 4 && dx === 0) ? 2 : 1 });
        const diag = (dx, vx) => mkBullet(x + dx, y - 10, vx, -520);
        switch (lvl) {
            case 1: push(0); break;
            case 2: push(-7); push(7); break;
            case 3: push(0); push(-9); push(9); break;
            case 4: push(0); push(-9); push(9); diag(-13, -70); diag(13, 70); break;
            case 5: push(0); push(-7); push(7); diag(-13, -90); diag(13, 90); break;
            case 6:
                push(0); push(-7); push(7); diag(-13, -110); diag(13, 110);
                mkBullet(x - 16, y, 0, -300, { r: 4, homing: true, dmg: 2, model: 'missile' });
                mkBullet(x + 16, y, 0, -300, { r: 4, homing: true, dmg: 2, model: 'missile' });
                break;
        }
    } else if (w === 'twin') {
        // Blade: rapid fire dmg 1, rudal kecil dmg 2 di lvl 6
        const shot = (dx, vx = 0) => mkBullet(x + dx, y - 12, vx, -640, { r: 2.5 });
        switch (lvl) {
            case 1: shot(-6); shot(6); break;
            case 2: shot(-6); shot(6); shot(0); break;
            case 3: shot(-8); shot(8); shot(-3, -40); shot(3, 40); break;
            case 4: shot(-8); shot(8); shot(-3, -80); shot(3, 80); break;
            case 5: shot(-9); shot(9); shot(-4, -110); shot(4, 110); shot(0); break;
            case 6:
                shot(-10); shot(10); shot(-4, -110); shot(4, 110);
                mkBullet(x - 14, y, -120, -420, { r: 3, homing: true, dmg: 2, model: 'missile' });
                mkBullet(x + 14, y, 120, -420, { r: 3, homing: true, dmg: 2, model: 'missile' });
                break;
        }
    } // Bulwark: laser tebal pelan, tembus (pierce), dmg 3+ceil(lvl/2)
    else {
        mkBullet(x, y - 18, 0, -700, { r: 4 + lvl, dmg: 3 + Math.ceil(lvl / 2), pierce: true });
        if (lvl >= 3) { mkBullet(x - 12, y - 10, 0, -660, { r: 3 }); mkBullet(x + 12, y - 10, 0, -660, { r: 3 }); }
        if (lvl >= 5) { mkBullet(x - 20, y - 4, -120, -600, { r: 3 }); mkBullet(x + 20, y - 4, 120, -600, { r: 3 }); }
    }
    sfx.shoot();
}

// ---------- Musuh ----------
// Varian: drone, zig, diver, shooter, tank, spinner, gunship, mine
let enemyIdSeq = 0;

// Kroco makin tebal seiring level: +1 HP tiap 3 level (trashHp di spawnEnemyAt)
function enemyPool() {
    // pool bertambah sesuai level
    const pool = ['drone', 'drone', 'zig'];
    if (level >= 2) pool.push('zig', 'diver');
    if (level >= 4) pool.push('shooter', 'diver', 'spinner');
    if (level >= 6) pool.push('shooter', 'tank', 'mine');
    if (level >= 7) pool.push('spinner', 'gunship');
    if (level >= 8) pool.push('tank', 'shooter', 'gunship');
    return pool;
}

// Asteroid: hazard netral — menembak kita, bisa dihancurkan, skor kecil.
// Makin tinggi level: makin besar, HP makin tebal.
function spawnAsteroid() {
    const r = rand(12, Math.min(40, 24 + level * 1.5));
    const verts = [];
    const n = 8;
    for (let i = 0; i < n; i++) verts.push(rand(0.7, 1.15));
    const hp = Math.ceil(r / 5) + Math.floor(level / 2);
    asteroids.push({
        x: rand(30, W - 30), y: -40, r,
        vx: rand(-30, 30), vy: rand(60, 110),
        rot: 0, spin: rand(-2, 2),
        hp, verts,
        score: 10 * hp
    });
}

// Sampah luar angkasa: kapal perang karam — rintangan besar penyumbat layar,
// turun pelan, HP tebal, blok jalur tembak. Muncul mulai level 3.
function spawnDerelict() {
    const w = rand(70, 120), h = rand(40, 70);
    derelicts.push({
        x: rand(w / 2 + 20, W - w / 2 - 20), y: -h,
        w, h,
        vx: rand(-15, 15), vy: rand(28, 48),
        rot: rand(-0.25, 0.25), spin: rand(-0.2, 0.2),
        hp: 30 + level * 10, maxHp: 30 + level * 10,
        score: 150 + level * 20,
        seed: rand(0, 1000), t: 0, hitFlash: 0
    });
}

// Wave: bentuk formasi, hasilnya di-queue sebagai {delay, x, y, type}
function queueWave() {
    const pool = enemyPool();
    const pick = () => pool[Math.floor(Math.random() * pool.length)];
    // Formasi makin variatif seiring level (lvl 1-2: line/stream, 3+: vee/pincer)
    const shapes = ['line', 'stream'];
    if (level >= 3) shapes.push('vee', 'pincer');
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    const n = 4 + Math.floor(Math.random() * 3) + Math.floor(level / 3);
    const cx = rand(90, W - 90);
    const items = [];
    switch (shape) {
        case 'line': // barisan horizontal masuk bareng
            for (let i = 0; i < n; i++) items.push({ x: cx + (i - (n - 1) / 2) * 44, y: 0, delay: 0 });
            break;
        case 'stream': // satu jalur vertikal beruntun
            for (let i = 0; i < n; i++) items.push({ x: cx, y: 0, delay: i * 0.22 });
            break;
        case 'vee': // formasi V
            for (let i = 0; i < n; i++) {
                const k = i - (n - 1) / 2;
                items.push({ x: cx + k * 42, y: -Math.abs(k) * 30, delay: 0 });
            }
            break;
        case 'pincer': // dua sisi menjepit
            for (let i = 0; i < Math.ceil(n / 2); i++) {
                items.push({ x: 60 + i * 34, y: -i * 26, delay: 0 });
                items.push({ x: W - 60 - i * 34, y: -i * 26, delay: 0 });
            }
            break;
    }
    // tipe seragam per wave = terasa "desain", satu wave satu tipe
    const type = pick();
    for (const it of items) spawnQueue.push({ delay: 0.8 + it.delay, x: it.x, y: it.y, type });
}

// Spawn enemy spesifik (dipakai wave + boss spawn), mengikuti stat spawnEnemy
function spawnEnemyAt(type, x, y) {
    const e = { id: ++enemyIdSeq, type, x, y, t: 0, fireT: rand(0.8, 1.6), vy: 0 };
    const trashHp = 1 + Math.floor(level / 3);
    switch (type) {
        case 'drone': Object.assign(e, { hp: trashHp, r: 13, vy: rand(90, 130) + level * 6, score: 10 * trashHp, color: '#3fd44a' }); break;
        case 'zig': Object.assign(e, { hp: trashHp, r: 13, vy: rand(70, 100) + level * 5, amp: rand(50, 110), baseX: x, score: 15 * trashHp, color: '#00e5ff' }); break;
        case 'diver': Object.assign(e, { hp: 2 + Math.floor(level / 4), r: 14, vy: 60, lockY: rand(100, 260), diving: false, score: 25, color: '#ff8a2b' }); break;
        case 'shooter': Object.assign(e, { hp: 3 + Math.floor(level / 3), r: 16, vy: 80, stopY: rand(80, 200), score: 40, color: '#ff2fd6' }); break;
        case 'tank': Object.assign(e, { hp: 10 + level * 2, r: 24, vy: 42, score: 80, color: '#ffd54a' }); break;
        case 'spinner': Object.assign(e, { hp: 2 + Math.floor(level / 3), r: 15, vy: 95, score: 35, color: '#b48cff' }); break;
        case 'gunship': Object.assign(e, { hp: 6 + level, r: 22, vy: 55, stopY: rand(70, 160), fireT: 1, score: 90, color: '#ff6347' }); break;
        case 'mine': Object.assign(e, { hp: 1 + Math.floor(level / 5), r: 12, vy: 70, score: 20, color: '#ff4d4d' }); break;
    }
    e.y = y;
    enemies.push(e);
}

function spawnBoss() {
    const idx = Math.floor(level / 3); // boss varian berganti tiap kemunculan
    const kind = (idx - 1) % 4;
    const NAMES = ['WARDEN', 'SWARM LORD', 'DOOMSCARAB', 'LEVIATHAN'];
    const COLORS = ['#ff2fd6', '#00e5ff', '#ffd54a', '#7dff6a'];
    boss = {
        kind,
        x: W / 2, y: -90, targetY: 110,
        hp: 140 + level * 70, maxHp: 140 + level * 70,
        r: 58, t: 0, fireT: 1.2, phase: 0, spiral: 0,
        score: 500 + level * 100,
        color: COLORS[kind],
        name: NAMES[kind]
    };
    showBanner('⚠ BOSS: ' + boss.name, 2.2);
    sfx.alarm();
    bgmSetIntensity(1);
}

function updateBoss(b, dt) {
    b.t += dt;
    // masuk pelan ke targetY
    if (b.y < b.targetY) { b.y += 60 * dt; return; }
    // movement pattern per varian
    if (b.kind === 0) {
        b.x = W / 2 + Math.sin(b.t * 0.9) * (W / 2 - 90);
    } else if (b.kind === 1) {
        b.x += Math.cos(b.t * 1.4) * 90 * dt * 4;
        b.x = Math.max(80, Math.min(W - 80, b.x));
    } else if (b.kind === 2) {
        b.x += Math.sin(b.t * 2.2) * 160 * dt * 3;
        b.x = Math.max(80, Math.min(W - 80, b.x));
        b.y = b.targetY + Math.sin(b.t * 1.3) * 26;
    } else {
        // LEVIATHAN: hover hampir di tengah, drift pelan
        b.x = W / 2 + Math.sin(b.t * 0.5) * 70;
        b.y = b.targetY + Math.sin(b.t * 0.8) * 14;
    }
    // serangan per varian — makin tinggi level makin mematikan:
    // peluru lebih banyak, lebih cepat, fire rate naik, peluru tambahan per level
    b.fireT -= dt;
    if (b.fireT > 0) return;
    const enraged = b.hp < b.maxHp * 0.4;
    const spd = 1 + level * 0.025;
    const fr = Math.max(0.55, 1 - level * 0.035); // pengali interval tembak (makin kecil = makin galak)
    const extra = Math.floor(level / 4);
    if (b.kind === 0) {
        // WARDEN: kipas radial + aimed shot cepat mulai lvl 4
        const n = (enraged ? 11 : 7) + extra;
        for (let i = 0; i < n; i++) {
            const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.24;
            ebullets.push({ x: b.x, y: b.y + 30, vx: Math.cos(a) * 170 * spd, vy: Math.sin(a) * 170 * spd, r: 5 });
        }
        if (level >= 4) {
            const a = Math.atan2(player.y - b.y, player.x - b.x);
            ebullets.push({ x: b.x, y: b.y + 30, vx: Math.cos(a) * 240 * spd, vy: Math.sin(a) * 240 * spd, r: 4 });
        }
        b.fireT = (enraged ? 0.9 : 1.4) * fr;
    } else if (b.kind === 1) {
        // SWARM LORD: burst aimed (kipas melebar + drone ekstra di level tinggi)
        const a = Math.atan2(player.y - b.y, player.x - b.x);
        const n = 2 + Math.min(3, Math.floor(level / 3));
        for (let i = -n; i <= n; i++) {
            ebullets.push({ x: b.x, y: b.y + 20, vx: Math.cos(a + i * 0.16) * 210 * spd, vy: Math.sin(a + i * 0.16) * 210 * spd, r: 4 });
        }
        const spawnN = level >= 5 ? 2 : 1;
        for (let i = 0; i < spawnN && enemies.length < 6; i++) spawnEnemyAt('drone', b.x + rand(-60, 60), b.y + 40);
        b.fireT = (enraged ? 0.7 : 1.1) * fr;
    } else if (b.kind === 2) {
        // DOOMSCARAB: barisan sweep makin lebar + baris kedua lvl 6+ + homing makin sering
        const n = 5 + extra;
        const off = Math.sin(b.t * 3) * 60;
        for (let i = 0; i < n; i++) {
            ebullets.push({ x: b.x - (n - 1) * 15 + i * 30 + off, y: b.y + 34, vx: 0, vy: 230 * spd, r: 5 });
        }
        if (level >= 6) {
            for (let i = 0; i < 3; i++) {
                ebullets.push({ x: b.x - 30 + i * 30 - off, y: b.y + 34, vx: 0, vy: 170 * spd, r: 4 });
            }
        }
        if (Math.random() < Math.min(0.85, (enraged ? 0.7 : 0.35) + level * 0.02)) {
            ebullets.push({ x: b.x, y: b.y + 20, vx: 0, vy: 140 * spd, r: 6, homing: true, ttl: 4 });
        }
        b.fireT = (enraged ? 0.5 : 0.8) * fr;
    } else {
        // LEVIATHAN: spiral bullet-hell, lengan bertambah + peluru ngebut per level
        const arms = (enraged ? 3 : 2) + Math.floor(level / 6);
        for (let i = 0; i < arms; i++) {
            const a = b.spiral + (i * Math.PI * 2) / arms;
            ebullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 150 * spd, vy: Math.sin(a) * 150 * spd, r: 4 });
        }
        b.spiral += enraged ? 0.42 : 0.33;
        b.fireT = (enraged ? 0.09 : 0.13) * fr;
    }
}

// ---------- Powerups ----------
function dropPowerup(x, y, guaranteed) {
    if (!guaranteed && Math.random() > 0.14) return;
    const roll = Math.random();
    let type = 'weapon';
    if (roll < 0.38) type = 'weapon';
    else if (roll < 0.58) type = 'shield';
    else if (roll < 0.74) type = 'bomb';
    else if (roll < 0.86) type = 'score';
    else type = 'life';
    powerups.push({ x, y, vy: 90, t: 0, type });
}

const PU_STYLE = {
    weapon: { color: '#ff2fd6', label: 'W' },
    shield: { color: '#00e5ff', label: 'S' },
    bomb: { color: '#ff8a2b', label: 'B' },
    score: { color: '#3fd44a', label: '$' },
    life: { color: '#ffd54a', label: '♥' }
};

function applyPowerup(p) {
    sfx.power();
    if (p.type === 'weapon') {
        // mentok → jadi poin
        if (weapon < WEAPON_MAX) weapon++;
        else { score += 500; showPoints(p.x, p.y, '+500'); }
    } else if (p.type === 'shield') {
        if (player.shield <= 0) player.shield = 6;
        else { score += 300; showPoints(p.x, p.y, '+300'); }
    } else if (p.type === 'bomb') {
        if (bombs < 3) bombs++;
        else { score += 300; showPoints(p.x, p.y, '+300'); }
    } else if (p.type === 'score') {
        score += 250;
        showPoints(p.x, p.y, '+250');
    } else if (p.type === 'life') {
        if (lives < 5) lives++;
        else { score += 400; showPoints(p.x, p.y, '+400'); }
    }
    updateHud();
}

// Teks poin melayang ("+500") saat upgrade mentok dikonversi skor
let popTexts = [];
function showPoints(x, y, text) {
    popTexts.push({ x, y, text, ttl: 0.9 });
}

// ---------- Kehilangan nyawa ----------
function killPlayer() {
    if (player.invuln > 0 || player.shield > 0) return;
    lives--;
    combo = 0; comboTimer = 0;
    addParticles(player.x, player.y, '#00e5ff', 40, 240);
    shake = 14;
    sfx.death();
    weapon = Math.max(1, weapon - 1); // loss senjatu 1 level, klasik arcade
    if (lives <= 0) {
        gameState = 'gameover';
        bgmStop();
        if (score > highScore) { highScore = score; localStorage.setItem('neonstrike-highscore', highScore); }
        showOverlay('GAME OVER', `Skor: ${score} · Best: ${highScore} — tekan <kbd>SPACE</kbd> ulang`, false);
    } else {
        player.invuln = 2.2;
        player.x = W / 2; player.y = H - 90;
    }
    updateHud();
}

function useBomb() {
    if (bombs <= 0 || gameState !== 'playing') return;
    bombs--;
    bombFlash = 0.35;
    shake = 18;
    sfx.bomb();
    ebullets = [];
    for (const e of enemies) {
        e.hp -= 10;
        addParticles(e.x, e.y, e.color, 8, 140);
    }
    for (const d of derelicts) { d.hp -= 20; d.hitFlash = 0.12; addParticles(d.x, d.y, '#8a93a8', 10, 160); }
    if (boss) { boss.hp -= 60; addParticles(boss.x, boss.y, boss.color, 25, 220); }
    updateHud();
}

// ---------- Overlay ----------
function showOverlay(title, sub, showKeys) {
    hud.overlay.classList.remove('hidden');
    hud.overlayTitle.textContent = title;
    hud.overlaySub.innerHTML = sub;
    hud.overlayKeys.style.display = showKeys ? 'flex' : 'none';
}

function hideOverlay() {
    hud.overlay.classList.add('hidden');
}

// ---------- Update ----------
function update(dt, now) {
    // stars selalu gerak (juga saat menu — gratis dan cantik)
    for (const s of stars) {
        s.y += s.v * dt;
        if (s.y > H) { s.y = -2; s.x = Math.random() * W; }
    }

    if (banner) { banner.ttl -= dt; if (banner.ttl <= 0) banner = null; }
    if (shake > 0) shake = Math.max(0, shake - 60 * dt);
    if (bombFlash > 0) bombFlash = Math.max(0, bombFlash - dt);

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.ttl -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.ttl <= 0) particles.splice(i, 1);
    }

    // teks poin melayang
    for (let i = popTexts.length - 1; i >= 0; i--) {
        const t = popTexts[i];
        t.ttl -= dt; t.y -= 40 * dt;
        if (t.ttl <= 0) popTexts.splice(i, 1);
    }

    if (gameState !== 'playing') return;

    // --- player ---
    const sp = SHIPS[shipIndex].speed;
    let dx = 0, dy = 0;
    if (keys.has('ArrowLeft') || keys.has('a')) dx -= 1;
    if (keys.has('ArrowRight') || keys.has('d')) dx += 1;
    if (keys.has('ArrowUp') || keys.has('w')) dy -= 1;
    if (keys.has('ArrowDown') || keys.has('s')) dy += 1;
    player.x = Math.max(14, Math.min(W - 14, player.x + dx * sp * dt));
    player.y = Math.max(H * 0.35, Math.min(H - 20, player.y + dy * sp * dt));
    if (player.invuln > 0) player.invuln -= dt;
    if (player.shield > 0) player.shield -= dt;

    // combo idle: 3 detik tanpa kill → combo putus
    if (combo > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) { combo = 0; updateHud(); }
    }

    shoot(now);

    // --- spawn: wave formation via queue ---
    if (!bossWave) {
        // proses antrian spawn
        for (let i = spawnQueue.length - 1; i >= 0; i--) {
            const q = spawnQueue[i];
            q.delay -= dt;
            if (q.delay <= 0) {
                spawnEnemyAt(q.type, Math.max(24, Math.min(W - 24, q.x)), q.y - 30);
                spawnQueue.splice(i, 1);
            }
        }
        // wave baru saat antrian kosong + musuh field sepi + cooldown
        const waveGap = Math.max(1.4, 3.2 - level * 0.12);
        if (spawnQueue.length === 0 && enemies.length === 0 && now - lastWaveAt > waveGap * 1000) {
            lastWaveAt = now;
            queueWave();
        }
        // asteroid hazard: makin sering di level tinggi
        if (level >= 2 && Math.random() < dt * (0.12 + level * 0.02)) spawnAsteroid();
        // sampah luar angkasa: rintangan besar, max 1-2 di layar
        const dMax = level >= 8 ? 2 : 1;
        if (level >= 3 && derelicts.length < dMax && Math.random() < dt * (0.03 + level * 0.006)) spawnDerelict();
        if (kills >= killQuota) {
            spawnQueue = [];
            if (level % 3 === 0) {
                bossWave = true;
                spawnBoss();
            } else {
                levelUp();
            }
        }
    }

    // --- bullets ---
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        if (b.homing) {
            // rudal: cari target terdekat
            let tgt = boss, bestD = 1e9;
            for (const e of enemies) {
                const d = (e.x - b.x) ** 2 + (e.y - b.y) ** 2;
                if (d < bestD) { bestD = d; tgt = e; }
            }
            if (tgt) {
                const a = Math.atan2(tgt.y - b.y, tgt.x - b.x);
                b.vx += (Math.cos(a) * 420 - b.vx) * 4 * dt;
                b.vy += (Math.sin(a) * 420 - b.vy) * 4 * dt;
            }
        }
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.y < -20 || b.x < -20 || b.x > W + 20) bullets.splice(i, 1);
    }

    // --- enemy bullets ---
    for (let i = ebullets.length - 1; i >= 0; i--) {
        const b = ebullets[i];
        if (b.homing) {
            const a = Math.atan2(player.y - b.y, player.x - b.x);
            b.vx += (Math.cos(a) * 190 - b.vx) * 1.6 * dt;
            b.vy += (Math.sin(a) * 190 - b.vy) * 1.6 * dt;
            b.ttl -= dt;
            if (b.ttl <= 0) { ebullets.splice(i, 1); continue; }
        }
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.y < -20 || b.y > H + 20 || b.x < -20 || b.x > W + 20) { ebullets.splice(i, 1); continue; }
        if ((b.x - player.x) ** 2 + (b.y - player.y) ** 2 < (PLAYER_R + b.r) ** 2) {
            ebullets.splice(i, 1);
            if (player.shield > 0) { addParticles(player.x, player.y, '#00e5ff', 6, 120); sfx.hit(); }
            else killPlayer();
        }
    }

    // --- enemies ---
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        e.t += dt;
        switch (e.type) {
            case 'drone': e.y += e.vy * dt; break;
            case 'zig': e.y += e.vy * dt; e.x = e.baseX + Math.sin(e.t * 3) * e.amp; break;
            case 'diver':
                if (!e.diving && e.y >= e.lockY) {
                    e.diving = true;
                    const a = Math.atan2(player.y - e.y, player.x - e.x);
                    e.vx = Math.cos(a) * 320; e.vy = Math.sin(a) * 320;
                }
                if (e.diving) { e.x += e.vx * dt; e.y += e.vy * dt; }
                else e.y += e.vy * dt;
                break;
            case 'shooter':
                if (e.y < e.stopY) e.y += e.vy * dt;
                else {
                    e.x += Math.sin(e.t * 2) * 60 * dt;
                    e.fireT -= dt;
                    if (e.fireT <= 0) {
                        e.fireT = Math.max(0.7, 1.6 - level * 0.05);
                        const a = Math.atan2(player.y - e.y, player.x - e.x);
                        ebullets.push({ x: e.x, y: e.y + 10, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, r: 4 });
                        sfx.hit();
                    }
                }
                break;
            case 'tank': e.y += e.vy * dt; break;
            case 'spinner':
                e.y += e.vy * dt;
                e.x += Math.sin(e.t * 5) * 130 * dt;
                break;
            case 'gunship':
                if (e.y < e.stopY) e.y += e.vy * dt;
                else {
                    e.x += Math.sin(e.t * 1.2) * 50 * dt;
                    e.fireT -= dt;
                    if (e.fireT <= 0) {
                        // 3 peluru kipas ke bawah
                        e.fireT = Math.max(1.0, 2.0 - level * 0.06);
                        for (let k = -1; k <= 1; k++) {
                            const a = Math.PI / 2 + k * 0.35;
                            ebullets.push({ x: e.x, y: e.y + 14, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, r: 4 });
                        }
                        sfx.hit();
                    }
                }
                break;
            case 'mine':
                e.y += e.vy * dt;
                // ledak otomatis di bawah layar, tanpa kasih skor (bukan kill)
                if (e.y > H * 0.6) {
                    addParticles(e.x, e.y, '#ff4d4d', 10, 150);
                    sfx.boom();
                    enemies.splice(i, 1);
                    continue;
                }
                break;
        }

        // tabrak pemain
        if ((e.x - player.x) ** 2 + (e.y - player.y) ** 2 < (PLAYER_R + e.r) ** 2) {
            e.hp -= 3;
            addParticles(e.x, e.y, e.color, 8, 140);
            killPlayer();
        }

        // peluru kena (laser Bulwark tembus / pierce, dmg per peluru)
        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < (e.r + b.r) ** 2) {
                if (b.lastHit === e.id) continue; // pierce: 1x per musuh per peluru
                e.hp -= b.dmg;
                b.lastHit = e.id;
                addParticles(b.x, b.y, e.color, 3, 80);
                if (!b.pierce) bullets.splice(j, 1);
            }
        }

        if (e.hp <= 0) {
            combo++; comboTimer = 3;
            score += e.score * comboMult();
            kills++;
            addParticles(e.x, e.y, e.color, 14, 180);
            sfx.boom();
            dropPowerup(e.x, e.y, e.type === 'tank');
            enemies.splice(i, 1);
            updateHud();
        } else if (e.y > H + 40) {
            enemies.splice(i, 1);
        }
    }

    // --- boss ---
    if (boss) {
        updateBoss(boss, dt);
        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if ((b.x - boss.x) ** 2 + (b.y - boss.y) ** 2 < (boss.r + b.r) ** 2) {
                boss.hp -= b.dmg;
                addParticles(b.x, b.y, boss.color, 3, 90);
                if (!b.pierce) bullets.splice(j, 1);
            }
        }
        // tabrak boss
        if ((boss.x - player.x) ** 2 + (boss.y - player.y) ** 2 < (boss.r + PLAYER_R) ** 2) {
            killPlayer();
        }
        if (boss.hp <= 0) {
            combo++; comboTimer = 3;
            score += boss.score * comboMult();
            addParticles(boss.x, boss.y, boss.color, 60, 300);
            shake = 20;
            sfx.bigBoom();
            dropPowerup(boss.x - 30, boss.y, true);
            dropPowerup(boss.x + 30, boss.y, true);
            boss = null;
            bossWave = false;
            ebullets = [];
            levelUp();
        }
    }

    // --- asteroid (hazard netral) ---
    for (let i = asteroids.length - 1; i >= 0; i--) {
        const a = asteroids[i];
        a.x += a.vx * dt; a.y += a.vy * dt; a.rot += a.spin * dt;
        if (a.x < a.r || a.x > W - a.r) a.vx *= -1;
        if (a.y > H + 50) { asteroids.splice(i, 1); continue; }
        if ((a.x - player.x) ** 2 + (a.y - player.y) ** 2 < (PLAYER_R + a.r) ** 2) {
            addParticles(a.x, a.y, '#9aa0b4', 10, 150);
            asteroids.splice(i, 1);
            killPlayer();
            continue;
        }
        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 < (a.r + b.r) ** 2) {
                if (b.lastHitA === a) continue;
                a.hp -= b.dmg;
                b.lastHitA = a;
                addParticles(b.x, b.y, '#9aa0b4', 3, 80);
                if (!b.pierce) bullets.splice(j, 1);
            }
        }
        if (a.hp <= 0) {
            score += a.score;
            addParticles(a.x, a.y, '#9aa0b4', 12, 160);
            sfx.boom();
            asteroids.splice(i, 1);
            updateHud();
        }
    }

    // --- sampah luar angkasa (rintangan penyumbat jalur) ---
    for (let i = derelicts.length - 1; i >= 0; i--) {
        const d = derelicts[i];
        d.t += dt;
        if (d.hitFlash > 0) d.hitFlash -= dt;
        d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.spin * dt;
        if (d.x < d.w * 0.55 || d.x > W - d.w * 0.55) d.vx *= -1;
        if (d.y > H + 90) { derelicts.splice(i, 1); continue; }
        const hw = d.w * 0.42, hh = d.h * 0.42;
        // tabrak pemain (AABB kasar)
        if (Math.abs(d.x - player.x) < hw + PLAYER_R && Math.abs(d.y - player.y) < hh + PLAYER_R) {
            addParticles(d.x, d.y, '#8a93a8', 10, 150);
            killPlayer();
        }
        // peluru pemain
        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (Math.abs(b.x - d.x) < hw + b.r && Math.abs(b.y - d.y) < hh + b.r) {
                if (b.lastHitD === d) continue;
                d.hp -= b.dmg;
                d.hitFlash = 0.08;
                b.lastHitD = d;
                addParticles(b.x, b.y, '#8a93a8', 3, 80);
                if (!b.pierce) bullets.splice(j, 1);
            }
        }
        if (d.hp <= 0) {
            score += d.score;
            addParticles(d.x, d.y, '#8a93a8', 22, 220);
            addParticles(d.x, d.y, '#ff8a2b', 12, 160);
            sfx.boom();
            dropPowerup(d.x, d.y, true);
            showPoints(d.x, d.y, '+' + d.score);
            derelicts.splice(i, 1);
            updateHud();
        }
    }

    // --- powerups ---
    for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        p.t += dt; p.y += p.vy * dt;
        const magnet = (p.x - player.x) ** 2 + (p.y - player.y) ** 2 < 90 * 90;
        if (magnet) {
            p.x += (player.x - p.x) * 6 * dt;
            p.y += (player.y - p.y) * 6 * dt;
        }
        if ((p.x - player.x) ** 2 + (p.y - player.y) ** 2 < 18 * 18) {
            applyPowerup(p);
            powerups.splice(i, 1);
        } else if (p.y > H + 20) powerups.splice(i, 1);
    }
}

function levelUp() {
    level++;
    kills = 0;
    killQuota = 25 + level * 5;
    showBanner('LEVEL ' + level, 1.4);
    sfx.levelup();
    bgmSetIntensity(0);
    updateHud();
}

// ---------- Render ----------
function drawFlame(x, y, w, len) {
    ctx.fillStyle = 'rgba(255,138,43,0.9)';
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.lineTo(x, y + len + Math.random() * 4);
    ctx.lineTo(x + w, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,180,0.9)';
    ctx.beginPath();
    ctx.moveTo(x - w * 0.4, y);
    ctx.lineTo(x, y + len * 0.5);
    ctx.lineTo(x + w * 0.4, y);
    ctx.closePath();
    ctx.fill();
}

function drawPlane() {
    const { x, y } = player;
    const ship = SHIPS[shipIndex];
    const blink = player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0;
    if (blink) return;
    const t = performance.now() / 1000;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = ship.color;

    if (ship.weapon === 'spread') {
        // Interceptor: delta + panel sayap gelap + garis tengah
        ctx.beginPath();
        ctx.moveTo(0, -16);
        ctx.lineTo(11, 10);
        ctx.lineTo(0, 5);
        ctx.lineTo(-11, 10);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.moveTo(-2, -6); ctx.lineTo(-9, 8); ctx.lineTo(-2, 5); ctx.closePath();
        ctx.moveTo(2, -6); ctx.lineTo(9, 8); ctx.lineTo(2, 5); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#e8e8f5';
        ctx.fillRect(-0.5, -14, 1, 18);
        drawFlame(0, 10, 3.5, 8);
    } else if (ship.weapon === 'twin') {
        // Blade: sayap kembar + sirip + winglet + 2 knalpot
        ctx.beginPath();
        ctx.moveTo(0, -17);
        ctx.lineTo(4, 2);
        ctx.lineTo(13, 11);
        ctx.lineTo(4, 8);
        ctx.lineTo(0, 12);
        ctx.lineTo(-4, 8);
        ctx.lineTo(-13, 11);
        ctx.lineTo(-4, 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.moveTo(0, -6); ctx.lineTo(2.5, 8); ctx.lineTo(-2.5, 8); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = ship.color;
        ctx.fillRect(-14, 7, 2, 5);
        ctx.fillRect(12, 7, 2, 5);
        drawFlame(-5, 11, 2.4, 7);
        drawFlame(5, 11, 2.4, 7);
    } else {
        // Bulwark: sayap lebar + nacelle mesin + poudderon
        ctx.beginPath();
        ctx.moveTo(0, -15);
        ctx.lineTo(7, -6);
        ctx.lineTo(16, 6);
        ctx.lineTo(9, 11);
        ctx.lineTo(0, 7);
        ctx.lineTo(-9, 11);
        ctx.lineTo(-16, 6);
        ctx.lineTo(-7, -6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(-13, 1, 7, 6);
        ctx.fillRect(6, 1, 7, 6);
        ctx.fillRect(-8, -3, 16, 3);
        ctx.fillStyle = ship.color;
        ctx.beginPath();
        ctx.moveTo(0, -15); ctx.lineTo(3, -10); ctx.lineTo(-3, -10); ctx.closePath();
        ctx.fill();
        drawFlame(-9.5, 11, 2.6, 6);
        drawFlame(9.5, 11, 2.6, 6);
    }

    // kanopi kaca + silau
    ctx.fillStyle = '#e8e8f5';
    ctx.beginPath(); ctx.ellipse(0, -4, 3, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,229,255,0.7)';
    ctx.beginPath(); ctx.ellipse(-0.8, -5, 1.2, 2, 0, 0, Math.PI * 2); ctx.fill();
    // lampu wingtip berkedip (merah kiri / hijau kanan, ala pesawat beneran)
    const on = Math.floor(t * 2.5) % 2 === 0;
    const tipX = ship.weapon === 'spread' ? 11 : ship.weapon === 'twin' ? 13 : 16;
    // === Morphing per level senjata: pesawat tumbuh modul ===
    if (weapon >= 3) {
        // pod hardpoint di sayap
        ctx.fillStyle = 'rgba(232,232,245,0.85)';
        ctx.fillRect(-tipX + 1, 2, 2.5, 6);
        ctx.fillRect(tipX - 3.5, 2, 2.5, 6);
    }
    if (weapon >= 5) {
        // sayap energi: garis glow di tepi sayap
        ctx.strokeStyle = 'rgba(0,229,255,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-tipX + 2, 7); ctx.lineTo(0, -14); ctx.lineTo(tipX - 2, 7);
        ctx.stroke();
        // knalpot tengah ekstra
        drawFlame(0, 12, 1.8, 6);
    }
    if (weapon >= 6) {
        // pylon rudal + core reaktor berdenyut
        ctx.fillStyle = '#ff8a2b';
        ctx.fillRect(-3.5, 5, 2.5, 6);
        ctx.fillRect(1, 5, 2.5, 6);
        ctx.fillStyle = `rgba(255,47,214,${0.5 + 0.4 * Math.sin(t * 8)})`;
        ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = on ? '#ff3b30' : 'rgba(255,59,48,0.25)';
    ctx.fillRect(-tipX - 0.5, 8, 1.5, 1.5);
    ctx.fillStyle = on ? '#3fd44a' : 'rgba(63,212,74,0.25)';
    ctx.fillRect(tipX - 1, 8, 1.5, 1.5);
    // shield
    if (player.shield > 0) {
        ctx.strokeStyle = `rgba(0,229,255,${0.4 + 0.3 * Math.sin(t * 11)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
}

function presentCRT() {
    // Upscale buffer pixelated ke canvas + overlay CRT
    dctx.save();
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.clearRect(0, 0, canvas.width, canvas.height);
    dctx.imageSmoothingEnabled = false;
    dctx.drawImage(pixelCanvas, 0, 0, canvas.width, canvas.height);
    // scanline CRT: garis gelap tiap 3px CSS (di-draw sekali per frame, murah)
    dctx.fillStyle = 'rgba(0,0,0,0.14)';
    for (let y = 0; y < canvas.height; y += 3 * canvasDpr) {
        dctx.fillRect(0, y, canvas.width, 1);
    }
    dctx.restore();
}

function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = e.color;
    if (e.type === 'tank') {
        // tank perang: badan heksagon + tread beranimasi + meriam + antena
        ctx.beginPath();
        ctx.moveTo(0, e.r);
        ctx.lineTo(e.r, -e.r * 0.5);
        ctx.lineTo(0, -e.r);
        ctx.lineTo(-e.r, -e.r * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(-e.r * 0.85, -e.r * 0.35, e.r * 0.3, e.r * 1.1); // tread kiri
        ctx.fillRect(e.r * 0.55, -e.r * 0.35, e.r * 0.3, e.r * 1.1);  // tread kanan
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; // segmen tread jalan
        const off = (e.t * 30) % 6;
        for (let k = 0; k < 3; k++) {
            ctx.fillRect(-e.r * 0.85, -e.r * 0.35 + off + k * 6, e.r * 0.3, 2);
            ctx.fillRect(e.r * 0.55, -e.r * 0.35 + off + k * 6, e.r * 0.3, 2);
        }
        ctx.fillStyle = e.color;
        ctx.fillRect(-3, -2, 6, e.r * 0.9); // meriam depan (menghadap bawah)
        ctx.fillStyle = '#0d0d1e';
        ctx.beginPath(); ctx.arc(0, -e.r * 0.45, 5, 0, Math.PI * 2); ctx.fill(); // kubah
        ctx.fillStyle = '#ff4d4d';
        ctx.beginPath(); ctx.arc(0, -e.r * 0.45, 1.8, 0, Math.PI * 2); ctx.fill(); // mata kubah
        ctx.strokeStyle = 'rgba(232,232,245,0.5)';
        ctx.lineWidth = 1; // antena
        ctx.beginPath(); ctx.moveTo(e.r * 0.4, -e.r * 0.6); ctx.lineTo(e.r * 0.55, -e.r * 1.05); ctx.stroke();
    } else if (e.type === 'shooter') {
        // diamond + cannon ganda + lensa target berputar
        ctx.beginPath();
        ctx.moveTo(0, e.r);
        ctx.lineTo(e.r, 0);
        ctx.lineTo(0, -e.r);
        ctx.lineTo(-e.r, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(-e.r * 0.55, -3, e.r * 1.1, 6); // strip panel
        ctx.fillStyle = e.color;
        ctx.fillRect(-e.r * 0.7, e.r * 0.25, 4, 7); // meriam kiri
        ctx.fillRect(e.r * 0.7 - 4, e.r * 0.25, 4, 7); // meriam kanan
        ctx.fillStyle = '#0d0d1e';
        ctx.beginPath(); ctx.arc(0, 4, 4.5, 0, Math.PI * 2); ctx.fill(); // lensa
        ctx.strokeStyle = `rgba(255,47,214,${0.4 + 0.4 * Math.sin(e.t * 5)})`;
        ctx.lineWidth = 1.5; // ring lensa berdenyot = "lagi ngincer"
        ctx.beginPath(); ctx.arc(0, 4, 6.5, e.t * 3, e.t * 3 + 4.2); ctx.stroke();
    } else if (e.type === 'diver') {
        // panah selam: stripe + 2 sirip + flame saat diving
        ctx.rotate(Math.PI);
        ctx.beginPath();
        ctx.moveTo(0, -e.r);
        ctx.lineTo(e.r * 0.8, e.r * 0.7);
        ctx.lineTo(0, e.r * 0.35);
        ctx.lineTo(-e.r * 0.8, e.r * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(-e.r * 0.16, -e.r * 0.6, e.r * 0.32, e.r * 0.9); // stripe tengah
        ctx.fillStyle = e.color;
        ctx.beginPath(); // sirip samping
        ctx.moveTo(-e.r * 0.7, 0); ctx.lineTo(-e.r * 1.15, e.r * 0.55); ctx.lineTo(-e.r * 0.5, e.r * 0.4); ctx.closePath();
        ctx.moveTo(e.r * 0.7, 0); ctx.lineTo(e.r * 1.15, e.r * 0.55); ctx.lineTo(e.r * 0.5, e.r * 0.4); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#e8e8f5';
        ctx.beginPath(); ctx.arc(0, -e.r * 0.35, 2.2, 0, Math.PI * 2); ctx.fill(); // kokpit
        if (e.diving) drawFlame(0, e.r * 0.7, 3, 8); // motor nyala saat nyelam
    } else if (e.type === 'spinner') {
        // baling 3 blade + hub berongga + ring energi
        ctx.rotate(e.t * 6);
        for (let k = 0; k < 3; k++) {
            ctx.rotate((Math.PI * 2) / 3);
            ctx.fillRect(-3, 0, 6, e.r);
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(-1, e.r * 0.45, 2, e.r * 0.4); // blade tip gelap
            ctx.fillStyle = e.color;
        }
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0d0d1e';
        ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(180,140,255,${0.35 + 0.25 * Math.sin(e.t * 8)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.62, 0, Math.PI * 2); ctx.stroke();
    } else if (e.type === 'gunship') {
        // korvet: dek panel, 2 meriam pop-up, mesin kembar, lampu dek
        ctx.fillRect(-e.r, -e.r * 0.55, e.r * 2, e.r * 1.1);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(-e.r * 0.62, -e.r * 0.3, e.r * 1.24, e.r * 0.6); // dek tengah
        ctx.fillStyle = e.color;
        const up = e.y < e.stopY ? 0 : 3; // meriam pop-up saat berhenti
        ctx.fillRect(-e.r * 0.8, e.r * 0.4, 6, 8 + up);
        ctx.fillRect(e.r * 0.8 - 6, e.r * 0.4, 6, 8 + up);
        drawFlame(-e.r * 0.55, -e.r * 0.55, 2.4, 5); // mesin (di atas = belakang)
        drawFlame(e.r * 0.55, -e.r * 0.55, 2.4, 5);
        ctx.fillStyle = '#0d0d1e';
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = Math.floor(e.t * 4) % 2 === 0 ? '#ffd54a' : '#7a5a10';
        ctx.fillRect(-e.r * 0.3, -2, 2, 2); // lampu dek
        ctx.fillRect(e.r * 0.3 - 2, -2, 2, 2);
    } else if (e.type === 'mine') {
        // bola berduri 8 + cincin duri miring + sumbu kedip
        for (let k = 0; k < 8; k++) {
            ctx.rotate(Math.PI / 4);
            ctx.beginPath();
            ctx.moveTo(-2, -e.r * 0.7); ctx.lineTo(2, -e.r * 0.7); ctx.lineTo(0, -e.r - 4);
            ctx.closePath(); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 2; // cincin duri miring
        ctx.beginPath(); ctx.ellipse(0, 0, e.r * 0.95, e.r * 0.35, Math.PI / 5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = Math.floor(e.t * 6) % 2 === 0 ? '#ffffff' : '#7a1010';
        ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
    } else {
        // drone: delta + sayap panel + kokpit + thruster
        ctx.beginPath();
        ctx.moveTo(0, e.r);
        ctx.lineTo(e.r * 0.9, -e.r * 0.7);
        ctx.lineTo(0, -e.r * 0.3);
        ctx.lineTo(-e.r * 0.9, -e.r * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(-e.r * 0.62, -e.r * 0.35, e.r * 0.28, e.r * 0.7); // panel kiri
        ctx.fillRect(e.r * 0.34, -e.r * 0.35, e.r * 0.28, e.r * 0.7);  // panel kanan
        ctx.fillStyle = '#e8e8f5';
        ctx.beginPath(); ctx.arc(0, e.r * 0.25, 2, 0, Math.PI * 2); ctx.fill(); // kokpit depan
        drawFlame(0, -e.r * 0.7, 2.2, 4); // thruster (di atas = belakang)
    }
    ctx.restore();
}

function drawDerelict(d) {
    // Kapal perang karam: lambung patah + sayap lepas + panel dek + api darurat
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    const w = d.w, h = d.h;
    const g = n => { const x = Math.sin(d.seed * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
    ctx.fillStyle = '#4a5064';
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, -h * 0.3);
    ctx.lineTo(w * 0.38, -h * 0.42);
    ctx.lineTo(w * 0.5, -h * 0.1);   // buritan patah
    ctx.lineTo(w * 0.34, h * 0.2);
    ctx.lineTo(w * 0.44, h * 0.45);  // lunas patah
    ctx.lineTo(-w * 0.3, h * 0.4);
    ctx.lineTo(-w * 0.5, h * 0.15);
    ctx.lineTo(-w * 0.42, -h * 0.15);
    ctx.closePath();
    ctx.fill();
    if (d.hitFlash > 0) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill(); }
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; // panel dek acak (deterministik via seed)
    for (let i = 0; i < 4; i++) {
        const px = -w * 0.38 + g(i) * w * 0.6, py = -h * 0.28 + g(i + 9) * h * 0.5;
        ctx.fillRect(px, py, 8 + g(i + 4) * 14, 4 + g(i + 7) * 6);
    }
    ctx.fillStyle = '#3a3f52'; // sayap patah kiri + kanan
    ctx.beginPath();
    ctx.moveTo(-w * 0.42, h * 0.05); ctx.lineTo(-w * 0.78, h * 0.3); ctx.lineTo(-w * 0.5, h * 0.34);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.3, -h * 0.34); ctx.lineTo(w * 0.62, -h * 0.62); ctx.lineTo(w * 0.52, -h * 0.3);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(10,10,16,0.55)'; // bekas tembakan
    ctx.beginPath(); ctx.ellipse(w * 0.1, h * 0.08, w * 0.16, h * 0.14, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2c3040'; // nacelle mesin mati
    ctx.fillRect(-w * 0.1, -h * 0.52, w * 0.16, h * 0.2);
    ctx.strokeStyle = '#8a93a8'; // antena patah + lampu darurat kedip
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-w * 0.2, -h * 0.35); ctx.lineTo(-w * 0.28, -h * 0.72); ctx.stroke();
    if (Math.floor(d.t * 1.6 + d.seed) % 2 === 0) {
        ctx.fillStyle = '#ff3b30';
        ctx.beginPath(); ctx.arc(-w * 0.28, -h * 0.72, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (d.hp < d.maxHp) { // bar HP mini saat keropos
        const bw2 = 40;
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(d.x - bw2 / 2, d.y - d.h * 0.78, bw2, 3);
        ctx.fillStyle = '#ff8a2b';
        ctx.fillRect(d.x - bw2 / 2, d.y - d.h * 0.78, bw2 * Math.max(0, d.hp / d.maxHp), 3);
    }
}

function drawBoss(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    const pulse = 1 + 0.04 * Math.sin(b.t * 5);
    ctx.scale(pulse, pulse);
    const enraged = b.hp < b.maxHp * 0.4;
    const eye = enraged ? '#ff3b30' : '#fff2a8';
    const dark = '#0d0d1e';
    const glow = enraged ? 0.5 + 0.4 * Math.sin(b.t * 9) : 0;

    if (b.kind === 0) {
        // WARDEN — laba-laba zirah: 8 kaki berayun, perut + jam pasir, 2 mata
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 4;
        for (let i = 0; i < 4; i++) {
            const sway = Math.sin(b.t * 6 + i * 1.4) * 8;
            for (const s of [-1, 1]) {
                const hipY = -14 + i * 12;
                ctx.beginPath();
                ctx.moveTo(s * b.r * 0.35, hipY);
                ctx.lineTo(s * b.r * 0.85, hipY - 14 + sway);
                ctx.lineTo(s * (b.r + 20), hipY + 16 - sway);
                ctx.stroke();
            }
        }
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.ellipse(0, 6, b.r * 0.62, b.r * 0.78, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -b.r * 0.62, b.r * 0.34, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = dark; // jam pasir khas black widow
        ctx.beginPath();
        ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.lineTo(0, 16);
        ctx.moveTo(-10, 28); ctx.lineTo(10, 28); ctx.lineTo(0, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(13,13,30,0.45)'; // ruasan perut
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath(); ctx.arc(0, 6, b.r * 0.3 + i * 7, 0.35, Math.PI - 0.35); ctx.stroke();
        }
        ctx.strokeStyle = b.color; // taring mengatup
        ctx.lineWidth = 3;
        const snap = Math.sin(b.t * 7) * 3;
        for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(s * 6, -b.r * 0.86);
            ctx.quadraticCurveTo(s * (10 + snap), -b.r * 1.05, s * 5, -b.r * 1.22);
            ctx.stroke();
        }
        ctx.fillStyle = eye;
        ctx.arc(-7, -b.r * 0.66, 3.5, 0, Math.PI * 2); ctx.arc(7, -b.r * 0.66, 3.5, 0, Math.PI * 2);
        ctx.arc(-13, -b.r * 0.58, 1.8, 0, Math.PI * 2); ctx.arc(13, -b.r * 0.58, 1.8, 0, Math.PI * 2);
        ctx.arc(-9, -b.r * 0.8, 1.5, 0, Math.PI * 2); ctx.arc(9, -b.r * 0.8, 1.5, 0, Math.PI * 2);
        ctx.fill();
        if (glow) {
            ctx.strokeStyle = `rgba(255,59,48,${glow * 0.5})`;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, -b.r * 0.62, b.r * 0.44, 0, Math.PI * 2); ctx.stroke();
        }
    } else if (b.kind === 1) {
        // SWARM LORD — lebah raksasa: sayap kepak, perut bergaris, sengat bergetar
        const flap = Math.sin(b.t * 22) * 0.45;
        ctx.fillStyle = 'rgba(220,240,255,0.35)';
        for (const s of [-1, 1]) {
            ctx.save();
            ctx.scale(s, 1);
            ctx.rotate(0.5 + flap);
            ctx.beginPath(); ctx.ellipse(b.r * 0.6, -b.r * 0.35, b.r * 0.75, b.r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.35)'; // urat sayap
            ctx.lineWidth = 1;
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.moveTo(b.r * 0.15, -b.r * 0.35);
                ctx.quadraticCurveTo(b.r * 0.5, -b.r * (0.5 + i * 0.12), b.r * 1.2, -b.r * 0.35);
                ctx.stroke();
            }
            ctx.restore();
        }
        ctx.strokeStyle = b.color; // 6 kaki
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 3; i++) {
            const sw = Math.sin(b.t * 8 + i * 1.6) * 4;
            for (const s of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(s * b.r * 0.4, 4 + i * 8);
                ctx.quadraticCurveTo(s * b.r * 0.62, 14 + i * 8, s * (b.r * 0.5 + 6), 22 + i * 7 + sw);
                ctx.stroke();
            }
        }
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.ellipse(0, 0, b.r * 0.85, b.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0d0d1e'; // garis abdomen
        for (let i = -1; i <= 2; i++) ctx.fillRect(i * 16 - 4, -b.r * 0.45, 7, b.r * 0.9);
        ctx.fillStyle = b.color; // sengat
        ctx.beginPath();
        ctx.moveTo(-6, b.r * 0.5); ctx.lineTo(6, b.r * 0.5);
        ctx.lineTo(0, b.r * 0.85 + Math.sin(b.t * 9) * 4);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = dark; // barbs sengat
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-4, b.r * 0.62); ctx.lineTo(-7, b.r * 0.72);
        ctx.moveTo(4, b.r * 0.62); ctx.lineTo(7, b.r * 0.72);
        ctx.stroke();
        ctx.fillStyle = b.color; // kepala
        ctx.beginPath(); ctx.arc(0, -b.r * 0.62, b.r * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = b.color; // antena bergoyang
        ctx.lineWidth = 2;
        for (const s of [-1, 1]) {
            const tw = Math.sin(b.t * 5 + s) * 3;
            ctx.beginPath();
            ctx.moveTo(s * 6, -b.r * 0.82);
            ctx.quadraticCurveTo(s * (14 + tw), -b.r * 1.08, s * (20 + tw), -b.r * 0.95);
            ctx.stroke();
        }
        ctx.fillStyle = eye;
        ctx.beginPath(); ctx.arc(-8, -b.r * 0.66, 4, 0, Math.PI * 2); ctx.arc(8, -b.r * 0.66, 4, 0, Math.PI * 2); ctx.fill();
        if (glow) {
            ctx.strokeStyle = `rgba(255,59,48,${glow * 0.45})`;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(0, 0, b.r * 0.95, b.r * 0.65, 0, 0, Math.PI * 2); ctx.stroke();
        }
    } else if (b.kind === 2) {
        // DOOMSCARAB — kumbang: cangkang kubah bergaris, tanduk, 6 kaki
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 4;
        for (let i = 0; i < 3; i++) {
            const sw = Math.sin(b.t * 5 + i * 1.3) * 6;
            for (const s of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(s * b.r * 0.45, 6 + i * 12);
                ctx.lineTo(s * b.r * 0.9, 14 + i * 12 + sw);
                ctx.lineTo(s * (b.r + 12), 26 + i * 11 - sw);
                ctx.stroke();
            }
        }
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.ellipse(0, 6, b.r * 0.85, b.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, -b.r * 0.5, b.r * 0.5, b.r * 0.3, 0, 0, Math.PI * 2); ctx.fill(); // pronotum
        ctx.strokeStyle = dark;
        ctx.lineWidth = 3; // garis tengah elytra
        ctx.beginPath(); ctx.moveTo(0, -b.r * 0.35); ctx.lineTo(0, b.r * 0.72); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; // kilau kubah
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(-b.r * 0.3, 0, b.r * 0.3, Math.PI * 0.9, Math.PI * 1.5); ctx.stroke();
        ctx.beginPath(); ctx.arc(b.r * 0.3, 0, b.r * 0.3, Math.PI * 1.5, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(255,${enraged ? '59,48' : '213,74'},${0.25 + glow * 0.5})`; // retak energi
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-14, 4); ctx.lineTo(-8, 12); ctx.lineTo(-12, 20);
        ctx.moveTo(14, 4); ctx.lineTo(8, 12); ctx.lineTo(12, 20);
        ctx.stroke();
        ctx.fillStyle = b.color; // tanduk tengah + 2 tanduk samping
        ctx.beginPath();
        ctx.moveTo(0, -b.r * 0.5);
        ctx.lineTo(-7, -b.r * 1.12); ctx.lineTo(7, -b.r * 1.12);
        ctx.closePath(); ctx.fill();
        for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(s * 12, -b.r * 0.52); ctx.lineTo(s * (22 + Math.sin(b.t * 4) * 2), -b.r * 0.95); ctx.lineTo(s * 16, -b.r * 0.42);
            ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = eye;
        ctx.beginPath(); ctx.arc(-b.r * 0.4, -b.r * 0.45, 4, 0, Math.PI * 2); ctx.arc(b.r * 0.4, -b.r * 0.45, 4, 0, Math.PI * 2); ctx.fill();
    } else {
        // LEVIATHAN — ubur-ubur kosmik: kubah tembus pandang + tentakel bergelombang
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(0, -b.r * 0.15, b.r * 0.85, Math.PI, 0);
        ctx.quadraticCurveTo(b.r * 0.6, b.r * 0.25, 0, b.r * 0.15);
        ctx.quadraticCurveTo(-b.r * 0.6, b.r * 0.25, -b.r * 0.85, -b.r * 0.15);
        ctx.fill();
        ctx.strokeStyle = 'rgba(13,13,30,0.4)'; // lingkar konsetrik kubah
        ctx.lineWidth = 2;
        for (let i = 1; i <= 3; i++) {
            ctx.beginPath();
            ctx.arc(0, -b.r * 0.15, b.r * (0.85 - i * 0.22), Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
        }
        ctx.fillStyle = b.color; // rim bergerigi bergelombang
        for (let i = 0; i < 7; i++) {
            const x0 = -b.r * 0.66 + i * (b.r * 0.22);
            ctx.beginPath();
            ctx.arc(x0, b.r * 0.18 + Math.sin(b.t * 4 + i) * 3, 6, 0, Math.PI);
            ctx.fill();
        }
        for (let i = 0; i < 8; i++) {
            const x0 = -b.r * 0.75 + i * (b.r * 0.215);
            const wave1 = Math.sin(b.t * 4 + i) * 18;
            const wave2 = Math.sin(b.t * 3 + i * 2) * 26;
            const len = b.r * (0.9 + 0.35 * Math.sin(b.t * 2 + i * 1.7));
            ctx.strokeStyle = b.color;
            ctx.lineWidth = 3.5 - (i % 2);
            ctx.beginPath();
            ctx.moveTo(x0, b.r * 0.2);
            ctx.quadraticCurveTo(x0 + wave1, b.r * 0.55, x0 + wave2, len);
            ctx.stroke();
            ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.3 * Math.sin(b.t * 6 + i * 2)})`;
            ctx.beginPath();
            ctx.arc(x0 + wave2 * 0.6, b.r * 0.2 + (len - b.r * 0.2) * 0.6, 1.6, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = dark; // mata besar, pupil melirik ke pemain
        ctx.beginPath(); ctx.ellipse(0, -b.r * 0.3, b.r * 0.4, b.r * 0.26, 0, 0, Math.PI * 2); ctx.fill();
        const look = Math.atan2(player.y - b.y, player.x - b.x);
        const lpx = Math.cos(look) * b.r * 0.14, lpy = -b.r * 0.3 + Math.sin(look) * b.r * 0.1;
        ctx.fillStyle = eye;
        ctx.beginPath(); ctx.arc(lpx, lpy, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = dark;
        ctx.beginPath(); ctx.arc(lpx, lpy, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // HP bar
    const bw = W * 0.7;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect((W - bw) / 2, 14, bw, 8);
    ctx.fillStyle = b.hp < b.maxHp * 0.4 ? '#ff3b30' : b.color;
    ctx.fillRect((W - bw) / 2, 14, bw * Math.max(0, b.hp / b.maxHp), 8);
    ctx.fillStyle = '#e8e8f5';
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.name, W / 2, 36);
}

function render() {
    ctx.save();
    if (shake > 0) ctx.translate(rand(-shake, shake) * 0.4, rand(-shake, shake) * 0.4);

    // bg: tema stage bergilir per level + nebula radial
    const theme = STAGE_THEMES[(level - 1) % STAGE_THEMES.length];
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, theme.bg0);
    grd.addColorStop(1, theme.bg1);
    ctx.fillStyle = grd;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    const neb = ctx.createRadialGradient(W * 0.7, H * 0.25, 20, W * 0.7, H * 0.25, 300);
    neb.addColorStop(0, theme.neb);
    neb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = neb;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    const neb2 = ctx.createRadialGradient(W * 0.25, H * 0.7, 20, W * 0.25, H * 0.7, 260);
    neb2.addColorStop(0, theme.neb2);
    neb2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = neb2;
    ctx.fillRect(-20, -20, W + 40, H + 40);

    // stars
    for (const s of stars) {
        ctx.fillStyle = `rgba(232,232,245,${0.15 + s.s * 0.2})`;
        ctx.fillRect(s.x, s.y, s.s, s.s * 2.5);
    }

    // powerups
    for (const p of powerups) {
        const st = PU_STYLE[p.type];
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.t * 2);
        ctx.fillStyle = st.color;
        ctx.fillRect(-9, -9, 18, 18);
        ctx.restore();
        ctx.fillStyle = '#0d0d1e';
        ctx.font = 'bold 11px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(st.label, p.x, p.y + 1);
    }

    // bullets: bentuk per model pesawat
    for (const b of bullets) {
        if (b.homing) {
            ctx.fillStyle = '#ff8a2b'; // rudal
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        } else if (b.model === 'laser') {
            ctx.fillStyle = '#ffe98a'; // laser: garis tebal
            ctx.fillRect(b.x - b.r * 0.6, b.y - 12, b.r * 1.2, 22);
        } else if (b.model === 'twin') {
            ctx.fillStyle = '#b6ffcf'; // blade: bolt kecil hijau
            ctx.fillRect(b.x - 1.2, b.y - 7, 2.4, 12);
        } else {
            ctx.fillStyle = '#e8f6ff'; // interceptor: bolt
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        }
    }
    for (const b of ebullets) {
        ctx.fillStyle = b.homing ? '#ff2fd6' : '#ff4d4d';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    }

    for (const e of enemies) drawEnemy(e);
    for (const d of derelicts) drawDerelict(d);
    // asteroid: poligon bergerigi
    for (const a of asteroids) {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.rot);
        ctx.fillStyle = '#565c72';
        ctx.beginPath();
        for (let i = 0; i < a.verts.length; i++) {
            const ang = (i / a.verts.length) * Math.PI * 2;
            const rr = a.r * a.verts[i];
            i === 0 ? ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr) : ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.arc(a.r * 0.25, -a.r * 0.2, a.r * 0.25, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
    if (boss) drawBoss(boss);
    if (gameState === 'playing' || gameState === 'paused') drawPlane();

    // particles
    for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.ttl * 2);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    // teks poin melayang
    ctx.font = 'bold 14px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of popTexts) {
        ctx.globalAlpha = Math.min(1, t.ttl * 1.6);
        ctx.fillStyle = '#ffd54a';
        ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;

    // bomb flash
    if (bombFlash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${bombFlash})`;
        ctx.fillRect(-20, -20, W + 40, H + 40);
    }

    // banner
    if (banner) {
        ctx.fillStyle = 'rgba(5,5,15,0.55)';
        ctx.fillRect(0, H / 2 - 44, W, 88);
        ctx.fillStyle = '#e8e8f5';
        ctx.font = 'bold 34px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(banner.text, W / 2, H / 2);
    }

    ctx.restore();
    presentCRT();
}

// ---------- Loop ----------
let lastFrame = performance.now();
let fpsAccum = 0, fpsFrames = 0;

function loop(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    fpsAccum += dt; fpsFrames++;
    if (fpsAccum >= 0.5) {
        hud.fps.textContent = Math.round(fpsFrames / fpsAccum) + ' FPS';
        fpsAccum = 0; fpsFrames = 0;
    }

    update(dt, now);
    if (gameState === 'playing') bgmUpdate();
    render();
    requestAnimationFrame(loop);
}

// ---------- Input ----------
window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault();
    ensureAudio();
    keys.add(k.length === 1 ? k.toLowerCase() : k);

    if (k === ' ') {
        if (gameState === 'menu' || gameState === 'gameover') {
            resetGame();
            gameState = 'playing';
            hideOverlay();
            updateHud();
            bgmStart();
            bgmSetIntensity(0);
        }
    } else if (k.toLowerCase() === 'p') {
        if (gameState === 'playing') {
            gameState = 'paused';
            showOverlay('PAUSED', 'Tekan <kbd>P</kbd> untuk lanjut', false);
        } else if (gameState === 'paused') {
            gameState = 'playing';
            hideOverlay();
        }
    } else if (k.toLowerCase() === 'm') {
        soundOn = !soundOn;
        hud.sfx.textContent = soundOn ? (audioFailed ? '♪ basic' : '♪ on') : '♪ off';
        // Sound ON lagi: reset timeline BGM biar gak burst semua step yang tertinggal
        if (soundOn && BGM.running && audioCtx) BGM.nextTime = audioCtx.currentTime + 0.06;
        // Fallback HTMLAudio harus ikut mute/unmute
        if (bgmEl) {
            if (soundOn && BGM.running) bgmEl.play().catch(() => {});
            else bgmEl.pause();
        }
    } else if (k.toLowerCase() === 'x') {
        useBomb();
    } else if (['1', '2', '3'].includes(k) && (gameState === 'menu' || gameState === 'gameover')) {
        // pilih pesawat di menu / layar game over
        shipIndex = Number(k) - 1;
        localStorage.setItem('neonstrike-ship', shipIndex);
        updateHud();
    }
});

window.addEventListener('keyup', (e) => {
    const k = e.key;
    keys.delete(k.length === 1 ? k.toLowerCase() : k);
});

// ---------- Boot ----------
setupCanvas();
initStars();
hud.sfx.textContent = '♪ on';
updateHud();
requestAnimationFrame(loop);
