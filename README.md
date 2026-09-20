# Spectra Theme Reactor

Audio-reactive sci-fi chrome for the [Omarchy](https://omarchy.org) Quattro
bar — a thin neon spectrum strip that pulses with **sink peaks** when a real
peak path exists, and a **clearly labeled DEMO** oscillator when it does not.
DEMO is not live music. Volume is not music.

Plugin id: `smf.spectra-reactor`. From [SMF Works](https://github.com/smfworks);
destined for mikesai6 Omarchy installs when that bundle is used.

Adversarial review of whether the strip is “what you hear”:
[docs/OPPOSITION.md](docs/OPPOSITION.md). Plugin #1 chips were not enough;
this tree locks the P0 / high-P1 honesty contract from that review.

Sibling plugins: [Neural Pulse](https://github.com/smfworks/omarchy-neural-pulse),
[Cron Constellation](https://github.com/smfworks/omarchy-cron-constellation),
[Orbit Dock](https://github.com/smfworks/omarchy-orbit-dock),
[Ghost Trace](https://github.com/smfworks/omarchy-ghost-trace).

## Demo

Spectra Theme Reactor on Omarchy (mikesai6) — audio-reactive neon strip + reactor panel.

https://github.com/smfworks/omarchy-spectra-reactor/releases/download/demo/demo.mp4

## Requirements

- Omarchy Quattro / Quickshell (this is a `bar-widget` plugin)
- **python3** — CLI fallback (`probe.py`) when Quickshell’s peak monitor is
  missing. Without it the bar shows **ERR** or **STALE**, not a fake LIVE mix.
- Optional: `pw-record` or `parec`, plus `pactl` so the probe can resolve the
  default sink **monitor**. The microphone / default source is never captured.

## Install

```sh
omarchy plugin add https://github.com/smfworks/omarchy-spectra-reactor.git --enable
```

Place it on the bar (default section is already `right`):

```sh
omarchy bar move smf.spectra-reactor --section right
```

Plugins run **unsandboxed** inside the long-lived `omarchy-shell` process, with
your user permissions. Review this repo before enabling. The optional
`PeakProbe.qml` path uses Quickshell’s PipeWire peak monitor (same family as
first-party `omarchy.audio`); the CLI fallback may start a short `pw-record` /
`parec` capture of the default **sink monitor only**.

## Usage

- Left click the strip to open or close the reactor panel
- `D` forces the DEMO oscillator · `F` freezes the current bars
- Escape closes the panel
- Sensitivity slider, DEMO force, and freeze live in the panel

The bar labels its mode so a screenshot is self-describing:

- **LIVE** — real RMS/peak from `PwNodePeakMonitor` on the default sink, or
  from `pw-record` / `parec` / cava when that **monitor** path is active.
  Unmuted quiet sink is still LIVE, status says **silent**. LIVE neon is the
  only “loud” chrome; DEMO does not share it.
- **DEMO** — no audio capture (CI, no PipeWire, mute-only tools, or DEMO
  force). Soft breathing oscillator — **not live music**
- **MUTED** — the default sink is muted by choice. Leftover peaks are discarded.
- **ERR** — IPC / probe failed and there is no live snapshot (including
  capture tools with no sink monitor)
- **STALE** — last good levels aged out after the monitor or probe stopped.
  Bars decay; they do not keep shimmering the last peak.

LIVE idle flattens when the sink is truly silent. Breathing happens in DEMO
only. The strip never sits empty and unlabeled.

Track titles appear **only** when first-party `omarchy.media` / MPRIS publishes
a `trackTitle` and the player is **Playing**. Spectra never invents a
now-playing line, never uses window `title`, and never treats that line as the
spectrum source. The panel labels it `MPRIS (not the spectrum)`.

## Data path

The panel status line names the active path (`pathDisplay`). STALE is `last …`.
ERR is the error. Force-DEMO is the oscillator, not a leftover peak path.

| Path | What it is |
|------|-------------|
| `quickshell.peak` | Quickshell `PwNodePeakMonitor` on `Pipewire.defaultAudioSink` — preferred LIVE path, same peak API `omarchy.audio` uses for its input meter. Sink-present is a path, not proof of music. |
| `cli.pw-record` | Short `pw-record` f32 capture of the resolved sink **monitor** → RMS/peak |
| `cli.parec` | Short Pulse `parec` capture of that monitor → RMS/peak |
| `cli.cava` | cava raw bars, if a future hook publishes them |
| `cli.wpctl` / `cli.pactl` | Mute honesty only. Volume is **not** treated as music. Unmuted mute-only stays DEMO with peak 0 |
| `demo` | Pure oscillator, labeled DEMO |
| `err` | Probe/capture failed |

Bars are a peak-driven neon envelope (8–32), not a claimed FFT. Gorgeous DEMO
plus an honest LIVE path is the point — DEMO must stay labeled.

### PipeWire notes

Omarchy ships PipeWire / WirePlumber. Spectra prefers the in-process Quickshell
monitor so it does not start a second audio client while `omarchy-shell` is
already talking to PipeWire. If that type fails to load, `probe.py` polls
`wpctl` / `pactl` for mute and tries `pw-record` or `parec` only after
`pactl get-default-sink` yields a `.monitor` name. No monitor → no capture
(ERR if capture tools exist and mute is unknown). `cava` is optional and not
assumed to be installed.

## Tests

```sh
node tests/test_spectra_logic.js
python3 -m pytest tests -q
```

`pytest` is a test-only dependency (`pip install pytest`).

## Contract

- `schemaVersion: 1`, id `smf.spectra-reactor` (not `omarchy.*`)
- `kinds: ["bar-widget"]`, `entryPoints.barWidget: "BarWidget.qml"`
- Nested details panel loaded from `BarWidget.qml` via `Loader`
- `moduleName` matches the plugin id; `injectPanel`, `open`, `close`,
  `toggle`, and `closeForPopoutSwitch` are forwarded to the panel
- Imports `qs.Ui` / `qs.Commons`; no symlinks

```sh
omarchy plugin validate .
```

## Remaining limits

See [docs/OPPOSITION.md](docs/OPPOSITION.md) §4. A LIVE chip means a peak
*path*, not “this is the mix in your ears.” `PwNodePeakMonitor` can hold a last
value. MPRIS is not proven to be a client of the default sink. CLI capture,
when used, is still an unsandboxed 5 Hz monitor client.

## Remove

```sh
omarchy plugin remove smf.spectra-reactor
```

## License

MIT. Copyright (c) 2026 SMF Works.
