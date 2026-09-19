#!/usr/bin/env python3
"""CLI fallback for Spectra Theme Reactor.

Prefers a short monitor capture (pw-record / parec) for real RMS/peak.
wpctl / pactl are used for mute honesty only — volume is never treated as music.
"""

from __future__ import annotations

import json
import math
import shutil
import struct
import subprocess
import sys


def which(name: str) -> str | None:
    return shutil.which(name)


def wpctl_mute() -> dict | None:
    exe = which("wpctl")
    if not exe:
        return None
    try:
        out = subprocess.check_output(
            [exe, "get-volume", "@DEFAULT_AUDIO_SINK@"],
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=0.6,
        )
    except (subprocess.SubprocessError, OSError):
        return None
    muted = "MUTED" in out.upper()
    return {"muted": muted, "path": "cli.wpctl"}


def pactl_mute() -> dict | None:
    exe = which("pactl")
    if not exe:
        return None
    try:
        out = subprocess.check_output(
            [exe, "get-sink-mute", "@DEFAULT_SINK@"],
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=0.6,
        )
    except (subprocess.SubprocessError, OSError):
        return None
    muted = "yes" in out.lower()
    return {"muted": muted, "path": "cli.pactl"}


def rms_from_pcm(data: bytes, fmt: str) -> float | None:
    if not data:
        return None
    if fmt == "f32":
        count = len(data) // 4
        if count < 32:
            return None
        samples = struct.unpack("<" + "f" * count, data[: count * 4])
    else:
        count = len(data) // 2
        if count < 32:
            return None
        samples = [s / 32768.0 for s in struct.unpack("<" + "h" * count, data[: count * 2])]
    acc = 0.0
    peak = 0.0
    for sample in samples:
        acc += sample * sample
        absolute = abs(sample)
        if absolute > peak:
            peak = absolute
    rms = math.sqrt(acc / len(samples))
    visual = max(peak, rms) ** (1.0 / 3.0)
    return min(1.0, float(visual))


def capture_rms(cmd: list[str], fmt: str) -> float | None:
    try:
        subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=0.22)
        return None
    except subprocess.TimeoutExpired as exc:
        data = exc.output or b""
    except (subprocess.SubprocessError, OSError):
        return None
    return rms_from_pcm(data, fmt)


def try_pw_record() -> dict | None:
    exe = which("pw-record")
    if not exe:
        return None
    rms = capture_rms(
        [exe, "--rate=8000", "--channels=1", "--format=f32", "-"],
        "f32",
    )
    if rms is None:
        return None
    return {"peak": rms, "rms": rms, "path": "cli.pw-record", "present": True}


def try_parec() -> dict | None:
    exe = which("parec")
    if not exe:
        return None
    rms = capture_rms(
        [exe, "--rate=8000", "--channels=1", "--format=s16le", "--raw"],
        "s16",
    )
    if rms is None:
        return None
    return {"peak": rms, "rms": rms, "path": "cli.parec", "present": True}


def main() -> int:
    mute = wpctl_mute() or pactl_mute()
    levels = try_pw_record() or try_parec()
    out = {
        "present": False,
        "demo": True,
        "muted": bool(mute and mute.get("muted")),
        "peak": 0.0,
        "rms": 0.0,
        "path": "demo",
        "error": "",
    }
    if levels:
        out.update(levels)
        out["demo"] = False
        out["present"] = True
        if mute:
            out["muted"] = bool(mute.get("muted"))
    elif mute and mute.get("muted"):
        out["present"] = True
        out["demo"] = False
        out["path"] = mute["path"]
        out["muted"] = True
    elif mute:
        out["path"] = mute["path"]
        out["demo"] = True
        out["present"] = False
    sys.stdout.write(json.dumps(out, separators=(",", ":")))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
