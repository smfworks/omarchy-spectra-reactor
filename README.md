# Spectra Theme Reactor

Audio-reactive sci-fi chrome for the [Omarchy](https://omarchy.org) Quattro
bar — a thin neon spectrum strip that pulses with system audio when a real
peak path exists, and a **clearly labeled DEMO** oscillator when it does not.

Plugin id: `smf.spectra-reactor`. From [SMF Works](https://github.com/smfworks);
destined for mikesai6 Omarchy installs when that bundle is used.

Sibling plugins: [Neural Pulse](https://github.com/smfworks/omarchy-neural-pulse),
[Cron Constellation](https://github.com/smfworks/omarchy-cron-constellation),
[Orbit Dock](https://github.com/smfworks/omarchy-orbit-dock),
[Ghost Trace](https://github.com/smfworks/omarchy-ghost-trace).

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
`parec` capture of the default sink monitor.

## Usage

- Left click the strip to open or close the reactor panel
- `D` forces the DEMO oscillator · `F` freezes the current bars
- Escape closes the panel
- Sensitivity slider, DEMO force, and freeze live in the panel

The bar labels its mode so a screenshot is self-describing:

- **LIVE** — real RMS/peak from `PwNodePeakMonitor` on the default sink, or
  from `pw-record` / `parec` / cava when that path is active
- **DEMO** — no audio capture (CI, no PipeWire, mute-only tools, or DEMO
  force). Soft breathing oscillator — **not live music**
- **MUTED** — the default sink is muted by choice
- **ERR** — IPC / probe failed and there is no live snapshot
- **STALE** — last good levels aged out after the monitor or probe stopped

LIVE idle flattens when the sink is truly silent. Breathing happens in DEMO
only. The strip never sits empty and unlabeled.

Track titles appear **only** when first-party `omarchy.media` / MPRIS publishes
one. Spectra never invents a now-playing line.

## Data path

The panel status line names the active path:

| Path | What it is |
|------|-------------|
| `quickshell.peak` | Quickshell `PwNodePeakMonitor` on `Pipewire.defaultAudioSink` — preferred LIVE path, same peak API `omarchy.audio` uses for its input meter |
| `cli.pw-record` | Short `pw-record` f32 capture → RMS/peak |
| `cli.parec` | Short Pulse `parec` capture → RMS/peak |
| `cli.cava` | cava raw bars, if a future hook publishes them |
| `cli.wpctl` / `cli.pactl` | Mute honesty only. Volume is **not** treated as music. Unmuted mute-only stays DEMO |
| `demo` | Pure oscillator, labeled DEMO |

Bars are a peak-driven neon envelope (8–32), not a claimed FFT. Gorgeous DEMO
plus an honest LIVE path is the point.

### PipeWire notes

Omarchy ships PipeWire / WirePlumber. Spectra prefers the in-process Quickshell
monitor so it does not start a second audio client while `omarchy-shell` is
already talking to PipeWire. If that type fails to load, `probe.py` polls
`wpctl` / `pactl` for mute and tries `pw-record` or `parec` for real levels.
`cava` is optional and not assumed to be installed.

## Tests

```sh
node tests/test_spectra_logic.js
```

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

## Remove

```sh
omarchy plugin remove smf.spectra-reactor
```

## License

MIT. Copyright (c) 2026 SMF Works.
