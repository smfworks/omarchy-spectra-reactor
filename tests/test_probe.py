import struct
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import probe  # noqa: E402


def tools(*names):
    present = set(names)

    def which_fn(name):
        return f"/usr/bin/{name}" if name in present else None

    return which_fn


def test_empty_environment_is_demo():
    snap = probe.build_snapshot(which_fn=lambda _name: None)
    assert snap["present"] is False
    assert snap["demo"] is True
    assert snap["path"] == "demo"
    assert snap["error"] == ""
    assert snap["peak"] == 0.0


def test_wpctl_volume_number_is_not_peak():
    volume_text = "Volume: 0.80\n"
    assert probe.parse_volume_number(volume_text) == pytest.approx(0.80)
    assert probe.parse_wpctl_mute(volume_text) is False

    def run_fn(cmd, timeout=0):
        if cmd[1] == "get-volume":
            return volume_text
        raise AssertionError("unexpected " + " ".join(cmd))

    snap = probe.build_snapshot(which_fn=tools("wpctl"), run_fn=run_fn)
    assert snap["path"] == "cli.wpctl"
    assert snap["demo"] is True
    assert snap["present"] is False
    assert snap["peak"] == 0.0
    assert snap["muted"] is False
    assert "volume" not in snap


def test_wpctl_muted_is_muted_not_live():
    def run_fn(cmd, timeout=0):
        if cmd[1] == "get-volume":
            return "Volume: 0.40 [MUTED]\n"
        raise AssertionError("unexpected " + " ".join(cmd))

    snap = probe.build_snapshot(which_fn=tools("wpctl"), run_fn=run_fn)
    assert snap["muted"] is True
    assert snap["present"] is True
    assert snap["demo"] is False
    assert snap["path"] == "cli.wpctl"
    assert snap["peak"] == 0.0


def test_pw_record_without_monitor_is_err_and_does_not_capture():
    calls = []

    def run_fn(cmd, timeout=0):
        calls.append(cmd)
        raise AssertionError("must not spawn capture without a monitor")

    snap = probe.build_snapshot(which_fn=tools("pw-record"), run_fn=run_fn)
    assert snap["path"] == "err"
    assert snap["error"] == "no sink monitor"
    assert snap["present"] is False
    assert snap["demo"] is False
    assert snap["peak"] == 0.0
    assert calls == []


def test_refuses_default_source_as_monitor():
    assert probe.is_sink_monitor("@DEFAULT_AUDIO_SOURCE@") is False
    assert probe.is_sink_monitor("alsa_input.usb.analog-stereo") is False
    assert probe.is_sink_monitor("alsa_output.pci.analog-stereo.monitor") is True
    assert probe.try_pw_record("@DEFAULT_AUDIO_SOURCE@", which_fn=tools("pw-record")) is None
    assert probe.try_parec("default", which_fn=tools("parec")) is None


def test_monitor_capture_is_live_and_targets_monitor():
    pcm = struct.pack("<" + "f" * 64, *([0.25] * 64))
    calls = []

    def run_fn(cmd, timeout=0):
        calls.append(cmd)
        if cmd[1] == "get-sink-mute":
            return "Mute: no\n"
        if cmd[1] == "get-default-sink":
            return "alsa_output.pci.analog-stereo\n"
        if cmd[0].endswith("pw-record"):
            raise __import__("subprocess").TimeoutExpired(cmd, 0.22, output=pcm)
        raise AssertionError("unexpected " + " ".join(cmd))

    snap = probe.build_snapshot(which_fn=tools("pactl", "pw-record"), run_fn=run_fn)
    assert snap["present"] is True
    assert snap["demo"] is False
    assert snap["path"] == "cli.pw-record"
    assert snap["peak"] > 0
    assert any("--target" in cmd and cmd[cmd.index("--target") + 1].endswith(".monitor") for cmd in calls)
    assert all("@DEFAULT_AUDIO_SOURCE@" not in cmd for cmd in calls)


def test_muted_monitor_capture_zeros_peak():
    pcm = struct.pack("<" + "f" * 64, *([0.4] * 64))

    def run_fn(cmd, timeout=0):
        if cmd[1] == "get-volume":
            return "Volume: 0.90 [MUTED]\n"
        if cmd[1] == "get-default-sink":
            return "alsa_output.pci.analog-stereo\n"
        if cmd[0].endswith("pw-record"):
            raise __import__("subprocess").TimeoutExpired(cmd, 0.22, output=pcm)
        raise AssertionError("unexpected " + " ".join(cmd))

    snap = probe.build_snapshot(which_fn=tools("wpctl", "pactl", "pw-record"), run_fn=run_fn)
    assert snap["muted"] is True
    assert snap["present"] is True
    assert snap["peak"] == 0.0
    assert snap["path"] == "cli.pw-record"


def test_monitor_resolved_but_capture_failed_is_err_without_mute():
    def run_fn(cmd, timeout=0):
        if cmd[1] == "get-sink-mute":
            raise OSError("mute unread")
        if cmd[1] == "get-default-sink":
            return "alsa_output.pci.analog-stereo\n"
        raise OSError("capture failed")

    snap = probe.build_snapshot(which_fn=tools("pactl", "pw-record"), run_fn=run_fn)
    assert snap["path"] == "err"
    assert snap["error"] == "monitor capture failed"
    assert snap["demo"] is False
    assert snap["present"] is False


def test_unmute_mute_only_stays_demo_when_capture_fails():
    def run_fn(cmd, timeout=0):
        if cmd[1] == "get-volume":
            return "Volume: 0.55\n"
        if cmd[1] == "get-default-sink":
            return "alsa_output.pci.analog-stereo\n"
        raise OSError("capture failed")

    snap = probe.build_snapshot(which_fn=tools("wpctl", "pactl", "pw-record"), run_fn=run_fn)
    assert snap["path"] == "cli.wpctl"
    assert snap["demo"] is True
    assert snap["present"] is False
    assert snap["peak"] == 0.0
