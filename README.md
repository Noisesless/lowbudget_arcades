# 🕹️ Arcade Low Budget

> **Rp 0 production cost.** Zero dependency. Zero build system. Zero aset berbayar.
> Setiap baris pixel-nya digambar runtime, tiap bunyi-nya disintesis Python.

Koleksi game arcade vanilla JS yang berdiri sendiri di `games/<nama>/` —
buka file, langsung main. Tidak ada `npm install`, tidak ada bundler,
tidak ada lisensi aset. 🎉

## 🎮 Games

| Game | Genre | Fitur signature | Status |
|------|-------|-----------------|--------|
| [Neon Tetris](games/tetris/) | Puzzle | BGM Korobeiniki yang ngebut tiap stage, feel 2009-grade (lock delay, DAS/ARR, 7-bag) | ✅ Playable |
| [Neon Strike](games/plane-shooter/) | Shoot 'em up | Tampilan 128-bit CRT, 4 boss binatang animatik, chiptune BGM live-sequenced | ✅ Playable |
| Snake | Arcade | — | 🔜 Coming soon |
| Pong | Arcade | — | 🔜 Coming soon |

## 🚀 Cara main

```bash
git clone https://github.com/Noisesless/lowbudget_arcades.git
cd lowbudget_arcades
python3 -m http.server 8123
```

Buka `http://localhost:8123/` → pilih game. Selesai. Tidak ada langkah lain.

> Dibuka langsung via `file://` juga jalan — audio otomatis fallback ke
> HTMLAudio (badge `♪ basic`), SFX & BGM tetap bunyi.

## 🧨 Neon Strike

Shmup arcade ala konsol 128-bit: render di buffer half-res lalu di-upscale
pixelated + scanline CRT + vignette. Musuhnya serangga kosmik, boss-nya
melirik ke posisi kamu.

**Kontrol**: `← → ↑ ↓` / `WASD` gerak · tembak otomatis · `X` bom · `P` pause · `M` sound · `1`/`2`/`3` pilih pesawat

- ✈️ **3 pesawat, 3 gaya main** — Interceptor (spread, DPS tunggal tertinggi), Blade (twin rapid-fire, lincah, 2 nyawa), Bulwark (laser pierce, 4 nyawa, pelan). Damage & fire rate di-balance per pesawat, pilihan tersimpan di localStorage
- 🔫 **Senjata Lv 1–6 + pesawat morphing**: naik level = pod sayap, sayap energi, pylon rudal, core reaktor muncul di body pesawat. Model peluru beda per pesawat (bolt, tracer, laser, rudal homing)
- 👾 **8 tipe musuh + hazard**: drone, zigzag, diver, shooter, tank (tread-nya beranimasi!), spinner, gunship, mine — plus asteroid & kapal karam raksasa (*derelict*) yang nyumbat layar dan menjamin drop powerup
- 🌊 **Wave formation**: barisan, stream, formasi V, pincer menjepit dua sisi
- 🔥 **Combo x2–x5**: kill beruntun tanpa tersentuh. Greed is good, greed is dead
- 🐙 **4 boss binatang animatik** tiap 3 level: WARDEN (laba-laba, kaki 2 ruas), SWARM LORD (lebah, sayap berurat kepak 22Hz), DOOMSCARAB (kumbang bertanduk), LEVIATHAN (ubur-ubur, tentakel bio-luminesen, pupil melirik) — enraged < 40% HP, serangan scaling makin galak tiap level
- 🌌 Stage themes 4 palet + nebula, powerup mentok otomatis jadi poin bonus

## 🧱 Neon Tetris

Tetris yang *feels* beneran: 7-bag randomizer, lock delay, DAS/ARR auto-repeat,
combo, ghost piece, high score localStorage.

**Kontrol**: `← →` geser · `↑` rotasi · `↓` soft drop · `SPACE` hard drop · `C` hold · `P` pause · `M` sound

- 🎵 BGM **Korobeiniki** (lagu rakyat Rusia, public domain) — tempo naik +8% tiap stage; stage 8+ = panik 1.6x speed

## 🔊 Audio: 100% digenerate, 0 file di-download

Semua SFX & musik di repo ini **digenerate dari kode**, bukan aset jadi:

```bash
python3 games/tetris/assets/gen_audio.py         # SFX + loop Korobeiniki
python3 games/plane-shooter/assets/gen_audio.py  # 9 SFX + 5 stem + full loop
```

Python stdlib murni (`math` + `wave`) — square/triangle/sine wave, envelope,
lowpass 1-pole, noise highpass → WAV 16-bit. BGM Neon Strike di-*sequence*
live di WebAudio (kick/hat/bass/lead di pitch-shift via `playbackRate`),
boss mode naik tempo + lead oktaf. Total semua audio di repo ≈ 1.6MB, lisensi gratis.

## 📁 Struktur

```
arcade-low-budget/
├── index.html          # launcher / daftar game
└── games/
    ├── tetris/
    │   ├── index.html + style.css + tetris.js
    │   └── assets/
    │       ├── gen_audio.py      # generator SFX + BGM (Python stdlib)
    │       ├── sfx/*.wav
    │       └── bgm/bgm.wav       # loop Korobeiniki
    └── plane-shooter/
        ├── index.html + style.css + game.js
        └── assets/
            ├── gen_audio.py      # generator SFX + stem + full loop BGM
            ├── sfx/*.wav
            └── bgm/*.wav         # 5 stem + bgm.wav (fallback loop)
```

## ➕ Tambah game baru

1. Buat folder `games/<nama>/` — HTML + CSS + JS mandiri (plus `assets/` kalau perlu)
2. Daftarkan kartunya di `index.html` root
3. Konvensi low budget: vanilla, tanpa dependency, aset digenerate kode kalau bisa

---

*Made with 💾, `Math.sin()`, dan Web Audio API. Kalau ada bug, itu fiturnya.*
