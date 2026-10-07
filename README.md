# Arcade Low Budget

Koleksi game arcade: zero dependency, zero build system, zero budget.
Setiap game berdiri sendiri di `games/<nama>/` (HTML + CSS + JS + aset).

## Games

| Game | Status | Path |
|------|--------|------|
| Neon Tetris | ✅ Playable | `games/tetris/` |
| Neon Strike | ✅ Playable | `games/plane-shooter/` |
| Snake | Coming soon | — |
| Pong | Coming soon | — |

## Cara main

Disarankan serve via HTTP (audio full quality: Web Audio + WAV via fetch):

```bash
python3 -m http.server 8123
```

Buka `http://localhost:8123/` → pilih game.

Dibuka langsung via `file://` juga jalan: audio otomatis fallback ke
HTMLAudio (`♪ basic` di badge) — SFX & BGM tetap bunyi, tanpa fitur pitch-shift/sequencing.

## Neon Tetris

- Kontrol: ← → geser · ↑ rotasi · ↓ soft drop · SPACE hard drop · C hold · P pause · M sound
- Sistem: stage (tamat tiap 10 baris), combo, lock delay, DAS/ARR auto-repeat, 7-bag randomizer, high score localStorage
- SFX: WAV chiptune di `games/tetris/assets/sfx/` (digenerate lokal, bebas lisensi)
- BGM: Korobeiniki loop (`assets/bgm/bgm.wav`, digenerate `assets/gen_audio.py`), tempo naik 8% per stage, auto-pause/mute

## Neon Strike

- Kontrol: ← → ↑ ↓ / WASD gerak · tembak otomatis · `X` bom · `P` pause · `M` sound · `1`/`2`/`3` pilih pesawat
- Pesawat: Interceptor (spread, DPS tunggal tertinggi), Blade (twin rapid-fire, paling lincah, 2 nyawa), Bulwark (laser pierce, tanky 4 nyawa, DPS paling rendah). Rate of fire & damage di-balance per pesawat. Pilihan tersimpan di localStorage
- Musuh: drone, zigzag, diver, shooter, tank, spinner, gunship, mine + asteroid hazard (muncul mulai level 2, HP & ukuran naik tiap level) + sampah luar angkasa "derelict" (kapal karam raksasa penyumbat jalur, level 3+, HP tebal, drop powerup dijamin). HP kroco +1 tiap 3 level, tank & gunship scaling 2x lebih cepat (skor ikut naik)
- Wave formation: barisan, stream, formasi V, pincer dua sisi — satu wave satu tipe musuh
- Combo multiplier: kill beruntun → skor x2 s/d x5, putus saat kena hit / 3 detik tanpa kill
- Boss tiap 3 level, 4 varian bertema binatang: WARDEN (laba-laba, kipas radial), SWARM LORD (lebah raksasa, aimed burst + spawn drone), DOOMSCARAB (kumbang, laser sweep + homing), LEVIATHAN (ubur-ubur kosmik, spiral bullet-hell). Enraged di bawah 40% HP, semua animatik detail (kaki 2 ruas, sayap berurat, tentakel bio-luminesen, mata melirik). Serangannya scaling per level: peluru lebih banyak, lebih cepat, fire rate naik
- Upgrade senjata Lv 1–6, pola & model peluru beda per pesawat + pesawat **morphing** (pod, sayap energi, pylon rudal, core reaktor). Power-ups: weapon/shield/bom/skor/nyawa — item yang sudah mentok otomatis jadi poin bonus (+ teks melayang)
- Layar 540×810, semua unit digambar detail (panel, kokpit, thruster, tread beranimasi)
- Audio di-preload di background saat load → tidak ada lag saat mulai/mati
- Stage themes: 4 tema warna + nebula, bergilir per level
- Tampilan "128-bit": render buffer half-res di-upscale pixelated + scanline CRT + vignette
- SFX & BGM: WAV asli di `assets/sfx/` + `assets/bgm/`, digenerate `assets/gen_audio.py` (Python stdlib `math`+`wave`, bebas lisensi). BGM = stem kick/hat/bass/lead yang di-sequence live via WebAudio (pitch-shift playbackRate)

## Struktur

```
arcade-low-budget/
├── index.html          # launcher / daftar game
└── games/
    ├── tetris/
    │   ├── index.html
    │   ├── style.css
    │   ├── tetris.js
    │   └── assets/
    │       ├── gen_audio.py      # generator SFX + BGM (Python stdlib)
    │       ├── sfx/*.wav
    │       └── bgm/bgm.wav       # loop Korobeiniki
    └── plane-shooter/
        ├── index.html
        ├── style.css
        ├── game.js
        └── assets/
            ├── gen_audio.py      # generator SFX + stem + full loop BGM
            ├── sfx/*.wav
            └── bgm/*.wav         # 5 stem + bgm.wav (fallback loop)
```

## Tambah game baru

1. Buat folder `games/<nama>/`
2. Isi HTML + CSS + JS mandiri (plus `assets/` kalau perlu)
3. Daftarkan kartunya di `index.html` root
