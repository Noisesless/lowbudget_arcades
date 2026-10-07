#!/usr/bin/env python3
"""Generator aset audio NEON STRIKE.

WAV 16-bit mono @ 22050 Hz, murni stdlib Python (math, wave, random).
Jalankan dari folder game:

    python3 assets/gen_audio.py

Output:
    assets/sfx/*.wav   -> one-shot SFX
    assets/bgm/*.wav   -> stem BGM (kick/hat/bass/lead).
                          bass & lead adalah nada REFERENSI (A2=110Hz, A4=440Hz);
                          game mem-pitch-shift via playbackRate = freq/ref.
"""
import math
import os
import random
import wave

SR = 22050
HERE = os.path.dirname(os.path.abspath(__file__))
SFX_DIR = os.path.join(HERE, "sfx")
BGM_DIR = os.path.join(HERE, "bgm")


def save(directory, name, samples):
    """Tulis samples (float -1..1) jadi WAV 16-bit mono, dinormalisasi."""
    peak = max(abs(s) for s in samples) or 1.0
    k = 0.98 / peak
    data = bytearray()
    for s in samples:
        v = int(max(-1.0, min(1.0, s * k)) * 32767)
        data += v.to_bytes(2, "little", signed=True)
    path = os.path.join(directory, name)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(bytes(data))
    print(f"  {name:12s} {len(samples) / SR:5.2f}s")


def shape(kind, phase):
    if kind == "sine":
        return math.sin(phase)
    if kind == "square":
        return 1.0 if math.sin(phase) >= 0 else -1.0
    if kind == "saw":
        p = (phase % (2 * math.pi)) / (2 * math.pi)
        return 2 * p - 1
    if kind == "tri":
        return 2 / math.pi * math.asin(math.sin(phase))
    raise ValueError(kind)


def tone(kind, f0, f1, dur, decay=8.0, lp=0.35):
    """Nada glide f0->f1, envelope decay eksponensial.

    Lowpass 1-pole (param lp) meredam aliasing dari square/saw —
    chiptune tetap garing tapi gak nusuk telinga.
    """
    n = int(SR * dur)
    out, ph, prev = [], 0.0, 0.0
    for i in range(n):
        t = i / n
        f = f0 + (f1 - f0) * t
        ph += 2 * math.pi * f / SR
        s = shape(kind, ph) * math.exp(-decay * t)
        prev = lp * s + (1 - lp) * prev
        out.append(prev)
    return out


def noise(dur, decay=8.0, hp=0.85):
    """White noise decay eksponensial + highpass sederhana.

    hp kecil -> boom tebal (banyak low), hp gede -> hi-hat crisp.
    """
    n = int(SR * dur)
    out, prev_x, prev_y = [], 0.0, 0.0
    for i in range(n):
        t = i / n
        x = random.uniform(-1, 1) * math.exp(-decay * t)
        y = hp * (prev_y + x - prev_x)
        prev_x, prev_y = x, y
        out.append(y)
    return out


def concat(*parts):
    return [s for part in parts for s in part]


def mix(*parts):
    """Overlay beberapa sampel, yang lebih pendek diam setelah selesai."""
    n = max(len(p) for p in parts)
    return [sum(p[i] if i < len(p) else 0.0 for p in parts) for i in range(n)]


def silence(dur):
    return [0.0] * int(SR * dur)


def render_bgm_loop():
    """Render full loop chiptune 4 bar (64 step, 132 BPM) jadi satu file.

    Dipakai game sebagai BGM fallback HTMLAudio saat Web Audio fetch/decode
    gagal (mis. game dibuka via file://). Pattern = salinan game.js
    (BGM_ROOTS + BGM_LEAD, intensity normal).
    """
    bpm = 132
    step = 60.0 / bpm / 4  # detik per step 16th
    total = int(SR * step * 64) + SR // 4
    track = [0.0] * total
    roots = [110.0, 87.31, 130.81, 98.0]
    lead = [
        [440, 523, 659, 523, 587, 523, 440, 392, 440, 0, 659, 784, 659, 523, 0, 440],
        [349, 440, 523, 440, 440, 523, 659, 523, 440, 0, 523, 0, 440, 349, 0, 330],
        [523, 659, 784, 659, 659, 784, 880, 784, 659, 0, 784, 659, 523, 0, 440, 523],
        [392, 494, 587, 494, 587, 698, 784, 698, 587, 0, 698, 587, 494, 392, 0, 392],
    ]
    kick = tone("sine", 150, 40, 0.13, decay=25, lp=0.5)
    hat = noise(0.03, decay=60, hp=0.92)
    hatopen = noise(0.09, decay=30, hp=0.92)

    def add(buf, at_sec, gain):
        start = int(at_sec * SR)
        for i, s in enumerate(buf):
            j = start + i
            if j < total:
                track[j] += s * gain

    for s in range(64):
        t = s * step
        root = roots[(s // 16) % 4]
        if s % 4 == 0:
            add(kick, t, 0.30)
        if s % 2 == 0:
            add(hatopen if s % 8 == 6 else hat, t, 0.07)
            add(tone("tri", root, root, 0.30, decay=10, lp=0.25), t, 0.16)
        note = lead[(s // 16) % 4][s % 16]
        if note:
            add(tone("square", note, note, 0.22, decay=10, lp=0.4), t, 0.07)
    return track


def main():
    os.makedirs(SFX_DIR, exist_ok=True)
    os.makedirs(BGM_DIR, exist_ok=True)
    random.seed(1978)  # seed biar hasil generate-nya deterministik

    print("SFX:")
    # peluru: blip square turun cepat
    save(SFX_DIR, "shoot.wav", tone("square", 880, 580, 0.06, decay=30, lp=0.5))
    # peluru musuh kena / tembakan shooter: saw pendek turun
    save(SFX_DIR, "hit.wav", tone("saw", 220, 120, 0.10, decay=25, lp=0.5))
    # musuh ledak: noise + thump bass
    save(SFX_DIR, "boom.wav", mix(noise(0.30, 10, hp=0.3), tone("sine", 90, 40, 0.15, 15)))
    # boss ledak: noise panjang + sub-bass jatuh
    save(SFX_DIR, "bigboom.wav", mix(noise(0.70, 6, hp=0.4), tone("sine", 70, 28, 0.60, 5)))
    # powerup: dua nada naik
    save(SFX_DIR, "power.wav", concat(
        tone("square", 520, 520, 0.07, 15),
        tone("square", 784, 784, 0.10, 12),
    ))
    # pemain mati: noise + saw melungguh
    save(SFX_DIR, "death.wav", mix(noise(0.50, 6, hp=0.5), tone("saw", 300, 50, 0.50, 6)))
    # bom layar: noise + bass drop dalam
    save(SFX_DIR, "bomb.wav", mix(noise(0.80, 5, hp=0.35), tone("sine", 55, 28, 0.70, 4)))
    # warning boss: dua beep alarm
    save(SFX_DIR, "alarm.wav", concat(
        tone("square", 440, 440, 0.18, 6), silence(0.07),
        tone("square", 440, 440, 0.18, 6),
    ))
    # naik level: arpeggio C-E-G-C
    save(SFX_DIR, "levelup.wav", concat(
        tone("square", 523, 523, 0.11, 10),
        tone("square", 659, 659, 0.11, 10),
        tone("square", 784, 784, 0.11, 10),
        tone("square", 1047, 1047, 0.14, 8),
    ))

    print("BGM stems:")
    # kick: sine sweep turun drastis (kick analog klasik)
    save(BGM_DIR, "kick.wav", tone("sine", 150, 40, 0.13, decay=25, lp=0.5))
    # hi-hat: noise highpass, closed & open
    save(BGM_DIR, "hat.wav", noise(0.03, decay=60, hp=0.92))
    save(BGM_DIR, "hatopen.wav", noise(0.09, decay=30, hp=0.92))
    # bass: triangle A2 (referensi pitch, di-pitch-shift di game)
    save(BGM_DIR, "bass.wav", tone("tri", 110, 110, 0.30, decay=10, lp=0.25))
    # lead: square A4 (referensi pitch)
    save(BGM_DIR, "lead.wav", tone("square", 440, 440, 0.22, decay=10, lp=0.4))
    # full loop 4-bar: fallback BGM HTMLAudio (dipakai via play('bgm'))
    save(BGM_DIR, "bgm.wav", render_bgm_loop())

    print("Done.")


if __name__ == "__main__":
    main()
