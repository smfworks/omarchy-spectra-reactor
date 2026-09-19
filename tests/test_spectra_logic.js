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

assert.strictEqual(Spectra.barLabel(Spectra.demoSnapshot()), "DEMO");
assert.strictEqual(Spectra.barMode(Spectra.demoSnapshot()), "demo");
assert.ok(Spectra.statusLine(Spectra.demoSnapshot()).indexOf("not live music") !== -1);
assert.ok(Spectra.statusLine(null).indexOf("DEMO") !== -1);

const err = Spectra.errorSnapshot("probe failed");
assert.strictEqual(Spectra.barLabel(err), "ERR");
assert.ok(Spectra.statusLine(err).startsWith("ERR · "));

const live = Spectra.normalizeSample(liveSample());
assert.strictEqual(Spectra.barMode(live), "live");
assert.strictEqual(Spectra.barLabel(live), "LIVE");
assert.ok(Spectra.statusLine(live).indexOf("PwNodePeakMonitor") !== -1);
assert.ok(Spectra.statusLine(live).indexOf("not live music") === -1);

const forced = Spectra.normalizeSample(liveSample({ forceDemo: true }));
assert.strictEqual(Spectra.barMode(forced), "demo");
assert.strictEqual(Spectra.barLabel(forced), "DEMO");
assert.ok(Spectra.statusLine(forced).indexOf("DEMO forced") !== -1);

const muted = Spectra.normalizeSample(liveSample({ muted: true }));
assert.strictEqual(Spectra.barMode(muted), "muted");
assert.strictEqual(Spectra.barLabel(muted), "MUTED");

const muteOnly = Spectra.normalizeSample({
  present: true,
  path: "cli.wpctl",
  muted: true,
  peak: 0
});
assert.strictEqual(Spectra.barMode(muteOnly), "muted");
assert.strictEqual(Spectra.hasLevelPath("cli.wpctl"), false);

const volumeOnlyUnmuted = Spectra.normalizeSample({
  present: true,
  path: "cli.wpctl",
  muted: false,
  peak: 0.9
});
assert.strictEqual(Spectra.barMode(volumeOnlyUnmuted), "demo", "volume is not music");
assert.strictEqual(Spectra.barLabel(volumeOnlyUnmuted), "DEMO");

const stale = Spectra.markStale(live, "levels went stale");
assert.strictEqual(Spectra.barLabel(stale), "STALE");
assert.ok(Spectra.statusLine(stale).indexOf("STALE") !== -1);

const aged = Spectra.applyAge(live, live.updatedAt + Spectra.STALE_MS + 10);
assert.strictEqual(Spectra.barLabel(aged), "STALE");
assert.strictEqual(Spectra.barMode(Spectra.applyAge(live, live.updatedAt + 100)), "live");

assert.strictEqual(Spectra.parseProbe("").error, "empty probe");
assert.strictEqual(Spectra.barLabel(Spectra.parseProbe("{not json")), "ERR");
assert.strictEqual(Spectra.parseProbe('{"present":false}').demo, true);

const mergedStale = Spectra.mergeSample(live, "");
assert.strictEqual(Spectra.barLabel(mergedStale), "STALE");
assert.strictEqual(mergedStale.peak, 0.6);
assert.strictEqual(Spectra.barLabel(Spectra.mergeSample(mergedStale, "")), "STALE");
assert.strictEqual(Spectra.barLabel(Spectra.mergeSample(Spectra.demoSnapshot(), "")), "ERR");

const rmsLive = Spectra.normalizeSample({
  present: true,
  path: "cli.pw-record",
  peak: 0.4
});
assert.strictEqual(Spectra.barMode(rmsLive), "live");
assert.ok(Spectra.pathLabel("cli.parec").indexOf("parec") !== -1);
assert.ok(Spectra.pathLabel("cli.cava").indexOf("cava") !== -1);

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
const named = Spectra.normalizeSample(liveSample({
  mediaTitle: "Real Track",
  mediaArtist: "Real Artist"
}));
assert.strictEqual(Spectra.mediaLine(named), "Real Track · Real Artist");
assert.ok(Spectra.statusLine(named).indexOf("Real Track") !== -1);
assert.ok(!src.includes("Now Playing"), "no invented now-playing copy");
assert.ok(!src.includes("Untitled track"));
assert.ok(!src.includes("Unknown Artist"));

const glow = Spectra.glowFromBars([0, 1, 0.5]);
assert.ok(glow > 0.4 && glow < 0.6);
assert.strictEqual(Spectra.glowFromBars([]), 0);

assert.ok(Spectra.aboutText().indexOf("DEMO") !== -1);
assert.ok(Spectra.aboutText().indexOf("omarchy.media") !== -1);

const probe = spawnSync("python3", [path.join(__dirname, "..", "probe.py")], {
  encoding: "utf8",
  timeout: 4000
});
assert.strictEqual(probe.status, 0, probe.stderr || "probe.py failed");
const probeSnap = Spectra.parseProbe(probe.stdout);
assert.ok(probeSnap);
assert.notStrictEqual(Spectra.barLabel(probeSnap), "LIVE", "CI without PipeWire must not claim LIVE");
assert.ok(["DEMO", "MUTED", "ERR"].indexOf(Spectra.barLabel(probeSnap)) !== -1);

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
assert.strictEqual(manifest.id, "smf.spectra-reactor");
assert.ok(!String(manifest.id).startsWith("omarchy."));
assert.deepStrictEqual(manifest.kinds, ["bar-widget"]);
assert.strictEqual(manifest.entryPoints.barWidget, "BarWidget.qml");
assert.strictEqual(manifest.author, "SMF Works");
assert.strictEqual(manifest.license, "MIT");

["BarWidget.qml", "Panel.qml", "PeakProbe.qml", "SpectraLogic.js", "LICENSE", "README.md", "probe.py"].forEach(function(name) {
  const full = path.join(__dirname, "..", name);
  assert.ok(fs.existsSync(full), name + " exists");
  assert.ok(!fs.lstatSync(full).isSymbolicLink(), name + " is not a symlink");
});

const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
assert.ok(readme.indexOf("omarchy plugin add https://github.com/smfworks/omarchy-spectra-reactor.git --enable") !== -1);
assert.ok(readme.indexOf("unsandboxed") !== -1);
assert.ok(readme.indexOf("Neural Pulse") !== -1);
assert.ok(readme.indexOf("Cron Constellation") !== -1);
assert.ok(readme.indexOf("Orbit Dock") !== -1);
assert.ok(readme.indexOf("Ghost Trace") !== -1);

console.log("ok - SpectraLogic helpers");
