"""Burned-in subtitles for vertical clips, as an ASS file rendered by libass (ffmpeg).

Style: short chunks of 1-3 words, uppercase, thick outline (readable over any game
footage), current word highlighted ("karaoke"), placed in the lower third where
TikTok/Reels/Shorts UI does not cover it. Timings come from Whisper word timestamps.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass

from app.schemas.settings import SubtitleStyle

WIDTH, HEIGHT = 1080, 1920

# ASS colours are &HAABBGGRR (alpha 00 = opaque).
WHITE = "&H00FFFFFF"
BLACK = "&H00000000"
HIGHLIGHT = "&H0000E5FF"  # warm yellow (#FFE500)
TITLE_BOX = "&H10F65C8B"  # app accent violet (#8B5CF6), nearly opaque

MAX_WORDS = 3
MAX_CHARS = 16
GAP_BREAK_S = 0.6


@dataclass(frozen=True)
class Word:
    start: float
    end: float
    text: str


def _ts(seconds: float) -> str:
    cs = max(0, round(seconds * 100))
    h, rem = divmod(cs, 360_000)
    m, rem = divmod(rem, 6000)
    s, cs = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _clean(text: str) -> str:
    # Remove ASS control characters so speech can never inject override tags.
    return re.sub(r"[{}\\]", "", text).replace("\n", " ").strip()


def words_for_range(
    segments: Sequence[tuple[float, float, str, list[list[object]] | None]],
    start: float,
    end: float,
) -> list[Word]:
    """Words inside [start, end], shifted so the clip starts at 0.

    ``segments`` rows are (start, end, text, words) where words are
    [start, end, word, probability]. Segments without word timings are split evenly.
    """
    out: list[Word] = []
    for seg_start, seg_end, text, words in segments:
        if seg_end <= start or seg_start >= end:
            continue
        items: list[tuple[float, float, str]] = []
        if words:
            for w in words:
                w_start, w_end, w_text = float(w[0]), float(w[1]), str(w[2])  # type: ignore[arg-type]
                items.append((w_start, w_end, w_text))
        else:
            tokens = text.split()
            step = (seg_end - seg_start) / max(len(tokens), 1)
            items = [
                (seg_start + i * step, seg_start + (i + 1) * step, t) for i, t in enumerate(tokens)
            ]
        for w_start, w_end, w_text in items:
            if w_end <= start or w_start >= end:
                continue
            cleaned = _clean(w_text)
            if cleaned:
                out.append(Word(max(0.0, w_start - start), min(end, w_end) - start, cleaned))
    return out


def chunk_words(words: Sequence[Word]) -> list[list[Word]]:
    chunks: list[list[Word]] = []
    current: list[Word] = []
    for word in words:
        if current:
            length = sum(len(w.text) + 1 for w in current) + len(word.text)
            gap = word.start - current[-1].end
            ends_sentence = current[-1].text[-1:] in ".!?,"
            if (
                len(current) >= MAX_WORDS
                or length > MAX_CHARS
                or gap > GAP_BREAK_S
                or ends_sentence
            ):
                chunks.append(current)
                current = []
        current.append(word)
    if current:
        chunks.append(current)
    return chunks


def _display(word: str) -> str:
    # Viral-style captions: uppercase, no commas/periods (keep ? and ! for emotion).
    return re.sub(r"[.,;:…]+", "", word).upper()


def _chunk_text(chunk: Sequence[Word], active: int | None) -> str:
    parts = []
    for i, w in enumerate(chunk):
        text = _display(w.text)
        if i == active:
            parts.append(
                f"{{\\c{HIGHLIGHT}\\fscx108\\fscy108}}{text}{{\\c{WHITE}\\fscx100\\fscy100}}"
            )
        else:
            parts.append(text)
    return " ".join(parts)


def build_ass(
    words: Sequence[Word],
    duration: float,
    *,
    font: str,
    style: SubtitleStyle,
    title: str | None,
) -> str:
    safe_font = re.sub(r"[^A-Za-z0-9 ._-]", "", font) or "Arial"
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {WIDTH}
PlayResY: {HEIGHT}
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,{safe_font},86,{WHITE},{WHITE},{BLACK},&H80000000,-1,0,0,0,100,100,1,0,1,7,3,2,90,90,430,1
Style: Title,{safe_font},62,{WHITE},{WHITE},{TITLE_BOX},{TITLE_BOX},-1,0,0,0,100,100,0,0,3,18,0,8,110,110,250,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events: list[str] = []
    if title:
        events.append(
            f"Dialogue: 1,{_ts(0)},{_ts(duration)},Title,,0,0,0,,{{\\fad(250,0)}}{_clean(title)}"
        )

    chunks = chunk_words(words)
    for n, chunk in enumerate(chunks):
        chunk_start = chunk[0].start
        # Keep each chunk on screen until the next one starts (no flicker between words).
        next_start = chunks[n + 1][0].start if n + 1 < len(chunks) else duration
        chunk_end = min(max(chunk[-1].end + 0.35, chunk[-1].end), next_start, duration)
        if chunk_end <= chunk_start:
            continue
        if style == "karaoke":
            for i, w in enumerate(chunk):
                w_start = chunk_start if i == 0 else w.start
                w_end = chunk[i + 1].start if i + 1 < len(chunk) else chunk_end
                if w_end <= w_start:
                    continue
                pop = "{\\fscx92\\fscy92\\t(0,90,\\fscx100\\fscy100)}" if i == 0 else ""
                events.append(
                    f"Dialogue: 0,{_ts(w_start)},{_ts(w_end)},Sub,,0,0,0,,{pop}{_chunk_text(chunk, i)}"
                )
        else:
            events.append(
                f"Dialogue: 0,{_ts(chunk_start)},{_ts(chunk_end)},Sub,,0,0,0,,{_chunk_text(chunk, None)}"
            )
    return header + "\n".join(events) + "\n"
