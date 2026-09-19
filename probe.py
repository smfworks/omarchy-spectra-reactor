#!/usr/bin/env python3
"""CLI fallback for Spectra Theme Reactor.

Prefers a short **sink monitor** capture (pw-record / parec) for real RMS/peak.
wpctl / pactl are used for mute honesty only — volume is never treated as music.
The default source (microphone) is never captured.
"""

from __future__ import annotations

import json
import math
import shutil
import struct
import subprocess
import sys
from collections.abc import Callable
from typing import Any


WhichFn = Callable[[str], str | None]
RunFn = Callable[..., Any]


def which(name: str) -> str | None:
    return shutil.which(name)


def parse_wpctl_mute(text: str) -> bool:
    return "MUTED" in str(text or "").upper()


def parse_pactl_mute(text: str) -> bool:
    return "yes" in str(text or "").lower()


def parse_volume_number(text: str) -> float | None:
    """Parse wpctl/pactl volume text. Callers must not treat this as peak."""
    raw = str(text or "")
    for token in raw.replace("[", " ").replace("]", " ").split():
        try:
            value = float(token)
        except ValueError:
            continue
        if 0.0 <= value <= 2.0:
            return value
    return None


def is_sink_monitor(name: str) -> bool:
    n = str(name or "").strip().lower()
    if n == "":
        return False
    # Never treat the default source / mic as a sink monitor.
    # Refuses @DEFAULT_AUDIO_SOURCE@, @DEFAULT_SOURCE@, and input nodes.
    if n in {
        "@default_audio_source@",
        "@default_source@",
        "@default_audio_source",
        "@default_source",
    }:
        return False
    if "input" in n and "monitor" not in n:
        return False
    return ".monitor" in n


def wpctl_mute(which_fn: WhichFn = which, run_fn: RunFn | None = None) -> dict | None:
    exe = which_fn("wpctl")
    if not exe:
        return None
    try:
        if run_fn:
            out = run_fn(
                [exe, "get-volume", "@DEFAULT_AUDIO_SINK@"],
                timeout=0.6,
            )
        else:
            out = subprocess.check_output(
                [exe, "get-volume", "@DEFAULT_AUDIO_SINK@"],
                stderr=subprocess.DEVNULL,
                text=True,
                timeout=0.6,
            )
    except (subprocess.SubprocessError, OSError, TypeError):
        return None
    if out is None:
        return None
    return {"muted": parse_wpctl_mute(str(out)), "path": "cli.wpctl"}


def pactl_mute(which_fn: WhichFn = which, run_fn: RunFn | None = None) -> dict | None:
    exe = which_fn("pactl")
    if not exe:
        return None
    try:
        if run_fn:
            out = run_fn(
                [exe, "get-sink-mute", "@DEFAULT_SINK@"],
                timeout=0.6,
            )
        else:
            out = subprocess.check_output(
                [exe, "get-sink-mute", "@DEFAULT_SINK@"],
                stderr=subprocess.DEVNULL,
                text=True,
                timeout=0.6,
            )
    except (subprocess.SubprocessError, OSError, TypeError):
        return None
    if out is None:
        return None
    return {"muted": parse_pactl_mute(str(out)), "path": "cli.pactl"}


def resolve_sink_monitor(which_fn: WhichFn = which, run_fn: RunFn | None = None) -> str | None:
    """Return the default sink's monitor name. Never the default source."""
    exe = which_fn("pactl")
    if not exe:
        return None
    try:
        if run_fn:
            sink = run_fn([exe, "get-default-sink"], timeout=0.6)
        else:
            sink = subprocess.check_output(
                [exe, "get-default-sink"],
                stderr=subprocess.DEVNULL,
                text=True,
                timeout=0.6,
            )
    except (subprocess.SubprocessError, OSError, TypeError):
        return None
    name = str(sink or "").strip()
    if not name:
        return None
    monitor = name if is_sink_monitor(name) else name + ".monitor"
    if not is_sink_monitor(monitor):
        return None
    return monitor


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


def capture_rms(cmd: list[str], fmt: str, run_fn: RunFn | None = None) -> float | None:
    try:
        if run_fn:
            subprocess_out = run_fn(cmd, timeout=0.22)
            if isinstance(subprocess_out, (bytes, bytearray)):
                return rms_from_pcm(bytes(subprocess_out), fmt)
            return None
        subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=0.22)
        return None
    except subprocess.TimeoutExpired as exc:
        data = exc.output or b""
    except (subprocess.SubprocessError, OSError, TypeError):
        return None
    return rms_from_pcm(data, fmt)


def try_pw_record(
    monitor: str,
    which_fn: WhichFn = which,
    run_fn: RunFn | None = None,
) -> dict | None:
    if not is_sink_monitor(monitor):
        return None
    exe = which_fn("pw-record")
    if not exe:
        return None
    rms = capture_rms(
        [exe, "--rate=8000", "--channels=1", "--format=f32", "--target", monitor, "-"],
        "f32",
        run_fn=run_fn,
    )
    if rms is None:
        return None
    return {"peak": rms, "rms": rms, "path": "cli.pw-record", "present": True}


def try_parec(
    monitor: str,
    which_fn: WhichFn = which,
    run_fn: RunFn | None = None,
) -> dict | None:
    if not is_sink_monitor(monitor):
        return None
    exe = which_fn("parec")
    if not exe:
        return None
    rms = capture_rms(
        [exe, "--rate=8000", "--channels=1", "--format=s16le", "--raw", "-d", monitor],
        "s16",
        run_fn=run_fn,
    )
    if rms is None:
        return None
    return {"peak": rms, "rms": rms, "path": "cli.parec", "present": True}


def capture_tools_present(which_fn: WhichFn = which) -> bool:
    return bool(which_fn("pw-record") or which_fn("parec"))


def empty_payload() -> dict:
    return {
        "present": False,
        "demo": True,
        "muted": False,
        "peak": 0.0,
        "rms": 0.0,
        "path": "demo",
        "error": "",
    }


def build_snapshot(which_fn: WhichFn = which, run_fn: RunFn | None = None) -> dict:
    mute = wpctl_mute(which_fn, run_fn) or pactl_mute(which_fn, run_fn)
    monitor = resolve_sink_monitor(which_fn, run_fn)
    can_capture = capture_tools_present(which_fn)
    levels = None
    error = ""
    if monitor:
        levels = try_pw_record(monitor, which_fn, run_fn) or try_parec(monitor, which_fn, run_fn)
        if not levels and can_capture:
            error = "monitor capture failed"
    elif can_capture:
        error = "no sink monitor"

    out = empty_payload()
    if levels:
        out.update(levels)
        out["demo"] = False
        out["present"] = True
        out["error"] = ""
        if mute:
            out["muted"] = bool(mute.get("muted"))
        if out["muted"]:
            out["peak"] = 0.0
            out["rms"] = 0.0
        # Volume number is intentionally discarded even if helpers parsed it.
        out.pop("volume", None)
    elif mute and mute.get("muted"):
        out["present"] = True
        out["demo"] = False
        out["path"] = mute["path"]
        out["muted"] = True
        out["peak"] = 0.0
        out["rms"] = 0.0
        out["error"] = ""
    elif mute:
        out["path"] = mute["path"]
        out["demo"] = True
        out["present"] = False
        out["peak"] = 0.0
        out["rms"] = 0.0
        out["muted"] = False
        out["error"] = ""
    elif error:
        out["demo"] = False
        out["present"] = False
        out["path"] = "err"
        out["error"] = error
        out["peak"] = 0.0
        out["rms"] = 0.0
    return out


def main() -> int:
    out = build_snapshot()
    sys.stdout.write(json.dumps(out, separators=(",", ":")))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
