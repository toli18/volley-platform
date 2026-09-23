"""Generate Bulgarian dub for Volleyball Mastery reels (internal use)."""
from __future__ import annotations

import argparse
import asyncio
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

import edge_tts
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
VOICE = "bg-BG-KalinaNeural"
TTS_RATE = "-8%"  # slightly slower for clearer kid-friendly diction
SUBTITLE_BLUR_TOP = 240
SUBTITLE_BLUR_BOTTOM = 280  # TikTok / Reels captions often sit low on screen
MAX_TEMPO = 1.22  # BG TTS often longer than EN slots; cap keeps speech intelligible
ANCHOR_TEMPO = 1.32  # max speed-up in --anchored mode (no word trimming)
SUBTITLE_FONT_SIZE = 13
SUBTITLE_ALIGNMENT = 8  # top center
SUBTITLE_MARGIN_V = 48
SUBTITLE_LINE_MAX = 38

ZONE_WORDS = {
    "1": "едно",
    "2": "две",
    "3": "три",
    "4": "четири",
    "5": "пет",
    "6": "шест",
}


@dataclass
class Phrase:
    start: float
    text: str


@dataclass
class Job:
    slug: str
    video_in: Path
    video_clean: Path
    narration_in: Path
    audio_out: Path
    video_out: Path


def job_for(slug: str, base: Path | None = None) -> Job:
    root = base or ROOT
    return Job(
        slug=slug,
        video_in=root / f"{slug}_video.mp4",
        video_clean=root / f"{slug}_video_nosubs.mp4",
        narration_in=root / f"{slug}.bg_narration.txt",
        audio_out=root / f"{slug}_bg_audio.m4a",
        video_out=root / f"{slug}_BG_internal.mp4",
    )


def parse_narration(path: Path) -> list[Phrase]:
    phrases: list[Phrase] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        start_s, text = line.split("|", 1)
        phrases.append(Phrase(float(start_s.strip()), text.strip()))
    return phrases


def clean_text(text: str) -> str:
    t = text.replace("—", ",")
    t = re.sub(r"\bз\.\s*(\d)\b", lambda m: f"зона {ZONE_WORDS.get(m.group(1), m.group(1))}", t, flags=re.I)
    t = re.sub(r"\bалз(ата|и|а)?\b", "пас", t, flags=re.I)
    t = t.replace("анената", "антената")
    t = t.replace("хълбици", "хълбоци").replace("хълбиците", "хълбоците")
    t = t.replace("ricochet", "рикошет")
    return re.sub(r"\s+", " ", t).strip()


def run(cmd: list[str]) -> None:
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"Command failed:\n{' '.join(cmd)}\n{p.stderr}")


def probe_duration(path: Path) -> float:
    p = subprocess.run([FFMPEG, "-i", str(path)], capture_output=True, text=True)
    m = re.search(r"Duration:\s(\d+):(\d+):(\d+\.\d+)", p.stderr)
    if not m:
        raise RuntimeError(f"Cannot probe duration for {path}")
    h, mnt, sec = m.groups()
    return int(h) * 3600 + int(mnt) * 60 + float(sec)


def strip_burned_subtitles(src: Path, dst: Path, *, force: bool = False) -> Path:
    if not force and dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
        return dst
    top, bot = SUBTITLE_BLUR_TOP, SUBTITLE_BLUR_BOTTOM
    vf = (
        f"[0:v]split=3[main][strip_top][strip_bot];"
        f"[strip_top]crop=iw:{top}:0:0,boxblur=28:6[blur_top];"
        f"[strip_bot]crop=iw:{bot}:0:ih-{bot},boxblur=28:6[blur_bot];"
        f"[main][blur_top]overlay=0:0[tmp];"
        f"[tmp][blur_bot]overlay=0:H-h"
    )
    run([FFMPEG, "-y", "-i", str(src), "-vf", vf, "-c:v", "libx264", "-crf", "20", "-preset", "fast", "-an", str(dst)])
    return dst


async def tts(text: str, out: Path) -> None:
    last: Exception | None = None
    for attempt in range(5):
        try:
            comm = edge_tts.Communicate(clean_text(text), VOICE, rate=TTS_RATE, pitch="-1Hz")
            await comm.save(str(out))
            return
        except edge_tts.exceptions.NoAudioReceived as exc:
            last = exc
            await asyncio.sleep(1.5 * (attempt + 1))
    if last:
        raise last


def _atempo_chain(ratio: float) -> str:
    """Build ffmpeg atempo filter chain (each node must stay in 0.5–2.0)."""
    ratio = max(ratio, 1.0)
    parts: list[str] = []
    while ratio > 2.0 + 1e-6:
        parts.append("atempo=2.0")
        ratio /= 2.0
    parts.append(f"atempo={ratio:.5f}")
    return ",".join(parts)


def fit_segment(src: Path, dst: Path, target: float) -> float:
    """Pad or time-fit TTS so each phrase ends on schedule (video stays in sync)."""
    target = max(target, 0.35)
    dur = probe_duration(src)
    if dur + 0.03 < target:
        pad = target - dur
        run(
            [
                FFMPEG,
                "-y",
                "-i",
                str(src),
                "-af",
                f"apad=pad_dur={pad:.3f}",
                "-t",
                f"{target:.3f}",
                "-c:a",
                "libmp3lame",
                "-q:a",
                "2",
                str(dst),
            ]
        )
        return target
    if dur <= target + 0.03:
        run(
            [
                FFMPEG,
                "-y",
                "-i",
                str(src),
                "-t",
                f"{target:.3f}",
                "-c:a",
                "libmp3lame",
                "-q:a",
                "2",
                str(dst),
            ]
        )
        return target
    tempo = min(dur / target, MAX_TEMPO)
    af = _atempo_chain(tempo)
    dur_after = dur / tempo
    if dur_after > target + 0.05:
        fade_start = max(target - 0.1, 0.0)
        af = f"{af},afade=t=out:st={fade_start:.3f}:d=0.1"
    run(
        [
            FFMPEG,
            "-y",
            "-i",
            str(src),
            "-af",
            af,
            "-t",
            f"{target:.3f}",
            "-c:a",
            "libmp3lame",
            "-q:a",
            "2",
            str(dst),
        ]
    )
    return target


def fit_anchored_phrase(src: Path, dst: Path, window: float) -> float:
    """Fit TTS into [window] with atempo only — full words, synced to video slots."""
    window = max(window, 0.35)
    dur = probe_duration(src)
    if dur + 0.03 < window:
        pad = window - dur
        run(
            [
                FFMPEG,
                "-y",
                "-i",
                str(src),
                "-af",
                f"apad=pad_dur={pad:.3f}",
                "-t",
                f"{window:.3f}",
                "-c:a",
                "libmp3lame",
                "-q:a",
                "2",
                str(dst),
            ]
        )
        return window
    tempo = min(dur / window, ANCHOR_TEMPO)
    af = _atempo_chain(tempo)
    out_dur = dur / tempo
    cmd = [FFMPEG, "-y", "-i", str(src), "-af", af, "-c:a", "libmp3lame", "-q:a", "2"]
    if out_dur <= window + 0.04:
        cmd.extend(["-t", f"{window:.3f}"])
        run(cmd + [str(dst)])
        return window
    run(cmd + [str(dst)])
    return probe_duration(dst)


def build_dub_anchored(
    phrases: list[Phrase], total: float, work: Path
) -> tuple[list[str], list[tuple[float, float, str]]]:
    """Start each phrase on its timestamp; gentle atempo only, no word trimming."""
    lines: list[str] = []
    timings: list[tuple[float, float, str]] = []
    pos = 0.0
    for i, phrase in enumerate(phrases):
        gap = phrase.start - pos
        if gap > 0.02:
            silence = work / f"sil_before_{i:02d}.mp3"
            run(
                [
                    FFMPEG,
                    "-y",
                    "-f",
                    "lavfi",
                    "-i",
                    "anullsrc=r=24000:cl=mono",
                    "-t",
                    f"{gap:.3f}",
                    "-c:a",
                    "libmp3lame",
                    "-q:a",
                    "2",
                    str(silence),
                ]
            )
            lines.append(f"file '{silence.as_posix()}'")
            pos += gap

        raw = work / f"raw_{i:02d}.mp3"
        seg = work / f"seg_{i:02d}.mp3"
        asyncio.run(tts(phrase.text, raw))
        window = slot_until(phrases, i, total)
        seg_dur = fit_anchored_phrase(raw, seg, window)
        lines.append(f"file '{seg.as_posix()}'")
        timings.append((phrase.start, phrase.start + seg_dur, phrase.text))
        pos += seg_dur

    tail = max(total - pos, 0.0)
    if tail > 0.05:
        silence = work / "sil_tail.mp3"
        run(
            [
                FFMPEG,
                "-y",
                "-f",
                "lavfi",
                "-i",
                "anullsrc=r=24000:cl=mono",
                "-t",
                f"{tail:.3f}",
                "-c:a",
                "libmp3lame",
                "-q:a",
                "2",
                str(silence),
            ]
        )
        lines.append(f"file '{silence.as_posix()}'")

    return lines, timings


def slot_until(phrases: list[Phrase], i: int, total: float) -> float:
    if i + 1 < len(phrases):
        return max(phrases[i + 1].start - phrases[i].start, 0.35)
    return max(total - phrases[i].start, 0.35)


def build_dub(phrases: list[Phrase], total: float, work: Path) -> tuple[list[str], list[tuple[float, float, str]]]:
    lines: list[str] = []
    timings: list[tuple[float, float, str]] = []
    t = 0.0
    for i, phrase in enumerate(phrases):
        gap = max(phrase.start - t, 0.0)
        if gap > 0.02:
            silence = work / f"sil_before_{i:02d}.mp3"
            run(
                [
                    FFMPEG,
                    "-y",
                    "-f",
                    "lavfi",
                    "-i",
                    "anullsrc=r=24000:cl=mono",
                    "-t",
                    f"{gap:.3f}",
                    "-c:a",
                    "libmp3lame",
                    "-q:a",
                    "2",
                    str(silence),
                ]
            )
            lines.append(f"file '{silence.as_posix()}'")
            t += gap

        speech_start = t
        target = slot_until(phrases, i, total)
        raw = work / f"raw_{i:02d}.mp3"
        fit = work / f"seg_{i:02d}.mp3"
        asyncio.run(tts(phrase.text, raw))
        seg_dur = fit_segment(raw, fit, target)
        lines.append(f"file '{fit.as_posix()}'")
        timings.append((speech_start, speech_start + seg_dur, phrase.text))
        t = speech_start + seg_dur

    tail = max(total - t, 0.0)
    if tail > 0.05:
        silence = work / "sil_tail.mp3"
        run(
            [
                FFMPEG,
                "-y",
                "-f",
                "lavfi",
                "-i",
                "anullsrc=r=24000:cl=mono",
                "-t",
                f"{tail:.3f}",
                "-c:a",
                "libmp3lame",
                "-q:a",
                "2",
                str(silence),
            ]
        )
        lines.append(f"file '{silence.as_posix()}'")

    return lines, timings


def merge_audio(lines: list[str], work: Path, audio_out: Path) -> Path:
    concat_list = work / "concat.txt"
    concat_list.write_text("\n".join(lines), encoding="utf-8")
    merged = work / "merged.mp3"
    run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list), "-c:a", "libmp3lame", "-q:a", "2", str(merged)])
    run([FFMPEG, "-y", "-i", str(merged), "-c:a", "aac", "-b:a", "160k", str(audio_out)])
    return audio_out


def prepare_video(src: Path, dst: Path, blur: bool, *, force_blur: bool = False) -> Path:
    if not blur:
        if not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime:
            shutil.copy2(src, dst)
        return dst
    return strip_burned_subtitles(src, dst, force=force_blur)


def phrase_timings(phrases: list[Phrase], total: float) -> list[tuple[float, float, str]]:
    return [
        (p.start, p.start + slot_until(phrases, i, total), p.text)
        for i, p in enumerate(phrases)
    ]


def fmt_ass_time(sec: float) -> str:
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = sec % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def fmt_vtt_time(sec: float) -> str:
    ms = int(round(sec * 1000))
    h, rem = divmod(ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def wrap_subtitle_lines(text: str, max_len: int = SUBTITLE_LINE_MAX) -> str:
    words = text.split()
    lines: list[str] = []
    current: list[str] = []
    for word in words:
        trial = " ".join(current + [word]).strip()
        if len(trial) <= max_len:
            current.append(word)
        else:
            if current:
                lines.append(" ".join(current))
            current = [word]
    if current:
        lines.append(" ".join(current))
    return "\\N".join(lines[:2])


def write_vtt(path: Path, timings: list[tuple[float, float, str]]) -> None:
    lines = ["WEBVTT", ""]
    for start, end, text in timings:
        display = wrap_subtitle_lines(text).replace("\\N", "\n")
        lines.append(f"{fmt_vtt_time(start)} --> {fmt_vtt_time(end)}")
        lines.append(display)
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def write_ass(path: Path, timings: list[tuple[float, float, str]]) -> None:
    lines = [
        "[Script Info]",
        "Title: BG",
        "ScriptType: v4.00+",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "YCbCr Matrix: TV.709",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        "Style: Default,Arial,"
        f"{SUBTITLE_FONT_SIZE},"
        "&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,1.5,0.5,"
        f"{SUBTITLE_ALIGNMENT},20,20,"
        f"{SUBTITLE_MARGIN_V},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    for start, end, text in timings:
        safe = wrap_subtitle_lines(text.replace("\n", " ").replace("{", "").replace("}", ""))
        lines.append(
            f"Dialogue: 0,{fmt_ass_time(start)},{fmt_ass_time(end)},Default,,0,0,0,,{safe}"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8-sig")


def extend_video_to_audio(video: Path, audio: Path, work: Path) -> Path:
    vdur = probe_duration(video)
    adur = probe_duration(audio)
    if adur <= vdur + 0.05:
        return video
    extra = adur - vdur
    extended = work / "video_extended.mp4"
    run(
        [
            FFMPEG,
            "-y",
            "-i",
            str(video),
            "-vf",
            f"tpad=stop_mode=clone:stop_duration={extra:.3f}",
            "-c:v",
            "libx264",
            "-crf",
            "20",
            "-preset",
            "fast",
            "-an",
            str(extended),
        ]
    )
    return extended


def burn_subtitles(video: Path, audio: Path, ass: Path, out: Path, work: Path) -> None:
    video = extend_video_to_audio(video, audio, work)
    ass_posix = ass.resolve().as_posix().replace(":", r"\:")
    run(
        [
            FFMPEG,
            "-y",
            "-i",
            str(video),
            "-i",
            str(audio),
            "-vf",
            f"ass='{ass_posix}'",
            "-c:v",
            "libx264",
            "-crf",
            "20",
            "-preset",
            "fast",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            str(out),
        ]
    )


def mux(video: Path, audio: Path, out: Path, work: Path | None = None, *, full_audio: bool = False) -> None:
    if work is not None:
        video = extend_video_to_audio(video, audio, work)
    cmd = [
        FFMPEG,
        "-y",
        "-i",
        str(video),
        "-i",
        str(audio),
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
    ]
    if not full_audio:
        cmd.append("-shortest")
    cmd.append(str(out))
    run(cmd)


def process(
    job: Job,
    *,
    blur: bool = True,
    subs: bool = False,
    anchored: bool = False,
    force_blur: bool = False,
) -> None:
    if not job.video_in.exists():
        raise FileNotFoundError(job.video_in)
    if not job.narration_in.exists():
        raise FileNotFoundError(job.narration_in)

    phrases = parse_narration(job.narration_in)
    mode = "anchored" if anchored else "concat"
    print(f"[{job.slug}] {len(phrases)} phrases, voice={VOICE}, subs={subs}, mode={mode}")
    video = prepare_video(job.video_in, job.video_clean, blur, force_blur=force_blur)
    total = probe_duration(video)
    root = job.narration_in.parent
    ass_path = root / f"{job.slug}.bg.ass"
    vtt_path = root / f"{job.slug}.bg.vtt"
    with tempfile.TemporaryDirectory(prefix=f"vm_dub_{job.slug}_") as td:
        work = Path(td)
        if anchored:
            lines, timings = build_dub_anchored(phrases, total, work)
            audio = merge_audio(lines, work, job.audio_out)
        else:
            lines, timings = build_dub(phrases, total, work)
            audio = merge_audio(lines, work, job.audio_out)
        write_vtt(vtt_path, timings)
        print("VTT:", vtt_path)
        print("Audio:", audio)
        if subs:
            write_ass(ass_path, timings)
            print("Subs:", ass_path)
            burn_subtitles(video, audio, ass_path, job.video_out, work)
        else:
            mux(video, audio, job.video_out, work, full_audio=anchored)
        print("Video:", job.video_out)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("slug", nargs="?", default="single_block_defense")
    parser.add_argument("--dir", default="", help="Subfolder under volleyball_mastery (e.g. tiktok)")
    parser.add_argument("--no-blur", action="store_true", help="Skip blurring burned-in EN subtitles")
    parser.add_argument("--subs", action="store_true", help="Burn Bulgarian ASS subtitles into output")
    parser.add_argument(
        "--anchored",
        action="store_true",
        help="Start each phrase on timestamp; full TTS (no word trim), for long VYLO clips",
    )
    parser.add_argument(
        "--force-blur",
        action="store_true",
        help="Re-blur burned EN subtitles (top and bottom bands)",
    )
    args = parser.parse_args()
    base = ROOT / args.dir if args.dir else ROOT
    try:
        process(
            job_for(args.slug, base),
            blur=not args.no_blur,
            subs=args.subs,
            anchored=args.anchored,
            force_blur=args.force_blur,
        )
    except FileNotFoundError as exc:
        print("Missing:", exc, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
