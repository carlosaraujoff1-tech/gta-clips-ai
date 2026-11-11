"""Jump cuts: removes dead air inside a clip to tighten the pacing.

A pause is removed only when it has no speech (Whisper word timings) **and** is
quiet in the audio (measured every 100 ms). Gunshots, sirens, crashes or laughter
without words are therefore never cut, and a live with constant game music/radio
simply gets no cuts.
"""

from __future__ import annotations

import math
import statistics
import wave
from collections.abc import Sequence
from pathlib import Path

from app.services.subtitles import Word

FRAME_S = 0.1
SPEECH_GAP_S = 0.45  # words closer than this belong to the same phrase
PAD_BEFORE_S = 0.12
PAD_AFTER_S = 0.22
MIN_CUT_S = 0.4  # shorter pauses are natural breathing, keep them
QUIET_MARGIN_DB = 12.0  # "quiet" = this much below the typical speech level
CUT_GUARD_S = 0.06
MAX_PIECES = 40

Interval = tuple[float, float]


def loudness_frames(wav_path: Path) -> list[float]:
    """dBFS for each 100 ms of a 16-bit mono WAV."""
    import numpy as np

    with wave.open(str(wav_path), "rb") as wav:
        if wav.getsampwidth() != 2 or wav.getnchannels() != 1:
            raise ValueError("expected 16-bit mono WAV")
        rate = wav.getframerate()
        samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16)
    block = max(1, int(rate * FRAME_S))
    data = samples.astype(np.float32) / 32768.0
    out: list[float] = []
    for i in range(0, len(data), block):
        part = data[i : i + block]
        if len(part) == 0:
            break
        rms = float(np.sqrt(np.mean(part * part)))
        out.append(20 * math.log10(max(rms, 1e-5)))
    return out


def speech_intervals(words: Sequence[Word], duration: float) -> list[Interval]:
    spans: list[Interval] = []
    for w in sorted(words, key=lambda w: w.start):
        start = max(0.0, w.start - PAD_BEFORE_S)
        end = min(duration, w.end + PAD_AFTER_S)
        if spans and start - spans[-1][1] < SPEECH_GAP_S:
            spans[-1] = (spans[-1][0], max(spans[-1][1], end))
        else:
            spans.append((start, end))
    return spans


def keep_intervals(
    words: Sequence[Word], loudness: Sequence[float] | None, duration: float
) -> list[Interval]:
    """Parts of the clip to keep, in clip time. ``[(0, duration)]`` means no cut."""
    full = [(0.0, duration)]
    if not words or not loudness or duration <= 0:
        return full
    speech = speech_intervals(words, duration)

    def frames(a: float, b: float) -> list[float]:
        return list(loudness[int(a / FRAME_S) : max(int(a / FRAME_S) + 1, int(b / FRAME_S))])

    speech_levels = [v for a, b in speech for v in frames(a, b)]
    if not speech_levels:
        return full
    quiet = statistics.median(speech_levels) - QUIET_MARGIN_DB

    # Gaps between phrases (plus the head before the first word).
    gaps: list[Interval] = []
    cursor = 0.0
    for a, b in speech:
        if a - cursor > 0:
            gaps.append((cursor, a))
        cursor = b
    # The tail after the last word is kept: it usually holds the reaction.

    cuts: list[Interval] = []
    for a, b in gaps:
        # Cut only the quiet runs inside the gap, never the loud parts.
        run_start: float | None = None
        n_frames = max(0, round((b - a) / FRAME_S))
        for k in range(n_frames + 1):
            t = a + k * FRAME_S
            idx = int(t / FRAME_S)
            is_quiet = k < n_frames and idx < len(loudness) and loudness[idx] < quiet
            if is_quiet and run_start is None:
                run_start = t
            elif not is_quiet and run_start is not None:
                run_end = min(t, b)
                if run_end - run_start >= MIN_CUT_S:
                    cuts.append((run_start + CUT_GUARD_S, run_end - CUT_GUARD_S))
                run_start = None

    if not cuts:
        return full
    # Too many tiny pieces makes a choppy video and a huge filter graph: keep the longest cuts.
    if len(cuts) >= MAX_PIECES:
        cuts = sorted(sorted(cuts, key=lambda c: c[1] - c[0], reverse=True)[: MAX_PIECES - 1])

    keeps: list[Interval] = []
    cursor = 0.0
    for a, b in cuts:
        if a > cursor:
            keeps.append((cursor, a))
        cursor = b
    if cursor < duration:
        keeps.append((cursor, duration))
    return [(round(a, 3), round(b, 3)) for a, b in keeps if b - a > 0.05]


def kept_duration(keeps: Sequence[Interval]) -> float:
    return sum(b - a for a, b in keeps)


def remap_time(t: float, keeps: Sequence[Interval]) -> float | None:
    """Clip time -> time in the cut video (``None`` if ``t`` falls in a removed part)."""
    offset = 0.0
    for a, b in keeps:
        if t < a:
            return None
        if t <= b:
            return offset + (t - a)
        offset += b - a
    return None


def remap_words(words: Sequence[Word], keeps: Sequence[Interval]) -> list[Word]:
    out: list[Word] = []
    for w in words:
        start = remap_time(w.start, keeps)
        end = remap_time(w.end, keeps)
        if start is None and end is None:
            continue
        if start is None:
            start = end if end is not None else 0.0
        if end is None:
            end = start + 0.2
        out.append(Word(start, max(end, start + 0.05), w.text))
    return out


def limit_cuts(keeps: Sequence[Interval], duration: float, min_final: float) -> list[Interval]:
    """Never let the cut video drop below ``min_final`` seconds.

    If removing every pause would make the clip shorter than the minimum, only the
    *longest* pauses stay removed and the shorter ones are put back.
    """
    if min_final <= 0 or duration <= min_final or len(keeps) < 2:
        return list(keeps)
    if kept_duration(keeps) >= min_final:
        return list(keeps)
    # gaps between the kept pieces = the removed pauses (the head/tail are never cut)
    gaps = [(keeps[i][1], keeps[i + 1][0]) for i in range(len(keeps) - 1)]
    allowed = duration - min_final  # seconds we are still allowed to remove
    removed: list[Interval] = []
    for gap in sorted(gaps, key=lambda g: g[1] - g[0], reverse=True):
        length = gap[1] - gap[0]
        if length <= allowed:
            removed.append(gap)
            allowed -= length
    if not removed:
        return [(0.0, duration)]
    removed.sort()
    out: list[Interval] = []
    cursor = 0.0
    for a, b in removed:
        if a > cursor:
            out.append((round(cursor, 3), round(a, 3)))
        cursor = b
    if cursor < duration:
        out.append((round(cursor, 3), round(duration, 3)))
    return out
