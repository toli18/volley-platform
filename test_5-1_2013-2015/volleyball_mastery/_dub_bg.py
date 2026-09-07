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
TTS_RATE = "-12%"
SUBTITLE_BLUR_H = 220
MAX_TEMPO = 1.04
SUBTITLE_FONT_SIZE = 14
SUBTITLE_ALIGNMENT = 8  # top center — below blurred EN subs
SUBTITLE_MARGIN_V = 175

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


def strip_burned_subtitles(src: Path, dst: Path) -> Path:
    if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
        return dst
    vf = (
        f"[0:v]split[main][top];"
        f"[top]crop=iw:{SUBTITLE_BLUR_H}:0:0,boxblur=28:6[blur];"
        f"[main][blur]overlay=0:0"
    )
    run([FFMPEG, "-y", "-i", str(src), "-vf", vf, "-c:v", "libx264", "-crf", "20", "-preset", "fast", "-an", str(dst)])
    return dst


async def tts(text: str, out: Path) -> None:
    comm = edge_tts.Communicate(clean_text(text), VOICE, rate=TTS_RATE, pitch="-1Hz")
    await comm.save(str(out))


def fit_segment(src: Path, dst: Path, target: float) -> float:
    """Keep full TTS; pad short segments, never speed up or cut words."""
    dur = probe_duration(src)
    if dur <= target:
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
    run([FFMPEG, "-y", "-i", str(src), "-c:a", "libmp3lame", "-q:a", "2", str(dst)])
    return dur


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


def prepare_video(src: Path, dst: Path, blur: bool) -> Path:
    if not blur:
        if not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime:
            shutil.copy2(src, dst)
        return dst
    return strip_burned_subtitles(src, dst)


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
        safe = text.replace("\n", " ").replace("{", "").replace("}", "")
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


def mux(video: Path, audio: Path, out: Path, work: Path | None = None) -> None:
    if work is not None:
        video = extend_video_to_audio(video, audio, work)
    run(
        [
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
            "-shortest",
            str(out),
        ]
    )


def process(job: Job, *, blur: bool = True, subs: bool = False) -> None:
    if not job.video_in.exists():
        raise FileNotFoundError(job.video_in)
    if not job.narration_in.exists():
        raise FileNotFoundError(job.narration_in)

    phrases = parse_narration(job.narration_in)
    print(f"[{job.slug}] {len(phrases)} phrases, voice={VOICE}, subs={subs}")
    video = prepare_video(job.video_in, job.video_clean, blur)
    total = probe_duration(video)
    root = job.narration_in.parent
    ass_path = root / f"{job.slug}.bg.ass"
    with tempfile.TemporaryDirectory(prefix=f"vm_dub_{job.slug}_") as td:
        work = Path(td)
        lines, timings = build_dub(phrases, total, work)
        audio = merge_audio(lines, work, job.audio_out)
        print("Audio:", audio)
        if subs:
            write_ass(ass_path, timings)
            print("Subs:", ass_path)
            burn_subtitles(video, audio, ass_path, job.video_out, work)
        else:
            mux(video, audio, job.video_out, work)
        print("Video:", job.video_out)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("slug", nargs="?", default="single_block_defense")
    parser.add_argument("--dir", default="", help="Subfolder under volleyball_mastery (e.g. tiktok)")
    parser.add_argument("--no-blur", action="store_true", help="Skip blurring burned-in EN subtitles")
    parser.add_argument("--subs", action="store_true", help="Burn Bulgarian ASS subtitles into output")
    args = parser.parse_args()
    base = ROOT / args.dir if args.dir else ROOT
    try:
        process(job_for(args.slug, base), blur=not args.no_blur, subs=args.subs)
    except FileNotFoundError as exc:
        print("Missing:", exc, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
