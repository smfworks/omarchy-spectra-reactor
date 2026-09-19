.pragma library

// Spectra Theme Reactor — honesty + envelope helpers.
// Bars are peak-driven (or a labeled DEMO oscillator), never an invented FFT
// and never a fabricated now-playing title. Volume is never treated as music.

var BAR_MIN = 8
var BAR_MAX = 32
var BAR_COUNT = 16
var FRAME_MS = 32
var POLL_MS = 200
var STALE_MS = 1600
var SILENCE = 0.018
var DEFAULT_SENSITIVITY = 1.15

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value))
}

function number(value) {
  var n = Number(value)
  return isFinite(n) ? n : 0
}

function clampBarCount(n) {
  return Math.round(clamp(number(n) || BAR_COUNT, BAR_MIN, BAR_MAX))
}

function clampSensitivity(s) {
  var n = number(s)
  if (!isFinite(Number(s)) && (s === undefined || s === null || s === ""))
    n = DEFAULT_SENSITIVITY
  return clamp(n, 0.25, 3)
}

function emptyBars(count) {
  var n = clampBarCount(count)
  var bars = []
  var i
  for (i = 0; i < n; i++)
    bars.push(0)
  return bars
}

function copyBars(bars, count) {
  var n = clampBarCount(count || (bars && bars.length) || BAR_COUNT)
  var next = []
  var i
  for (i = 0; i < n; i++)
    next.push(bars && i < bars.length ? clamp(number(bars[i]), 0, 1) : 0)
  return next
}

function pathLabel(path) {
  var key = String(path || "")
  if (key === "quickshell.peak")
    return "Quickshell PwNodePeakMonitor · default sink"
  if (key === "cli.pw-record")
    return "pw-record RMS · sink monitor"
  if (key === "cli.parec")
    return "parec RMS · sink monitor"
  if (key === "cli.cava")
    return "cava raw bars"
  if (key === "cli.wpctl")
    return "wpctl mute only · no peak"
  if (key === "cli.pactl")
    return "pactl mute only · no peak"
  if (key === "err")
    return "IPC / probe failed"
  return "DEMO oscillator"
}

function hasLevelPath(path) {
  var key = String(path || "")
  return key === "quickshell.peak"
    || key === "cli.pw-record"
    || key === "cli.parec"
    || key === "cli.cava"
}

function isMuteOnlyPath(path) {
  var key = String(path || "")
  return key === "cli.wpctl" || key === "cli.pactl"
}

function isSilentPeak(peak) {
  return clamp(number(peak), 0, 1) < SILENCE
}

function isSinkMonitorName(name) {
  var n = String(name || "").trim().toLowerCase()
  if (n === "")
    return false
  if (n === "@default_audio_source@" || n === "@default_source@" || n === "@default_audio_source")
    return false
  if (n.indexOf("input") !== -1 && n.indexOf("monitor") === -1)
    return false
  return n.indexOf(".monitor") !== -1 || n.slice(-8) === ".monitor"
}

function emptyState() {
  return {
    present: false,
    demo: true,
    muted: false,
    error: "",
    stale: false,
    forceDemo: false,
    frozen: false,
    peak: 0,
    rms: 0,
    path: "demo",
    pathLabel: pathLabel("demo"),
    mediaTitle: "",
    mediaArtist: "",
    updatedAt: 0,
    barCount: BAR_COUNT,
    sensitivity: DEFAULT_SENSITIVITY
  }
}

function demoSnapshot() {
  return emptyState()
}

function errorSnapshot(message, path) {
  var snap = emptyState()
  snap.demo = false
  snap.error = message || "probe failed"
  snap.path = path || "err"
  snap.pathLabel = pathLabel(snap.path)
  return snap
}

function inventedMediaToken(value) {
  var t = String(value || "").trim().toLowerCase()
  if (t === "")
    return true
  return t === "unknown"
    || t === "unknown artist"
    || t === "untitled"
    || t === "untitled track"
    || t === "now playing"
    || t === "no title"
    || t === "not playing"
}

function sanitizeMediaField(value) {
  var text = String(value || "").trim()
  if (inventedMediaToken(text))
    return ""
  return text
}

function isMediaPlaying(player) {
  if (!player || typeof player !== "object")
    return false
  if (player.isPlaying === true || player.playing === true)
    return true
  var status = String(player.playbackStatus || player.status || player.playState || "").trim().toLowerCase()
  return status === "playing" || status === "play"
}

function detectMedia(player) {
  if (!player || typeof player !== "object")
    return { title: "", artist: "", playing: false }
  if (!isMediaPlaying(player))
    return { title: "", artist: "", playing: false }
  var title = sanitizeMediaField(player.trackTitle)
  var artist = sanitizeMediaField(player.trackArtist)
  if (title === "")
    return { title: "", artist: "", playing: true }
  return { title: title, artist: artist, playing: true }
}

function mediaLine(state) {
  if (!state)
    return ""
  var title = sanitizeMediaField(state.mediaTitle)
  if (title === "")
    return ""
  var artist = sanitizeMediaField(state.mediaArtist)
  return artist !== "" ? title + " · " + artist : title
}

function normalizeSample(raw) {
  var snap = emptyState()
  if (!raw || typeof raw !== "object")
    return errorSnapshot("invalid snapshot")
  snap.error = raw.error ? String(raw.error) : ""
  snap.path = raw.path ? String(raw.path) : (raw.present === true ? "quickshell.peak" : "demo")
  snap.pathLabel = pathLabel(snap.path)
  snap.muted = raw.muted === true
  snap.forceDemo = raw.forceDemo === true
  snap.frozen = raw.frozen === true
  snap.stale = raw.stale === true
  snap.peak = hasLevelPath(snap.path) ? clamp(number(raw.peak), 0, 1) : 0
  snap.rms = hasLevelPath(snap.path)
    ? clamp(number(raw.rms != null ? raw.rms : raw.peak), 0, 1)
    : 0
  snap.updatedAt = number(raw.updatedAt)
  snap.mediaTitle = sanitizeMediaField(raw.mediaTitle)
  snap.mediaArtist = sanitizeMediaField(raw.mediaArtist)
  snap.barCount = clampBarCount(raw.barCount)
  snap.sensitivity = raw.sensitivity === undefined || raw.sensitivity === null
    ? DEFAULT_SENSITIVITY
    : clampSensitivity(raw.sensitivity)
  if (snap.muted === true) {
    snap.peak = 0
    snap.rms = 0
  }
  if (snap.error && raw.present !== true) {
    snap.present = false
    snap.demo = false
    return snap
  }
  if (raw.present === true && hasLevelPath(snap.path)) {
    snap.present = true
    snap.demo = false
    return snap
  }
  if (raw.present === true && snap.muted === true) {
    snap.present = true
    snap.demo = false
    return snap
  }
  if (raw.present === true && !hasLevelPath(snap.path)) {
    snap.present = false
    snap.demo = true
    return snap
  }
  return snap
}

function parseProbe(text) {
  var raw = String(text || "").trim()
  if (raw === "")
    return errorSnapshot("empty probe")
  try {
    var parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object")
      return errorSnapshot("invalid snapshot")
    return normalizeSample(parsed)
  } catch (e) {
    return errorSnapshot("invalid snapshot")
  }
}

function markStale(state, message) {
  var next = normalizeSample(state)
  next.stale = true
  next.error = message || next.error || "levels went stale"
  next.peak = 0
  next.rms = 0
  return next
}

function mergeSample(current, incoming) {
  var next = typeof incoming === "string" ? parseProbe(incoming) : normalizeSample(incoming)
  var live = current && current.present === true && current.stale !== true && hasLevelPath(current.path)
  if (next && next.forceDemo === true)
    return next
  if (next && next.present === true)
    return next
  if (live)
    return markStale(current, next && next.error ? next.error : "levels went stale")
  if (next && next.demo === true && !next.error)
    return next
  if (current && current.stale === true && current.present === true)
    return current
  if (current && current.error && current.present !== true)
    return current
  return next && next.error ? next : errorSnapshot("probe failed")
}

function isStaleAge(updatedAt, now, windowMs) {
  var ts = number(updatedAt)
  if (ts <= 0)
    return false
  return (number(now) - ts) > (windowMs || STALE_MS)
}

function applyAge(state, now) {
  if (!state || state.forceDemo === true)
    return state
  if (state.present !== true || !hasLevelPath(state.path))
    return state
  if (isStaleAge(state.updatedAt, now))
    return markStale(state, "levels went stale")
  return state
}

function barMode(state) {
  if (!state)
    return "demo"
  if (state.forceDemo === true)
    return "demo"
  if (state.error && state.present !== true && state.stale !== true)
    return "err"
  if (state.stale === true)
    return "stale"
  if (state.muted === true && (state.present === true || isMuteOnlyPath(state.path)))
    return "muted"
  if (state.present === true && hasLevelPath(state.path) && state.demo !== true)
    return "live"
  if (state.error)
    return "err"
  return "demo"
}

function barLabel(state) {
  var mode = barMode(state)
  if (mode === "live")
    return "LIVE"
  if (mode === "muted")
    return "MUTED"
  if (mode === "err")
    return "ERR"
  if (mode === "stale")
    return "STALE"
  return "DEMO"
}

function pathDisplay(state) {
  if (!state)
    return pathLabel("demo")
  var mode = barMode(state)
  if (mode === "err")
    return state.error || pathLabel("err")
  if (mode === "demo" && state.forceDemo === true)
    return pathLabel("demo")
  var label = pathLabel(state.path)
  if (mode === "stale")
    return "last " + label
  return label
}

function statusLine(state) {
  if (!state)
    return "DEMO · DEMO oscillator · not live music"
  var mode = barMode(state)
  var path = pathDisplay(state)
  if (mode === "demo") {
    if (state.forceDemo === true)
      return "DEMO forced · oscillator · not live music"
    return "DEMO · " + path + " · not live music"
  }
  if (mode === "err")
    return "ERR · " + (state.error || "probe failed")
  if (mode === "stale")
    return "STALE · " + path + " · not live levels"
  if (mode === "muted")
    return "MUTED · " + pathLabel(state.path)
  if (isSilentPeak(state.peak))
    return "LIVE · " + pathLabel(state.path) + " · silent"
  return "LIVE · " + pathLabel(state.path)
}

function bandWeight(index, count) {
  var n = clampBarCount(count)
  var t = n <= 1 ? 0 : index / (n - 1)
  return clamp(1.05 - t * 0.72 + Math.sin(t * Math.PI) * 0.18, 0.18, 1.15)
}

function peakTargets(peak, count, t) {
  var n = clampBarCount(count)
  var p = clamp(number(peak), 0, 1)
  var bars = []
  var i
  for (i = 0; i < n; i++) {
    var w = bandWeight(i, n)
    var phase = number(t) * (2.4 + i * 0.35) + i * 0.41
    var shimmer = 0.62 + 0.38 * Math.abs(Math.sin(phase))
    var gate = clamp((p - (i / n) * 0.35) / 0.65, 0, 1)
    bars.push(clamp(p * w * shimmer * (0.55 + 0.45 * gate), 0, 1))
  }
  return bars
}

function demoTargets(t, count, sensitivity) {
  var n = clampBarCount(count)
  var s = clampSensitivity(sensitivity)
  var breath = 0.5 + 0.5 * Math.sin(number(t) * 0.85)
  var bars = []
  var i
  for (i = 0; i < n; i++) {
    var u = n <= 1 ? 0 : i / (n - 1)
    var wave = 0.42 * Math.sin(number(t) * 1.7 + u * Math.PI * 2.2)
      + 0.28 * Math.sin(number(t) * 3.1 + u * 7.0)
      + 0.16 * Math.sin(number(t) * 5.6 + u * 3.4)
    var spark = Math.sin(number(t) * 11.0 + i * 1.7) > 0.93 ? 0.22 : 0
    bars.push(clamp(0.22 + breath * 0.2 + wave * (0.34 + s * 0.12) + spark, 0.06, 1))
  }
  return bars
}

function applyEnvelope(prev, target, attack, decay) {
  var n = target && target.length ? target.length : 0
  var next = []
  var i
  for (i = 0; i < n; i++) {
    var a = clamp(number(prev && prev[i]), 0, 1)
    var b = clamp(number(target[i]), 0, 1)
    var k = b > a ? attack : decay
    next.push(clamp(a + (b - a) * k, 0, 1))
  }
  return next
}

function nextBars(prev, opts) {
  opts = opts || {}
  var mode = barMode(opts)
  var count = clampBarCount(opts.barCount || (prev && prev.length))
  var prevBars = copyBars(prev, count)
  if (opts.frozen === true)
    return prevBars
  var t = number(opts.t)
  var sens = clampSensitivity(opts.sensitivity)
  var target
  if (mode === "demo") {
    target = demoTargets(t, count, sens)
  } else if (mode === "muted" || mode === "err" || mode === "stale") {
    target = emptyBars(count)
  } else {
    var peak = clamp(number(opts.peak) * sens, 0, 1)
    if (isSilentPeak(peak))
      target = emptyBars(count)
    else
      target = peakTargets(peak, count, t)
  }
  var attack = mode === "demo" ? 0.32 : 0.48
  var decay = mode === "demo" ? 0.16 : 0.2
  if (mode === "muted" || mode === "err" || mode === "stale")
    decay = 0.42
  return applyEnvelope(prevBars, target, attack, decay)
}

function glowFromBars(bars) {
  if (!bars || !bars.length)
    return 0
  var sum = 0
  var i
  for (i = 0; i < bars.length; i++)
    sum += number(bars[i])
  return clamp(sum / bars.length, 0, 1)
}

function aboutText() {
  return "Spectra Theme Reactor paints a neon strip from real sink peaks when Quickshell's PwNodePeakMonitor (same family as omarchy.audio) or a CLI RMS capture of the sink monitor is available. Volume is never treated as music. Otherwise it runs a labeled DEMO oscillator — never a fake live mix. MUTED is a user mute; LIVE silent is an unmuted quiet sink. Track names appear only from omarchy.media / MPRIS while a player is Playing, and they are not the spectrum source. See docs/OPPOSITION.md."
}
