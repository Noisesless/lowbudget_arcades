// ===== NEON TETRIS =====
// Canvas 2D + requestAnimationFrame => 60 FPS.
// Budget performa: particles di-cap, tanpa shadowBlur per-blok,
// gradient blok di-cache per warna.

'use strict';

// ---------- Konstanta ----------
const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const CELL = 30;
const MAX_PARTICLES = 400;

const TETROMINOES = [
    { shape: [[1, 1, 1, 1]], color: '#00e5e5', glow: 'rgba(0,229,229,0.5)' },   // I
    { shape: [[1, 1], [1, 1]], color: '#f5c518', glow: 'rgba(245,197,24,0.5)' }, // O
    { shape: [[0, 1, 0], [1, 1, 1]], color: '#a24cc0', glow: 'rgba(162,76,192,0.5)' }, // T
    { shape: [[0, 0, 1], [1, 1, 1]], color: '#2b6fff', glow: 'rgba(43,111,255,0.5)' }, // J
    { shape: [[1, 0, 0], [1, 1, 1]], color: '#ff8a2b', glow: 'rgba(255,138,43,0.5)' }, // L
    { shape: [[1, 1, 0], [0, 1, 1]], color: '#3fd44a', glow: 'rgba(63,212,74,0.5)' },  // S
    { shape: [[0, 1, 1], [1, 1, 0]], color: '#e5443a', glow: 'rgba(229,68,58,0.5)' }   // Z
];

// Tema per level: warna grid & glow papan bergeser pelan.
const LEVEL_THEMES = [
    { grid: 'rgba(255,255,255,0.05)', glow: 'rgba(0,229,255,0.10)' },
    { grid: 'rgba(120,200,255,0.07)', glow: 'rgba(0,140,255,0.12)' },
    { grid: 'rgba(255,160,255,0.07)', glow: 'rgba(255,47,214,0.12)' },
    { grid: 'rgba(160,255,180,0.07)', glow: 'rgba(63,212,74,0.12)' },
    { grid: 'rgba(255,220,140,0.08)', glow: 'rgba(255,180,40,0.14)' },
    { grid: 'rgba(255,140,140,0.08)', glow: 'rgba(229,68,58,0.14)' }
];

// ---------- State ----------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('nextCanvas');
const nctx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('holdCanvas');
const hctx = holdCanvas.getContext('2d');

const hud = {
    score: document.getElementById('score'),
    level: document.getElementById('level'),
    lines: document.getElementById('lines'),
    best: document.getElementById('best'),
    combo: document.getElementById('combo'),
    fps: document.getElementById('fps'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlayTitle'),
    overlaySub: document.getElementById('overlaySub'),
    overlayKeys: document.getElementById('overlayKeys')
};

let grid = [];
let currentPiece = null;
let pos = { x: 0, y: 0 };
let nextPiece = null;
let bag = [];

let gameState = 'menu'; // menu | playing | paused | stageclear | gameover
let score = 0, stage = 1, lines = 0, linesThisStage = 0, combo = 0;
const LINES_PER_STAGE = 10; // stage tamat tiap 10 baris
let stageClearAt = 0;       // timestamp untuk banner stage clear
let highScore = Number(localStorage.getItem('tetris-highscore') || 0);
let dropInterval = 800, lastDrop = 0;

// Lock delay: piece yang mendarat gak langsung nge-lock, ada jendela
// buat geser/rotasi. Reset delay max LOCK_RESETS_MAXx biar gak spam-slide.
const LOCK_DELAY = 500, LOCK_RESETS_MAX = 15;
let lockTimer = 0, lockResets = 0;

// DAS/ARR: tahan kiri/kanan -> delay awal lalu auto-repeat
const DAS = 150, ARR = 40;
const heldKeys = { left: 0, right: 0 }; // timestamp keydown per arah
let lastAutoMove = 0;

// Hold piece: simpan 1 bidak (C/Shift), 1x per piece
let heldPiece = null;
let canHold = true;

// Efek: partikel, screen shake, baris flash
let particles = [];
let flashRows = [];      // {row, ttl}
let shake = 0;           // kekuatan shake (px), meluruh tiap frame
let lastFrame = performance.now();
let fpsAccum = 0, fpsFrames = 0;
let prevGameState = 'menu';

// Cache gradient blok per warna supaya tidak createLinearGradient
// 40x per frame (itu pembunuh FPS klasik).
const gradCache = new Map();

// ---------- Setup ----------
function setupCanvases() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = BOARD_WIDTH * CELL * dpr;
    canvas.height = BOARD_HEIGHT * CELL * dpr;
    // ukuran tampilan diatur CSS (responsif, rasio 1:2 dijaga)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const ndpr = dpr;
    nextCanvas.width = 96 * ndpr;
    nextCanvas.height = 64 * ndpr;
    nctx.setTransform(ndpr, 0, 0, ndpr, 0, 0);
    holdCanvas.width = 96 * ndpr;
    holdCanvas.height = 64 * ndpr;
    hctx.setTransform(ndpr, 0, 0, ndpr, 0, 0);
}

function resetGame() {
    grid = Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(null));
    score = 0; stage = 1; lines = 0; linesThisStage = 0; combo = 0;
    dropInterval = 800;
    bag = [];
    particles = [];
    flashRows = [];
    shake = 0;
    nextPiece = null;
    heldPiece = null;
    canHold = true;
    lockTimer = 0; lockResets = 0;
    heldKeys.left = 0; heldKeys.right = 0;
    spawnNextPiece();
    spawnNewPiece();
    drawHoldPreview();
    updateHUD();
}

function startGame() {
    resetGame();
    gameState = 'playing';
    lastDrop = performance.now();
    hideOverlay();
    bgmStart();
}

// ---------- Bidak & 7-bag ----------
function spawnNextPiece() {
    if (bag.length === 0) {
        bag = TETROMINOES.slice();
        for (let i = bag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [bag[i], bag[j]] = [bag[j], bag[i]];
        }
    }
    const pick = bag.pop();
    // Clone shape supaya rotasi tidak merusak template aslinya
    nextPiece = {
        shape: pick.shape.map(r => r.slice()),
        color: pick.color,
        glow: pick.glow
    };
}

function spawnNewPiece() {
    currentPiece = nextPiece;
    pos.x = Math.floor(BOARD_WIDTH / 2) - 1;
    pos.y = 0;
    spawnNextPiece();
    drawNextPreview();
    canHold = true;
    lockTimer = 0; lockResets = 0;

    //spawn di area terisi = game over
    if (!canMove(0, 0)) gameState = 'gameover';
}

// Reset lock delay saat piece aktif dimutasi (bound resets)
function onPieceMutated() {
    if (!canMove(0, 1)) {
        if (lockResets < LOCK_RESETS_MAX) {
            lockTimer = performance.now();
            lockResets++;
        }
    }
}

// Tukar piece aktif dengan slot hold; 1x per piece
function holdPiece() {
    if (!canHold || !currentPiece) return;
    SFX.rotate();
    if (heldPiece) {
        const tmp = heldPiece;
        heldPiece = currentPiece;
        currentPiece = tmp;
        pos.x = Math.floor(BOARD_WIDTH / 2) - 1;
        pos.y = 0;
        lockTimer = 0; lockResets = 0;
        if (!canMove(0, 0)) gameState = 'gameover';
    } else {
        heldPiece = currentPiece;
        spawnNewPiece();
    }
    canHold = false;
    drawHoldPreview();
}

function canMove(dx, dy) {
    const s = currentPiece.shape;
    for (let r = 0; r < s.length; r++) {
        for (let c = 0; c < s[r].length; c++) {
            if (!s[r][c]) continue;
            const x = pos.x + c + dx;
            const y = pos.y + r + dy;
            if (x < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT) return false;
            if (y >= 0 && grid[y][x]) return false;
        }
    }
    return true;
}

function movePiece(dx, dy) {
    if (canMove(dx, dy)) { pos.x += dx; pos.y += dy; onPieceMutated(); return true; }
    return false;
}

function rotatePiece() {
    if (!currentPiece) return;
    const s = currentPiece.shape;
    const rows = s.length, cols = s[0].length;
    const rot = Array.from({ length: cols }, () => Array(rows).fill(0));
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            rot[c][rows - 1 - r] = s[r][c];

    const original = s;
    currentPiece.shape = rot;
    for (const dx of [0, -1, 1, -2, 2]) {
        if (canMove(dx, 0)) { pos.x += dx; onPieceMutated(); return; }
    }
    currentPiece.shape = original; // rotasi mental
}

function hardDrop() {
    let d = 0;
    while (canMove(0, 1)) { pos.y++; d++; }
    score += d * 2;
    shake = Math.min(shake + 3, 8); // efek "gedubrak"
    lockPiece();
    lastDrop = performance.now();
}

function lockPiece() {
    const s = currentPiece.shape;
    for (let r = 0; r < s.length; r++) {
        for (let c = 0; c < s[r].length; c++) {
            if (!s[r][c]) continue;
            const x = pos.x + c, y = pos.y + r;
            if (y < 0) { gameState = 'gameover'; return; }
            grid[y][x] = currentPiece;
        }
    }
    SFX.lock();
    clearLines();
    spawnNewPiece();
}

// ---------- Lines, skor, combo ----------
function clearLines() {
    // Scan dari bawah; setelah splice+unshift, baris di atas bergeser
    // ke bawah sehingga index y dicek ulang (y++). Ini mencegah index
    // basi yang bikin crash saat clear 2+ baris sekaligus.
    let cleared = 0;
    for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
        if (!grid[y].every(cell => cell)) continue;
        flashRows.push({ row: y, ttl: 1 });
        for (let x = 0; x < BOARD_WIDTH; x++) {
            const piece = grid[y][x];
            spawnBurst(x * CELL + CELL / 2, y * CELL + CELL / 2, piece.color, 6);
        }
        grid.splice(y, 1);
        grid.unshift(Array(BOARD_WIDTH).fill(null));
        cleared++;
        y++; // index baris di atas bergeser, cek ulang posisi yang sama
    }
    if (cleared === 0) { combo = 0; return; }

    (cleared >= 4 ? SFX.tetris : SFX.clear)();

    combo++;
    const pts = [0, 100, 300, 500, 800][cleared] * stage;
    score += pts + (combo > 1 ? 50 * combo : 0);
    lines += cleared;
    linesThisStage += cleared;
    shake = Math.min(shake + 2 + cleared * 2, 14);

    // Stage tamat: banner 2 detik, gravitasi naik, theme ganti
    if (linesThisStage >= LINES_PER_STAGE) {
        linesThisStage -= LINES_PER_STAGE;
        stage++;
        dropInterval = Math.max(150, 800 - (stage - 1) * 70);
        gameState = 'stageclear';
        stageClearAt = performance.now();
        SFX.stage();
        bgmSetRate(); // tempo BGM naik bareng gravitasi
        showOverlay('STAGE ' + (stage - 1) + ' CLEAR!',
            'Masuk ke Stage ' + stage + ' — gravitasi naik!', false);
    }

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('tetris-highscore', String(highScore));
    }
    updateHUD(true);
}

// ---------- Partikel (di-cap, murah) ----------
function spawnBurst(x, y, color, n) {
    for (let i = 0; i < n && particles.length < MAX_PARTICLES; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 160;
        particles.push({
            x, y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp - 60,
            life: 0.5 + Math.random() * 0.4,
            size: 2 + Math.random() * 3,
            color
        });
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.vy += 500 * dt; // gravitasi
        p.x += p.vx * dt;
        p.y += p.vy * dt;
    }
    for (let i = flashRows.length - 1; i >= 0; i--) {
        flashRows[i].ttl -= dt * 4;
        if (flashRows[i].ttl <= 0) flashRows.splice(i, 1);
    }
    shake *= 0.85;
    if (shake < 0.2) shake = 0;
}

// ---------- Rendering ----------
// Satu gradient object per warna (koordinat 0..CELL), dipakai ulang via
// ctx.translate — createLinearGradient per blok per frame itu pemboros besar.
function blockGradient(color) {
    let g = gradCache.get(color);
    if (!g) {
        g = ctx.createLinearGradient(0, 0, 0, CELL);
        g.addColorStop(0, shade(color, 0.25));
        g.addColorStop(1, shade(color, -0.35));
        gradCache.set(color, g);
    }
    return g;
}

function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = c => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
    return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`;
}

function drawBlock(x, y, color) {
    ctx.save();
    ctx.translate(x * CELL, y * CELL);
    ctx.fillStyle = blockGradient(color);
    ctx.fillRect(0, 0, CELL, CELL);
    // bevel atas
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(2, 2, CELL - 4, 3);
    // border
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, CELL - 1, CELL - 1);
    ctx.restore();
}

function draw() {
    const theme = LEVEL_THEMES[(stage - 1) % LEVEL_THEMES.length];
    const W = BOARD_WIDTH * CELL, H = BOARD_HEIGHT * CELL;

    ctx.save();
    if (shake > 0) {
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    // Latar
    ctx.fillStyle = '#0a0a16';
    ctx.fillRect(-10, -10, W + 20, H + 20);

    // Glow tema level di dasar papan
    const g = ctx.createLinearGradient(0, H, 0, H - 160);
    g.addColorStop(0, theme.glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H - 160, W, 160);

    // Grid
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < BOARD_WIDTH; i++) { ctx.moveTo(i * CELL + 0.5, 0); ctx.lineTo(i * CELL + 0.5, H); }
    for (let j = 1; j < BOARD_HEIGHT; j++) { ctx.moveTo(0, j * CELL + 0.5); ctx.lineTo(W, j * CELL + 0.5); }
    ctx.stroke();

    // Baris flash (efek clear)
    for (const f of flashRows) {
        ctx.fillStyle = `rgba(255,255,255,${0.7 * f.ttl})`;
        ctx.fillRect(0, f.row * CELL, W, CELL);
    }

    // Ghost piece
    if (currentPiece && gameState === 'playing') {
        let gy = pos.y;
        while (true) {
            let blocked = false;
            const s = currentPiece.shape;
            for (let r = 0; r < s.length && !blocked; r++)
                for (let c = 0; c < s[r].length && !blocked; c++) {
                    if (!s[r][c]) continue;
                    const y = gy + r + 1;
                    if (y >= BOARD_HEIGHT || (y >= 0 && grid[y][pos.x + c])) blocked = true;
                }
            if (blocked) break;
            gy++;
        }
        if (gy > pos.y) {
            ctx.globalAlpha = 0.16;
            ctx.fillStyle = currentPiece.color;
            const s = currentPiece.shape;
            for (let r = 0; r < s.length; r++)
                for (let c = 0; c < s[r].length; c++)
                    if (s[r][c]) ctx.fillRect((pos.x + c) * CELL, (gy + r) * CELL, CELL, CELL);
            ctx.globalAlpha = 1;
        }
    }

    // Blok di papan
    for (let y = 0; y < BOARD_HEIGHT; y++)
        for (let x = 0; x < BOARD_WIDTH; x++)
            if (grid[y][x]) drawBlock(x, y, grid[y][x].color);

    // Bidak aktif + glow tipis (shadowBlur sekali untuk seluruh piece)
    if (currentPiece && gameState !== 'menu') {
        const s = currentPiece.shape;
        ctx.shadowColor = currentPiece.glow;
        ctx.shadowBlur = 12;
        for (let r = 0; r < s.length; r++)
            for (let c = 0; c < s[r].length; c++)
                if (s[r][c] && pos.y + r >= 0) drawBlock(pos.x + c, pos.y + r, currentPiece.color);
        ctx.shadowBlur = 0;
    }

    // Partikel
    for (const p of particles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
}

function drawPiecePreview(g, piece) {
    g.clearRect(0, 0, 96, 64);
    if (!piece) return;
    const s = piece.shape;
    const cell = 16;
    const w = s[0].length * cell, h = s.length * cell;
    const ox = (96 - w) / 2, oy = (64 - h) / 2;
    g.shadowColor = piece.glow;
    g.shadowBlur = 10;
    for (let r = 0; r < s.length; r++) {
        for (let c = 0; c < s[r].length; c++) {
            if (!s[r][c]) continue;
            g.fillStyle = piece.color;
            g.fillRect(ox + c * cell + 1, oy + r * cell + 1, cell - 2, cell - 2);
        }
    }
    g.shadowBlur = 0;
}

function drawNextPreview() { drawPiecePreview(nctx, nextPiece); }
function drawHoldPreview() { drawPiecePreview(hctx, heldPiece); }

// ---------- HUD & Overlay ----------
function updateHUD(pop) {
    hud.score.textContent = score.toLocaleString('id-ID');
    hud.level.textContent = stage;
    hud.lines.textContent = lines;
    hud.best.textContent = highScore.toLocaleString('id-ID');
    hud.combo.textContent = combo > 1 ? `COMBO x${combo}` : '';
    if (pop) {
        hud.score.classList.remove('pop');
        void hud.score.offsetWidth; // restart animasi
        hud.score.classList.add('pop');
    }
}

function showOverlay(title, sub, showKeys) {
    hud.overlayTitle.textContent = title;
    hud.overlaySub.innerHTML = sub;
    hud.overlayKeys.style.display = showKeys ? 'flex' : 'none';
    hud.overlay.classList.remove('hidden');
}

function hideOverlay() {
    hud.overlay.classList.add('hidden');
}

// ---------- SFX: file WAV di assets/sfx/, didecode via Web Audio ----------
let audioCtx = null;
let sfxOn = true;
const buffers = {}; // nama -> AudioBuffer, di-load sekali di awal

function updateSfxIndicator() {
    const el = document.getElementById('sfxState');
    if (el) el.textContent = audioCtx ? (sfxOn ? '♪ ' + audioCtx.state : '♪ off (M)') : '♪ ...';
}

function ensureAudio() {
    // Context sudah dibuat saat page load (preload di bawah); di sini cukup resume
    if (!audioCtx) return;
    // resume() di SETIAP gesture; webview sering suspend lagi
    // setelah tab kehilangan fokus
    if (audioCtx.state === 'suspended') audioCtx.resume().then(updateSfxIndicator);
    updateSfxIndicator();
}
document.addEventListener('pointerdown', ensureAudio);

async function loadAllSfx() {
    const names = ['move', 'rotate', 'soft', 'lock', 'drop', 'clear',
                   'tetris', 'stage', 'over', 'pause', 'toggle'];
    const decode = (n, url) => fetch(url)
        .then(res => { if (!res.ok) throw new Error(n + ': ' + res.status); return res.arrayBuffer(); })
        .then(ab => new Promise((resolve, reject) => {
            // Callback form: di beberapa browser promise form decode tak
            // resolve saat context masih suspended -> SFX/BGM "hilang".
            audioCtx.decodeAudioData(ab, resolve, reject);
        }));
    await Promise.all(names.map(n => decode(n, 'assets/sfx/' + n + '.wav')
        .then(b => { buffers[n] = b; })
        .catch(() => { /* fallback <audio> di play() yang ambil alih */ })));
    // BGM loop (assets/gen_audio.py)
    try {
        buffers.bgm = await decode('bgm', 'assets/bgm/bgm.wav');
    } catch (e) { /* fallback <audio> di bgmStart() */ }
    // Kalau user sudah mulai main sebelum buffer siap, BGM baru nyala sekarang
    if (sfxOn && (gameState === 'playing' || gameState === 'stageclear')) bgmStart();
}

// Preload saat page load — decode jalan di context suspended (boleh),
// jadi begitu user tekan SPACE semua buffer sudah siap. Ini fix BGM yang
// dulu skip karena startGame() sinkron mendahului load selesai.
try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    loadAllSfx();
} catch (e) { /* browser tanpa WebAudio */ }

// Putar buffer; playbackRate bisa dipakai buat variasi pitch
function play(name, rate = 1, vol = 0.8) {
    if (!sfxOn) return;
    const buf = buffers[name];
    if (buf && audioCtx) {
        const src = audioCtx.createBufferSource();
        const gain = audioCtx.createGain();
        src.buffer = buf;
        src.playbackRate.value = rate;
        gain.gain.value = vol;
        src.connect(gain).connect(audioCtx.destination);
        src.start();
        return;
    }
    // Fallback: elemen <audio> biasa — beberapa webview memblokir
    // Web Audio tapi mengizinkan HTMLAudioElement
    const a = new Audio('assets/sfx/' + name + '.wav');
    a.volume = vol;
    a.play().catch(() => {});
}

const SFX = {
    move:   () => play('move', 1 + Math.random() * 0.06),
    rotate: () => play('rotate'),
    soft:   () => play('soft'),
    lock:   () => play('lock'),
    drop:   () => play('drop'),
    clear:  () => play('clear'),
    tetris: () => play('tetris'),
    stage:  () => play('stage'),
    over:   () => play('over', 1, 0.9),
    pause:  () => play('pause'),
    toggle: () => play('toggle')
};

// ---------- BGM loop (Korobeiniki, assets/bgm/bgm.wav) ----------
// Tempo naik 8% per stage (playbackRate), volume di bawah SFX.
let bgmNode = null;
let bgmEl = null; // fallback HTMLAudio (file://: fetch WAV diblokir CORS)
function bgmRate() { return Math.min(1.6, 1 + (stage - 1) * 0.08); }

function bgmStart() {
    if (bgmNode || bgmEl || !sfxOn || !audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    if (buffers.bgm) {
        bgmNode = audioCtx.createBufferSource();
        bgmNode.buffer = buffers.bgm;
        bgmNode.loop = true;
        bgmNode.playbackRate.value = bgmRate();
        const g = audioCtx.createGain();
        g.gain.value = 0.32;
        bgmNode.connect(g).connect(audioCtx.destination);
        bgmNode.start();
    } else {
        // AudioBuffer belum/gagal di-decode (fetch CORS file://) -> <audio> loop
        bgmEl = new Audio('assets/bgm/bgm.wav');
        bgmEl.loop = true;
        bgmEl.volume = 0.32;
        try { bgmEl.playbackRate = bgmRate(); } catch (e) { /* tidak didukung */ }
        bgmEl.play().catch(() => {});
    }
}

function bgmStop() {
    if (bgmNode) { try { bgmNode.stop(); } catch (e) {} bgmNode = null; }
    if (bgmEl) { try { bgmEl.pause(); } catch (e) {} bgmEl = null; }
}

function bgmSetRate() {
    if (bgmNode) bgmNode.playbackRate.value = bgmRate();
    if (bgmEl) { try { bgmEl.playbackRate = bgmRate(); } catch (e) {} }
}

// ---------- Input ----------
document.addEventListener('keydown', e => {
    ensureAudio(); // gesture user = izin audio
    if ((e.key === 'm' || e.key === 'M') && audioCtx) {
        sfxOn = !sfxOn;
        if (sfxOn) {
            SFX.toggle();
            if (gameState === 'playing' || gameState === 'stageclear') bgmStart();
        } else {
            bgmStop();
        }
        updateSfxIndicator();
        return;
    }
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();

    if (e.key === ' ') {
        e.preventDefault();
        if (gameState === 'menu' || gameState === 'gameover') startGame();
        else if (gameState === 'playing') { hardDrop(); SFX.drop(); }
        return;
    }
    if ((e.key === 'r' || e.key === 'R') && gameState === 'gameover') { startGame(); return; }
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        SFX.pause();
        if (gameState === 'playing') {
            gameState = 'paused';
            bgmStop();
            showOverlay('PAUSED', 'Tekan <kbd>P</kbd> untuk lanjut', false);
        } else if (gameState === 'paused') {
            gameState = 'playing';
            lastDrop = performance.now();
            bgmStart();
            hideOverlay();
        }
        return;
    }
    if (gameState !== 'playing') return;

    switch (e.key) {
        case 'ArrowLeft':
            // key-repeat OS diabaikan; auto-move diatur DAS/ARR di loop
            if (!e.repeat) {
                heldKeys.left = performance.now();
                lastAutoMove = heldKeys.left;
                if (movePiece(-1, 0)) SFX.move();
            }
            break;
        case 'ArrowRight':
            if (!e.repeat) {
                heldKeys.right = performance.now();
                lastAutoMove = heldKeys.right;
                if (movePiece(1, 0)) SFX.move();
            }
            break;
        case 'ArrowDown':
            if (movePiece(0, 1)) { score += 1; SFX.soft(); }
            lastDrop = performance.now();
            break;
        case 'ArrowUp': rotatePiece(); SFX.rotate(); break;
        case 'Enter': hardDrop(); SFX.drop(); break;
        case 'c': case 'C': case 'Shift': holdPiece(); break;
    }
});

// Lepas tombol: matikan auto-repeat untuk arah tsj
document.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft') heldKeys.left = 0;
    if (e.key === 'ArrowRight') heldKeys.right = 0;
});

// ---------- Loop utama ----------
function gameLoop(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;

    // FPS counter, update tiap 0.5 detik
    fpsAccum += dt; fpsFrames++;
    if (fpsAccum >= 0.5) {
        hud.fps.textContent = Math.round(fpsFrames / fpsAccum) + ' FPS';
        fpsAccum = 0; fpsFrames = 0;
    }

    // Selesai pamer banner stage clear -> lanjut otomatis
    if (gameState === 'stageclear' && now - stageClearAt > 2000) {
        gameState = 'playing';
        lastDrop = now;
        hideOverlay();
    }

    if (gameState === 'playing') {
        // DAS/ARR: geser otomatis saat tombol kiri/kanan ditahan
        const dir = (heldKeys.left && !heldKeys.right) ? -1
                  : (heldKeys.right && !heldKeys.left) ? 1 : 0;
        if (dir) {
            const pressedAt = dir < 0 ? heldKeys.left : heldKeys.right;
            if (now - pressedAt > DAS && now - lastAutoMove >= ARR) {
                if (movePiece(dir, 0)) SFX.move();
                lastAutoMove = now;
            }
        }

        if (!canMove(0, 1)) {
            // Mendarat: mulai/melanjutkan hitung lock delay
            if (!lockTimer) lockTimer = now;
            else if (now - lockTimer > LOCK_DELAY) lockPiece();
        } else {
            lockTimer = 0;
            if (now - lastDrop > dropInterval) {
                lastDrop = now;
                pos.y++;
                updateHUD(false);
            }
        }
    }

    // Momen transisi: tampilkan overlay game over sekali saja
    if (gameState === 'gameover' && prevGameState !== 'gameover') {
        SFX.over();
        bgmStop();
        showOverlay('GAME OVER', `Skor: <b>${score.toLocaleString('id-ID')}</b> · Tekan <kbd>SPACE</kbd>/<kbd>R</kbd> untuk main lagi`, false);
    }
    prevGameState = gameState;

    updateParticles(dt);
    draw();
    requestAnimationFrame(gameLoop);
}

// ---------- Boot ----------
setupCanvases();
resetGame(); // wajib: isi grid & piece sebelum frame pertama,
             // tanpa ini draw() akses grid[0][x] saat grid masih [] => crash loop
gameState = 'menu';
showOverlay('NEON TETRIS', 'Tekan <kbd>SPACE</kbd> untuk mulai', true);
updateHUD(false);
requestAnimationFrame(gameLoop);
