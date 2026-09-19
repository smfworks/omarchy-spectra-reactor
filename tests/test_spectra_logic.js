#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const src = fs.readFileSync(path.join(__dirname, "..", "SpectraLogic.js"), "utf8")
  .replace(/^\.pragma library\s*/, "");
const Spectra = { Math, Date, Number, String, Array, Object, JSON, isFinite, console };
vm.createContext(Spectra);
vm.runInContext(src, Spectra);

function liveSample(overrides) {
  return Object.assign({
    present: true,
    path: "quickshell.peak",
    peak: 0.6,
    muted: false,
    updatedAt: 1_700_000_000_000
  }, overrides || {});
}

function chip(state) {
  return Spectra.barLabel(state);
}

assert.strictEqual(chip(Spectra.demoSnapshot()), "DEMO");
assert.strictEqual(Spectra.barMode(Spectra.demoSnapshot()), "demo");
assert.ok(Spectra.statusLine(Spectra.demoSnapshot()).indexOf("not live music") !== -1);
assert.ok(Spectra.statusLine(null).indexOf("DEMO") !== -1);
assert.ok(Spectra.pathDisplay(null).indexOf("DEMO") !== -1);

const err = Spectra.errorSnapshot("probe failed");
assert.strictEqual(chip(err), "ERR");
assert.ok(Spectra.statusLine(err).startsWith("ERR · "));
assert.strictEqual(Spectra.pathDisplay(err), "probe failed");

const live = Spectra.normalizeSample(liveSample());
assert.strictEqual(Spectra.barMode(live), "live");
assert.strictEqual(chip(live), "LIVE");
assert.ok(Spectra.statusLine(live).indexOf("PwNodePeakMonitor") !== -1);
assert.ok(Spectra.statusLine(live).indexOf("not live music") === -1);
assert.ok(Spectra.statusLine(live).indexOf("silent") === -1);
assert.strictEqual(Spectra.pathDisplay(live), Spectra.pathLabel("quickshell.peak"));

const silentLive = Spectra.normalizeSample(liveSample({ peak: 0 }));
assert.strictEqual(chip(silentLive), "LIVE", "unmuted quiet sink is LIVE silent, not DEMO");
assert.ok(Spectra.statusLine(silentLive).indexOf("silent") !== -1);
assert.ok(Spectra.statusLine(silentLive).indexOf("MUTED") === -1);

const forced = Spectra.normalizeSample(liveSample({ forceDemo: true }));
assert.strictEqual(Spectra.barMode(forced), "demo");
assert.strictEqual(chip(forced), "DEMO");
assert.ok(Spectra.statusLine(forced).indexOf("DEMO forced") !== -1);
assert.strictEqual(Spectra.pathDisplay(forced), Spectra.pathLabel("demo"));

const muted = Spectra.normalizeSample(liveSample({ muted: true, peak: 0.8 }));
assert.strictEqual(Spectra.barMode(muted), "muted");
assert.strictEqual(chip(muted), "MUTED");
assert.strictEqual(muted.peak, 0, "MUTED discards leftover peak");
assert.ok(Spectra.statusLine(muted).indexOf("MUTED") !== -1);
assert.ok(Spectra.statusLine(muted).indexOf("silent") === -1);

const muteOnly = Spectra.normalizeSample({
  present: true,
  path: "cli.wpctl",
  muted: true,
  peak: 0.55
});
assert.strictEqual(Spectra.barMode(muteOnly), "muted");
assert.strictEqual(Spectra.hasLevelPath("cli.wpctl"), false);
assert.strictEqual(muteOnly.peak, 0);

const volumeOnlyUnmuted = Spectra.normalizeSample({
  present: true,
  path: "cli.wpctl",
  muted: false,
  peak: 0.9
});
assert.strictEqual(Spectra.barMode(volumeOnlyUnmuted), "demo", "volume is not music");
assert.strictEqual(chip(volumeOnlyUnmuted), "DEMO");
assert.strictEqual(volumeOnlyUnmuted.peak, 0, "mute-only peak is discarded");
assert.ok(Spectra.statusLine(volumeOnlyUnmuted).indexOf("not live music") !== -1);

const pactlVolume = Spectra.normalizeSample({
  present: true,
  path: "cli.pactl",
  muted: false,
  peak: 1
});
assert.strictEqual(chip(pactlVolume), "DEMO");
assert.strictEqual(pactlVolume.peak, 0);

const stale = Spectra.markStale(live, "levels went stale");
assert.strictEqual(chip(stale), "STALE");
assert.strictEqual(stale.peak, 0, "STALE does not keep leftover music");
assert.ok(Spectra.statusLine(stale).indexOf("STALE") !== -1);
assert.ok(Spectra.statusLine(stale).indexOf("not live levels") !== -1);
assert.ok(Spectra.pathDisplay(stale).indexOf("last ") === 0);

const aged = Spectra.applyAge(live, live.updatedAt + Spectra.STALE_MS + 10);
assert.strictEqual(chip(aged), "STALE");
assert.strictEqual(Spectra.barMode(Spectra.applyAge(live, live.updatedAt + 100)), "live");

assert.strictEqual(Spectra.parseProbe("").error, "empty probe");
assert.strictEqual(chip(Spectra.parseProbe("{not json")), "ERR");
assert.strictEqual(Spectra.parseProbe('{"present":false}').demo, true);

const mergedStale = Spectra.mergeSample(live, "");
assert.strictEqual(chip(mergedStale), "STALE");
assert.strictEqual(chip(Spectra.mergeSample(mergedStale, "")), "STALE");
assert.strictEqual(chip(Spectra.mergeSample(Spectra.demoSnapshot(), "")), "ERR");

const liveToDemo = Spectra.mergeSample(live, { present: false, path: "demo" });
assert.strictEqual(chip(liveToDemo), "STALE", "dropping a live path is STALE, not a pretty DEMO");

const liveToForce = Spectra.mergeSample(live, { present: false, path: "demo", forceDemo: true });
assert.strictEqual(chip(liveToForce), "DEMO", "force DEMO is immediate");

const rmsLive = Spectra.normalizeSample({
  present: true,
  path: "cli.pw-record",
  peak: 0.4
});
assert.strictEqual(Spectra.barMode(rmsLive), "live");
assert.ok(Spectra.pathLabel("cli.pw-record").indexOf("sink monitor") !== -1);
assert.ok(Spectra.pathLabel("cli.parec").indexOf("parec") !== -1);
assert.ok(Spectra.pathLabel("cli.cava").indexOf("cava") !== -1);

const lyingLabel = Spectra.normalizeSample({
  present: false,
  path: "demo",
  pathLabel: "Quickshell PwNodePeakMonitor · default sink"
});
assert.strictEqual(chip(lyingLabel), "DEMO");
assert.strictEqual(Spectra.pathDisplay(lyingLabel), Spectra.pathLabel("demo"));
assert.ok(Spectra.statusLine(lyingLabel).indexOf("PwNodePeakMonitor") === -1);

const hiddenErr = Spectra.normalizeSample({
  present: true,
  path: "quickshell.peak",
  peak: 0.4,
  error: "something"
});
assert.strictEqual(chip(hiddenErr), "LIVE", "fresh levels stay LIVE");

const errPresentFalse = Spectra.normalizeSample({
  present: false,
  error: "monitor capture failed",
  path: "err"
});
assert.strictEqual(chip(errPresentFalse), "ERR");

assert.strictEqual(Spectra.clampBarCount(3), 8);
assert.strictEqual(Spectra.clampBarCount(99), 32);
assert.strictEqual(Spectra.clampBarCount(16), 16);
assert.strictEqual(Spectra.emptyBars(12).length, 12);
assert.ok(Spectra.clampSensitivity(0) >= 0.25);
assert.ok(Spectra.clampSensitivity(9) <= 3);

const empty = Spectra.emptyBars(16);
const demoA = Spectra.nextBars(empty, { forceDemo: true, t: 0, barCount: 16, sensitivity: 1 });
const demoB = Spectra.nextBars(empty, { forceDemo: true, t: 0.8, barCount: 16, sensitivity: 1 });
assert.ok(demoA.some(function(v) { return v > 0.05; }), "DEMO breathes");
assert.notDeepStrictEqual(demoA, demoB, "DEMO oscillator moves");
assert.ok(demoA.every(function(v) { return v >= 0 && v <= 1; }));

const high = Spectra.peakTargets(0.9, 16, 0);
const silentFromHigh = Spectra.nextBars(high, liveSample({ peak: 0, t: 1, barCount: 16, sensitivity: 1 }));
const silentFromEmpty = Spectra.nextBars(empty, liveSample({ peak: 0, t: 1, barCount: 16, sensitivity: 1 }));
const loudLive = Spectra.nextBars(empty, liveSample({ peak: 0.85, t: 1, barCount: 16, sensitivity: 1 }));
assert.ok(
  silentFromHigh.reduce(function(a, b) { return a + b; }, 0)
    < high.reduce(function(a, b) { return a + b; }, 0),
  "LIVE idle decays toward flat"
);
assert.ok(silentFromEmpty.every(function(v) { return v === 0; }), "LIVE silence stays flat");
assert.ok(loudLive.some(function(v) { return v > 0.15; }), "LIVE peak lights bars");

const held = [0.2, 0.4, 0.6, 0.8, 0.5, 0.3, 0.2, 0.1];
const frozen = Spectra.nextBars(held, liveSample({ frozen: true, peak: 0.99, barCount: 8 }));
assert.strictEqual(JSON.stringify(frozen), JSON.stringify(held));

const mutedFlat = Spectra.nextBars(
  Spectra.peakTargets(0.8, 16, 0),
  liveSample({ muted: true, t: 1, barCount: 16 })
);
assert.ok(
  mutedFlat.reduce(function(a, b) { return a + b; }, 0)
    < Spectra.peakTargets(0.8, 16, 0).reduce(function(a, b) { return a + b; }, 0),
  "MUTED decays instead of looking broken-quiet"
);

const errPrev = Spectra.peakTargets(0.7, 16, 0);
const errFlat = Spectra.nextBars(errPrev, err);
assert.ok(
  errFlat.reduce(function(a, b) { return a + b; }, 0)
    < errPrev.reduce(function(a, b) { return a + b; }, 0),
  "ERR decays instead of a silent empty strip"
);

const stalePrev = Spectra.peakTargets(0.85, 16, 0);
const staleFlat = Spectra.nextBars(stalePrev, stale);
assert.ok(
  staleFlat.reduce(function(a, b) { return a + b; }, 0)
    < stalePrev.reduce(function(a, b) { return a + b; }, 0),
  "STALE decays leftover peaks instead of shimmering them"
);

const hot = Spectra.nextBars(empty, liveSample({ peak: 0.2, sensitivity: 3, t: 1, barCount: 16 }));
const cool = Spectra.nextBars(empty, liveSample({ peak: 0.2, sensitivity: 0.25, t: 1, barCount: 16 }));
assert.ok(
  hot.reduce(function(a, b) { return a + b; }, 0)
    > cool.reduce(function(a, b) { return a + b; }, 0),
  "sensitivity scales peak-driven bars"
);

assert.strictEqual(Spectra.mediaLine(live), "");
assert.strictEqual(Spectra.detectMedia(null).title, "");
assert.strictEqual(Spectra.detectMedia({}).title, "");
assert.strictEqual(Spectra.detectMedia({ trackTitle: "  " }).title, "");
assert.strictEqual(Spectra.detectMedia({ trackTitle: "Real Track" }).title, "", "paused player is not now-playing");
assert.strictEqual(Spectra.detectMedia({
  trackTitle: "Real Track",
  trackArtist: "Real Artist",
  title: "Window title",
  playbackStatus: "Paused"
}).title, "");
assert.strictEqual(Spectra.detectMedia({
  trackTitle: "Untitled track",
  playbackStatus: "Playing"
}).title, "");
assert.strictEqual(Spectra.detectMedia({
  title: "Window title",
  playbackStatus: "Playing"
}).title, "", "do not invent from window title");
assert.strictEqual(Spectra.detectMedia({
  trackTitle: "Real Track",
  trackArtist: "Real Artist",
  playbackStatus: "Playing"
}).title, "Real Track");

const named = Spectra.normalizeSample(liveSample({
  mediaTitle: "Real Track",
  mediaArtist: "Real Artist"
}));
assert.strictEqual(Spectra.mediaLine(named), "Real Track · Real Artist");
assert.ok(Spectra.statusLine(named).indexOf("Real Track") === -1, "status does not attribute the spectrum to MPRIS");
assert.strictEqual(Spectra.mediaLine(Spectra.normalizeSample(liveSample({
  mediaTitle: "Now Playing",
  mediaArtist: "Unknown Artist"
}))), "");

assert.ok(!src.includes("Now Playing"), "no invented now-playing copy");
assert.ok(!src.includes("Untitled track"));
assert.ok(!src.includes("Unknown Artist"));

const glow = Spectra.glowFromBars([0, 1, 0.5]);
assert.ok(glow > 0.4 && glow < 0.6);
assert.strictEqual(Spectra.glowFromBars([]), 0);

assert.ok(Spectra.aboutText().indexOf("DEMO") !== -1);
assert.ok(Spectra.aboutText().indexOf("omarchy.media") !== -1);
assert.ok(Spectra.aboutText().indexOf("OPPOSITION") !== -1);
assert.strictEqual(Spectra.isSinkMonitorName("alsa_output.pci.monitor"), true);
assert.strictEqual(Spectra.isSinkMonitorName("@DEFAULT_AUDIO_SOURCE@"), false);

const probe = spawnSync("python3", [path.join(__dirname, "..", "probe.py")], {
  encoding: "utf8",
  timeout: 4000
});
assert.strictEqual(probe.status, 0, probe.stderr || "probe.py failed");
const probeSnap = Spectra.parseProbe(probe.stdout);
assert.ok(probeSnap);
assert.notStrictEqual(chip(probeSnap), "LIVE", "CI without PipeWire must not claim LIVE");
assert.ok(["DEMO", "MUTED", "ERR"].indexOf(chip(probeSnap)) !== -1);

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
assert.strictEqual(manifest.id, "smf.spectra-reactor");
assert.ok(!String(manifest.id).startsWith("omarchy."));
assert.deepStrictEqual(manifest.kinds, ["bar-widget"]);
assert.strictEqual(manifest.entryPoints.barWidget, "BarWidget.qml");
assert.strictEqual(manifest.author, "SMF Works");
assert.strictEqual(manifest.license, "MIT");

[
  "BarWidget.qml",
  "Panel.qml",
  "PeakProbe.qml",
  "SpectraLogic.js",
  "LICENSE",
  "README.md",
  "probe.py",
  "docs/OPPOSITION.md"
].forEach(function(name) {
  const full = path.join(__dirname, "..", name);
  assert.ok(fs.existsSync(full), name + " exists");
  assert.ok(!fs.lstatSync(full).isSymbolicLink(), name + " is not a symlink");
});

const widget = fs.readFileSync(path.join(__dirname, "..", "BarWidget.qml"), "utf8");
assert.ok(widget.indexOf("reactorLabel === \"LIVE\" || reactorLabel === \"DEMO\"") === -1);
assert.ok(widget.indexOf("chipLoud: reactorLabel === \"LIVE\"") !== -1);
assert.ok(widget.indexOf("cliSample.present === true && Spectra.hasLevelPath") !== -1);
assert.ok(widget.indexOf("if (code !== 0 && !root.cliSample)") === -1);

const panel = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8");
assert.ok(panel.indexOf("Spectra.pathDisplay(snapshot)") !== -1);
assert.ok(panel.indexOf("MPRIS (not the spectrum)") !== -1);

const probeSrc = fs.readFileSync(path.join(__dirname, "..", "probe.py"), "utf8");
assert.ok(probeSrc.indexOf("--target") !== -1);
assert.ok(probeSrc.indexOf(".monitor") !== -1);
assert.ok(probeSrc.indexOf("@DEFAULT_AUDIO_SOURCE@") !== -1);
assert.ok(!/out\["peak"\]\s*=\s*volume/.test(probeSrc));
assert.ok(probeSrc.indexOf("volume is never treated as music") !== -1);

const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
assert.ok(readme.indexOf("omarchy plugin add https://github.com/smfworks/omarchy-spectra-reactor.git --enable") !== -1);
assert.ok(readme.indexOf("unsandboxed") !== -1);
assert.ok(readme.indexOf("docs/OPPOSITION.md") !== -1);
assert.ok(readme.indexOf("python3") !== -1);
assert.ok(readme.indexOf("Neural Pulse") !== -1);
assert.ok(readme.indexOf("Cron Constellation") !== -1);
assert.ok(readme.indexOf("Orbit Dock") !== -1);
assert.ok(readme.indexOf("Ghost Trace") !== -1);
assert.ok(readme.indexOf("not live music") !== -1 || readme.indexOf("not treated as music") !== -1);

console.log("ok - SpectraLogic helpers");
