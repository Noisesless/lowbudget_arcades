#!/usr/bin/env python3
"""Generator BGM NEON TETRIS: Korobeiniki (lagu rakyat Rusia, public domain).

WAV 16-bit mono @ 22050 Hz, murni stdlib Python (math, wave).
SFX yang sudah ada tidak disentuh — script ini hanya membuat bgm.wav.

    python3 assets/gen_audio.py   -> assets/bgm/bgm.wav (loop ~13.6 d, 150 BPM)

Loop di-game diputar dengan BufferSource.loop = true;
tempo naik per stage via playbackRate.
"""
import math
import os
import wave

SR = 22050
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "bgm", "bgm.wav")

# Not name -> offset semitone dari A4 (440 Hz)
NOTES = {'A2': -24, 'E2': -17, 'A4': 0, 'B4': 2, 'C5': 3, 'D5': 5, 'E5': 7}


def freq(name):
    return 440.0 * 2 ** (NOTES[name] / 12.0)


def square(f, dur, vol=0.5, decay=3.5, lp=0.3):
    """Square wave + decay + lowpass 1-pole (redam aliasing)."""
    n = int(SR * dur)
    out, ph, prev = [], 0.0, 0.0
    for i in range(n):
        t = i / SR
        ph += 2 * math.pi * f / SR
        s = 1.0 if math.sin(ph) >= 0 else -1.0
        s *= math.exp(-decay * t)
        prev = lp * s + (1 - lp) * prev
        out.append(prev * vol)
    return out


def tri(f, dur, vol=0.6, decay=3.0, lp=0.2):
    n = int(SR * dur)
    out, ph, prev = [], 0.0, 0.0
    for i in range(n):
        t = i / SR
        ph += 2 * math.pi * f / SR
        s = 2 / math.pi * math.asin(math.sin(ph))
        s *= math.exp(-decay * t)
        prev = lp * s + (1 - lp) * prev
        out.append(prev * vol)
    return out


def overlay(base, extra, start):
    for i, s in enumerate(extra):
        j = start + i
        if j < len(base):
            base[j] += s


def main():
    beat = 0.4  # 150 BPM
    # Korobeiniki bagian A (beat per not; 'rest' = istirahat)
    melody = [
        ('E5', 1), ('B4', 1), ('C5', 1), ('D5', 1), ('C5', 1), ('B4', 1), ('A4', 1), ('A4', 1),
        ('C5', 1), ('E5', 1), ('D5', 1), ('C5', 1), ('B4', 2),
        ('C5', 1), ('D5', 1), ('E5', 2),
        ('C5', 1), ('A4', 1), ('A4', 2),
        ('E5', 1), ('C5', 1), ('D5', 1), ('B4', 1), ('B4', 2),
        ('C5', 1), ('E5', 1), ('D5', 1), ('C5', 1), ('B4', 1), ('B4', 1),
        ('C5', 1), ('D5', 1), ('E5', 1), ('C5', 1), ('A4', 1), ('A4', 1), ('rest', 1),
    ]
    total_beats = sum(b for _, b in melody)
    n = int(SR * total_beats * beat)
    mix = [0.0] * n

    # Melodi square
    pos = 0
    for name, b in melody:
        dur = b * beat
        if name != 'rest':
            overlay(mix, square(freq(name), dur * 0.92), int(pos * SR))
        pos += dur

    # Bass triangle: A2-E2 bergantian per beat
    pos = 0
    i = 0
    while pos < total_beats * beat - 0.01:
        name = 'A2' if i % 2 == 0 else 'E2'
        overlay(mix, tri(freq(name), beat * 0.85), int(pos * SR))
        pos += beat
        i += 1

    # Normalisasi + tulis
    peak = max(abs(s) for s in mix) or 1.0
    k = 0.95 / peak
    data = bytearray()
    for s in mix:
        v = int(max(-1.0, min(1.0, s * k)) * 32767)
        data += v.to_bytes(2, "little", signed=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with wave.open(OUT, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(bytes(data))
    print(f"  bgm.wav {len(mix) / SR:.1f}s @ {1 / beat * 60:.0f} BPM")


if __name__ == "__main__":
    main()
