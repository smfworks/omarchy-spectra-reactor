# Opposition: do not trust the spectrum strip as "what you hear" yet

Adversarial review of `smfworks/omarchy-spectra-reactor` at `605543a`
(`smf.spectra-reactor` v0.1.0, plugin #1). Evidence is from `SpectraLogic.js`,
`BarWidget.qml`, `Panel.qml`, `PeakProbe.qml`, `probe.py`, `README.md`,
`manifest.json`, and `tests/test_spectra_logic.js`.

Plugin #1 already paints **LIVE / DEMO / MUTED / ERR / STALE** chips and says
volume is not music. That is not enough. A screenshot of the neon strip will
still be believed as a music visualizer. The analysis below is the pre-fix
evidence. Method: assume a user screenshots the bar (and maybe the reactor
panel) and treats dancing bars + a title as “this is what I hear.” Argue
against that.

## Addressed in this PR

The honesty PR (`Honest spectra — OPPOSITION + trust fixes`) changes the trust
contract this review asked for:

- Honesty chips stay on one priority: force-DEMO → ERR → STALE → MUTED → LIVE
  → DEMO. Volume-only and mute-only-unmuted cannot become LIVE.
- `normalizeSample` zeros peak/RMS on any path that is not a real level path.
  `probe.py` never copies `wpctl get-volume` into `peak`.
- DEMO stays labeled, and DEMO bars no longer share LIVE neon (`chipLoud` is
  LIVE only). Status always says **not live music**.
- ERR / STALE stay visible. Leaving a live path without a new live sample is
  STALE, not a pretty oscillator. STALE bars decay instead of shimmering the
  last peak. A failed CLI probe after a live snapshot goes through
  `mergeSample`.
- Track titles are MPRIS `trackTitle` only, and only while the player is
  **Playing**. Placeholders are dropped. Status does not glue a title onto the
  path as if the spectrum were that track.
- `probe.py` records a resolved sink **monitor** only. Default source / mic is
  refused. Tools present but no monitor (or capture failed with no mute
  reading) is ERR, not LIVE.
- Panel path line uses `pathDisplay`: STALE is `last …`, ERR is the error,
  force-DEMO is the oscillator — not a leftover `quickshell.peak`.
- Tests cover the chip matrix, mute vs silent, volume≠music, STALE decay,
  invented titles, path honesty, and probe privilege/failure. README links
  here and states the remaining limits.

Remaining P2 items (in-process peak freeze, no FFT, 32ms timer, unsandboxed
capture, MPRIS≠sink client) are still open. See §8.

---

## 1. Executive opposition

I would not trust this strip as a hearing instrument. Plugin #1 sells
“audio-reactive sci-fi chrome” that “pulses with system audio,” then fills the
bar with a **gorgeous DEMO oscillator** that uses the same neon as LIVE. The
four-letter chip is the only difference; a screenshot without reading it is a
music visualizer. `wpctl get-volume` is in the CLI path — mute-only *today*,
and a one-line mistake away from treating the volume slider as a beat.
`PeakProbe.ready` is “default sink exists,” after which `lastLiveAt` is
refreshed every frame, so the preferred path **cannot go STALE** while a sink
object is present; if that monitor then drops, `mergeSample` prefers a new
DEMO over STALE and the oscillator starts again. STALE, when it does happen,
still runs `peakTargets` on the last peak — leftover music. `detectMedia`
accepts any `trackTitle || title` with no Playing gate and `statusLine`
appends it to LIVE, so a paused MPRIS player captions sink peaks from a
browser. `pw-record` / `parec` are invoked **without a monitor target**, which
on PipeWire/Pulse is the default **source** (often the microphone), then
labeled LIVE as if it were the speakers. Probe failures after a good sample
are ignored (`onExited` only errors when `cliSample` is empty). The panel
prints `Path ·` from `snapshot.pathLabel` even when the chip is DEMO, STALE,
or ERR. Until the face, the path, and the probe agree on “levels from the
sink you hear,” this is a mood light.

---

## 2. P0 — trust breakers (must-fix)

### P0.1 — DEMO sold as music

`README.md` lead (plugin #1):

> a thin neon spectrum strip that pulses with system audio when a real peak
> path exists, and a **clearly labeled DEMO** oscillator when it does not.

The label exists. The *sale* is the motion.

`BarWidget.qml` paints DEMO with the same accent as LIVE:

```qml
readonly property bool chipLoud: reactorLabel === "LIVE" || reactorLabel === "DEMO"
readonly property color barFill: chipLoud ? neon : ink
```

`SpectraLogic.js` `nextBars` in `demo` mode calls `demoTargets`: a three-sine
breath plus a spark when `sin(t * 11.0 + i * 1.7) > 0.93`. Tests *require*
that DEMO breathes and moves (`test_spectra_logic.js`: “DEMO breathes”,
“DEMO oscillator moves”). LIVE silence is the one that goes flat. So the
pretty screenshot — neon bars moving — is the **no-audio** path: CI, no
PipeWire, mute-only tools, or `forceDemo`.

Concrete inputs on `605543a`:

| Input | Chip | Face |
|-------|------|------|
| `demoSnapshot()` / CI `probe.py` | DEMO | Neon oscillator, same fill as LIVE |
| `{ present: true, path: "cli.wpctl", muted: false, peak: 0.9 }` | DEMO (volume≠music) | Same oscillator — volume 90% looks like a mix |
| `{ forceDemo: true }` on top of a real peak | DEMO | Oscillator, not the peak |
| LIVE `peak: 0` (sink silent, not muted) | LIVE | **Flat**. The quiet-looking strip is the honest one. |

A user who learns “moving neon = music” has the mapping backwards.

`aboutText()` is honest (“never a fake live mix”). The bar face is not. Tooltip
and panel status say “not live music”; the strip does not.

### P0.2 — Volume is one parse away from being sold as music

`probe.py` `wpctl_mute()` runs `wpctl get-volume @DEFAULT_AUDIO_SINK@` and
keeps only `"MUTED" in out.upper()`. The number is sitting in stdout:

```
Volume: 0.80
Volume: 0.40 [MUTED]
```

`normalizeSample` will accept `peak: 0.9` on *any* path, then decide mode.
Mute-only **unmuted** is forced to DEMO (`hasLevelPath("cli.wpctl") === false`),
and tests cover that. Mute-only **muted** is MUTED. Those two are correct.

What is not locked:

- Peak is **not zeroed** on mute-only paths. A future caller (or a hand-edited
  snapshot) can keep `peak: 0.9` on `cli.wpctl`. `nextBars` for DEMO ignores
  it (oscillator), but STALE/LIVE helpers and glow still see 0.9 if mode
  ever slips.
- `path === "quickshell.peak"` plus a volume-shaped number is LIVE. There is
  no check that `peak` came from `PwNodePeakMonitor` rather than a slider.
- README says volume is not music. `probe.py` still names the function after
  volume and is the only CLI mute source. One `out["peak"] = volume` and the
  strip is a volume meter labeled LIVE.

`PeakProbe.qml` `ready` is `sink !== null`. The default sink’s **volume** and
its **peak** are different PipeWire properties. The widget never reads
`sink.audio.volume` today. It also never proves `monitor.peak` is a fresh
audio peak rather than a held last value. LIVE means “we have an object,”
not “this number is music.”

### P0.3 — Mute vs silent are different, and the face conflates them with DEMO

Three “quiet” states:

| State | Meaning | `605543a` chip | Bars |
|-------|---------|----------------|------|
| MUTED | User muted the default sink | MUTED if `present && muted` | Decay to flat |
| Silent | Unmuted sink, `peak < SILENCE` (0.018) | **LIVE** | Flat |
| No level path | No monitor / no capture | **DEMO** | Oscillator |

That table is the right contract. The lies are at the edges.

1. **Silent LIVE reads as “music is live.”** `statusLine` for LIVE is
   `LIVE · Quickshell PwNodePeakMonitor · default sink` with no `silent`
   token. The chip is LIVE. A screenshot of a quiet desktop says the reactor
   is hearing something.
2. **MUTED + leftover peak.** `PeakProbe` still exposes `monitor.peak` while
   muted. `currentSample` passes that peak through. `barMode` prefers MUTED
   and `nextBars` flattens — good — but `snapshot.peak` remains the pre-mute
   value. Panel has no “levels discarded because muted” line. Unmute for one
   frame and the last peak is music again.
3. **Mute-only unmuted is DEMO, not silent LIVE.** Correct (volume≠music).
   Easy to read as “the visualizer is working” because of P0.1.
4. **`barMode` priority.** `stale` wins over `muted`. A muted sink whose
   last live sample aged out is **STALE** (and on `605543a`, STALE still
   paints the last peak — P0.4). The user muted; the strip shows leftover
   music with a STALE chip.

### P0.4 — STALE peaks still look like a mix

`nextBars` (`SpectraLogic.js`):

```javascript
if (mode === "demo") {
  target = demoTargets(t, count, sens)
} else if (mode === "muted" || mode === "err") {
  target = emptyBars(count)
} else {
  var peak = clamp(number(opts.peak) * sens, 0, 1)
  // LIVE *and* STALE
  target = peakTargets(peak, count, t)
}
```

STALE is the leftover-music branch. `peakTargets` applies per-bar shimmer
(`sin(phase)`). A 1.6s-old peak keeps dancing.

Worse: the preferred path almost never reaches STALE.

`BarWidget.qml` `tickReactor`:

```qml
if (!root.forceDemo && (root.peakReady || (cliSample && cliSample.present === true && Spectra.hasLevelPath(root.rawPath))))
  root.lastLiveAt = now
```

`peakReady` is `Loader.Ready && item.ready`, and `PeakProbe.ready` is “default
sink exists.” Every 32ms frame refreshes `lastLiveAt`. `applyAge` (`STALE_MS =
1600`) cannot fire while a sink object is alive, including a **frozen**
`PwNodePeakMonitor` holding the last peak.

When the sink *does* go away, `rawPath` becomes `demo` (or a CLI path) and
`currentSample.present` is false. `mergeSample`:

```javascript
if (next && next.present === true)
  return next
if (next && next.demo === true && !next.error)
  return next   // live → pretty DEMO, STALE skipped
if (live)
  return markStale(...)
```

So the documented STALE path (monitor stopped) becomes a DEMO oscillator —
P0.1 again — unless the incoming sample is an error.

CLI failures after success are swallowed:

```qml
onExited: function(code) {
  if (code !== 0 && !root.cliSample)
    root.applyProbe("")
}
```

If `cliSample` is a previous live RMS, a crashed `python3` keeps that sample.
`tickReactor` still sees `cliSample.present === true` and refreshes
`lastLiveAt`. LIVE forever, last peak.

### P0.5 — Track title invention (and false attribution)

`detectMedia`:

```javascript
var title = String(player.trackTitle || player.title || "").trim()
var artist = String(player.trackArtist || player.artist || "").trim()
```

No `playbackStatus` / `isPlaying` gate. Any object with a `title` field
becomes a now-playing line. First-party `omarchy.media` players also carry
window-ish `title` when `trackTitle` is empty. Tests only forbid the strings
`Now Playing`, `Untitled track`, and `Unknown Artist` in **source text** —
they do not reject those values at runtime.

`statusLine` for LIVE:

```javascript
var media = mediaLine(state)
if (media !== "")
  return "LIVE · " + path + " · " + media
```

That is a caption that says the spectrum **is** that track. The peak is
`Pipewire.defaultAudioSink` (or a CLI monitor). MPRIS can be a paused
Spotify while the sink is a browser, a notification, or this plugin’s own
`pw-record` client. The panel then repeats the lie: status line +
`Media · {title}` + `Path · Quickshell PwNodePeakMonitor`.

Plugin #1 README: “Spectra never invents a now-playing line.” True only if
“invent” means “hardcode Untitled.” Publishing a paused player’s leftover
title next to sink peaks is still an invented attribution.

### P0.6 — `probe.py` privilege and failure modes

Plugins run **unsandboxed** inside `omarchy-shell` (README). This probe is a
process factory, not a meter.

**A. Capture target is the mic unless proven otherwise**

```python
[exe, "--rate=8000", "--channels=1", "--format=f32", "-"]   # pw-record
[exe, "--rate=8000", "--channels=1", "--format=s16le", "--raw"]  # parec
```

No `--target`, no `-d`. `pw-record` / `parec` default to the default
**source**. On a laptop that is the microphone (or a noise-suppressed
variant), not `alsa_output.…monitor`. A successful capture is emitted as
`path: cli.pw-record`, `present: True`, and the bar says **LIVE** — “what
you hear” is what the mic hears, including the room and, if the sink is
loud enough, speakers bleeding into the mic. That is not `omarchy.audio`’s
sink peak.

**B. Timeout-as-success**

`capture_rms` treats `TimeoutExpired` as the happy path (`exc.output`) and
a clean exit as failure (`return None`). A tool that errors quickly looks
like “no levels”; a tool that hangs with empty stdout looks like silence
LIVE if `rms_from_pcm` ever gets 32 zero samples (`visual = 0`,
`present: True`).

**C. Failures become DEMO, or yesterday’s LIVE**

| Input | `main()` / QML | Face |
|-------|----------------|------|
| No `wpctl`/`pactl`/`pw-record`/`parec` | `path: demo` | DEMO oscillator (CI — acceptable) |
| `pw-record` installed, no monitor, capture of default source **succeeds** | LIVE `cli.pw-record` | Mic sold as speakers (A) |
| `pw-record` installed, capture fails, no mute reading | `path: demo`, `error: ""` | DEMO. Tools failed; chip says demo, not ERR |
| `python3` missing / exit ≠ 0, no prior sample | `applyProbe("")` → ERR | ERR (good) |
| `python3` exit ≠ 0, prior live `cliSample` | `onExited` no-op | **LIVE** last RMS, `lastLiveAt` refreshed |
| `wpctl get-volume` fails, `pactl` fails, no capture | DEMO | Broken PipeWire looks healthy |

`main()` always `return 0`. QML cannot distinguish “honest demo” from
“every helper crashed.”

**D. Privilege**

Every `POLL_MS` (200ms) while `!peakReady`, the shell spawns `python3 probe.py`,
which may spawn `pw-record` / `parec` for 220ms of capture. That is a new
PipeWire client on the default source, with the user’s session credentials,
visible in `ps`, with no extra consent beyond enabling the plugin. There is
no drop of privileges, no allow-list of monitor nodes, no stop when the
panel is closed. `wpctl` / `pactl` are read-only and fine. The capture
path is not.

### P0.7 — Panel status lying about the path

Panel header (`Panel.qml`):

```qml
readonly property string pathLine: snapshot.pathLabel || Spectra.pathLabel(snapshot.path)
text: root.statusLine
text: "Path · " + root.pathLine
```

`normalizeSample` trusts a caller-supplied `pathLabel` even when it disagrees
with `path`. `currentSample` does not send `pathLabel` today (so JS fills it
from `path`) — another one-line drift.

Concrete mismatches on `605543a`:

| State | Chip / `statusLine` | `Path ·` line |
|-------|---------------------|---------------|
| STALE after `quickshell.peak` | `STALE · last Quickshell PwNodePeakMonitor · default sink` | `Path · Quickshell PwNodePeakMonitor · default sink` (reads current) |
| `forceDemo` after live (once merge returns demo) | `DEMO forced · oscillator · not live music` | DEMO oscillator (OK if merge wins; see P0.4) |
| LIVE + MPRIS title | `LIVE · {path} · Real Track · Artist` | Path is honest; status attributes the track to the path |
| mute-only unmuted | `DEMO · wpctl mute only · no peak · not live music` | Same (OK) |
| `error` + `present: true` + level path | **LIVE** (`barMode` never reaches `err` when `present`) | Live path, error hidden |
| Incoming `pathLabel: "Quickshell…"` with `path: "demo"` | DEMO · Quickshell… · not live music | Claims the Quickshell monitor in demo |

The bar tooltip is `reactorStatus` (`statusLine`). The panel duplicates it
and then adds a second path that is not mode-aware. A screenshot of the
panel can show DEMO on the chip and a live path underneath.

---

## 3. P1 — high correctness gaps

### Honesty chips are not a closed matrix

`barMode` order on `605543a`: `forceDemo` → `stale` → `error&&!present` →
`muted&&present` → `present&&level&&!demo` → `error` → `demo`.

Missing / wrong:

- `error && present && level` → **LIVE** (error hidden).
- Volume-only unmuted → DEMO (good) but still neon (P0.1).
- `muted && stale` → STALE, leftover peak (P0.3 / P0.4).
- Chip is the only LIVE-vs-DEMO distinction, and DEMO is in `chipLoud`.

Contract this review wants: force-DEMO, then ERR, then STALE, then MUTED,
then LIVE, then DEMO. LIVE only for `hasLevelPath`. MUTED never shows a
peak. STALE never shimmers. DEMO never shares LIVE neon.

### LIVE idle vs DEMO breath

README: “LIVE idle flattens when the sink is truly silent. Breathing happens
in DEMO only.” True in `nextBars`. The missing token is **silent** on the
LIVE status line so a flat LIVE strip is not read as “we hear a mix.”

### CLI poll vs Quickshell claim

`Timer { running: !root.peakReady }` — once `PeakProbe` loads a sink, CLI
never runs. If `PwNodePeakMonitor` is a stub (peak stuck at 0 or last
value), there is no RMS check, no STALE, no ERR. LIVE + silent or LIVE +
held peak. High P1: do not call that “what you hear” in the panel; say
`quickshell.peak` and `silent` when under `SILENCE`.

### QML / Omarchy contract (mostly holds)

Holds vs the official bar-widget shape and sibling plugins:

- `schemaVersion: 1`, id `smf.spectra-reactor` (not `omarchy.*`)
- `kinds: ["bar-widget"]`, `entryPoints.barWidget: "BarWidget.qml"`
- Nested panel via `Loader`, `injectPanel`, `opened` / `open` / `close` /
  `toggle` / `closeForPopoutSwitch`
- `moduleName` matches; `manageIpc: false`; `qs.Ui` / `qs.Commons`
- No symlinks in the shipped files (tests assert this)

Gaps:

- README tells people to run `omarchy plugin validate .` but not `qmllint`.
- No `preview.png`. The chip *is* the preview; it must stay correct.
- `python3` is a hard dependency for the CLI fallback and is not listed as
  a requirement. Without it, `onExited` is ERR only if no prior sample
  (P0.4 / P0.6).
- `IpcHandler` target is the plugin id; first instance wins (same as
  siblings). Fine.
- `PeakProbe.qml` is isolated so a missing `PwNodePeakMonitor` type does not
  take down the bar — good. `ready` still over-claims (P0.2).

### README / marketing vs face

Install block matches siblings. Honesty section already names LIVE / DEMO /
MUTED / ERR / STALE and “volume is not treated as music.” It does **not**:

- Link an opposition review
- Say DEMO uses the same neon as LIVE
- Say `pw-record` may be the microphone
- Say MPRIS is not the sink
- Say STALE still paints last peaks
- List `python3`
- Say remaining P2 limits after chips exist

A README that documents chips while the face sells DEMO as music is itself
a trust failure.

---

## 4. P2 — later (not this PR)

- `PwNodePeakMonitor` has no generation counter. A held last peak on a live
  node cannot be distinguished from a sustained note.
- Bars are a peak-driven envelope (8–32), not an FFT. Do not caption Hz.
- `FRAME_MS = 32` Canvas-equivalent timers run forever, panel closed or not.
- Capture privilege: even a monitor-targeted `pw-record` is a 5 Hz audio
  client inside the unsandboxed shell. Prefer Quickshell; back off when
  DEMO/ERR.
- Cannot prove the MPRIS player is a client of `defaultAudioSink`.
- No `qmltestrunner` / `qmllint` in CI. Node + pytest are face-logic only.
- No `inotify` / PipeWire subscribe; CLI is poll.
- `cava` is documented and never invoked.

---

## 5. Quick wins (the P0 / high-P1 list)

1. **Chips are a closed function.** force-DEMO / ERR / STALE / MUTED / LIVE /
   DEMO. LIVE iff `hasLevelPath`. Volume-only cannot be LIVE.
2. **Zero peak on non-level paths** in `normalizeSample`. Never parse
   `get-volume` into `peak` in `probe.py`.
3. **DEMO labeled and not sold as LIVE.** Chip stays DEMO. `chipLoud` is
   LIVE only. Status: `not live music`.
4. **ERR / STALE visible.** `mergeSample`: live → demo/error is STALE unless
   `forceDemo`. `onExited` always `applyProbe("")` on failure. Do not refresh
   `lastLiveAt` from a stale `cliSample`.
5. **STALE / MUTED / ERR flatten.** No `peakTargets` shimmer on leftover
   levels.
6. **Silent LIVE says silent.** MUTED is mute. DEMO is no path.
7. **Titles:** `trackTitle` + Playing only. Drop placeholders. Do not append
   media to `statusLine`.
8. **`probe.py`:** resolve `{default-sink}.monitor` or do not capture. Never
   default source. Tools-but-no-monitor (and no mute reading) → ERR.
9. **`pathDisplay(state)`** for the panel. STALE = `last …`. ERR = error.
   force-DEMO = oscillator.
10. **Tests + README** for every row above. Link this file.

---

## 6. This PR’s ship contract

**Title:** `Honest spectra — OPPOSITION + trust fixes`.

**Do not** restyle the chrome. Change the trust contract:

1. Screenshot of the bar names its mode, and DEMO is not LIVE neon.
2. Volume is never music. Mute-only unmuted stays DEMO with peak 0.
3. MUTED / silent LIVE / DEMO are three different faces.
4. STALE is visible and decays. Failed probe after live is STALE or ERR.
5. No invented title. No title-as-path.
6. No mic-as-speakers. Monitor or no capture.
7. Panel path cannot contradict the chip.

That single PR makes a screenshot of the strip *disprovable*. FFT and
PipeWire subscribe can follow.

---

## 7. What already held on `605543a`

- Chips exist on the bar face (`reactorLabel` centered on the strip). Tooltip
  is not the only label — that was Neural Pulse’s P0, and Spectra did not
  repeat it.
- `hasLevelPath` already excludes `cli.wpctl` / `cli.pactl`. Tests assert
  “volume is not music” for unmuted mute-only.
- LIVE silence flattens; DEMO breathes. The mapping is implemented — it is
  the *sale* of DEMO neon that is wrong.
- `detectMedia(null)` / empty title already return `""`. No hardcoded
  “Now Playing” string in `SpectraLogic.js`.
- `PeakProbe.qml` is isolated so a missing type does not crash the bar.
- Quattro shape is correct: id namespace, kinds, entry point, nested panel,
  inject, IPC, no `omarchy.*` id, no symlinks, MIT.
- `omarchy.media` is the only title source attempted (first-party service
  lookup). The bug is gating and attribution, not a fabricated catalog.

None of that makes the strip a hearing instrument. It means the honesty PR
can stay small: closed chips, volume locked out, DEMO/ERR/STALE unmistakable,
monitor-only probe, path line that matches the chip, tests, README.
