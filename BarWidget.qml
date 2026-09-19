import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "SpectraLogic.js" as Spectra

BarWidget {
  id: root
  moduleName: "smf.spectra-reactor"

  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  property real sensitivity: Spectra.DEFAULT_SENSITIVITY
  property bool forceDemo: false
  property bool frozen: false
  property int barCount: Spectra.BAR_COUNT
  property var bars: Spectra.emptyBars(Spectra.BAR_COUNT)
  property var snapshot: Spectra.demoSnapshot()
  property var cliSample: null
  property real lastLiveAt: 0

  readonly property bool peakReady: peakLoader.status === Loader.Ready
    && peakLoader.item
    && peakLoader.item.ready === true
  readonly property real rawPeak: peakReady ? Number(peakLoader.item.peak || 0) : Number(cliSample && cliSample.peak || 0)
  readonly property bool rawMuted: peakReady
    ? peakLoader.item.muted === true
    : !!(cliSample && cliSample.muted === true)
  readonly property string rawPath: {
    if (root.forceDemo)
      return "demo"
    if (peakReady)
      return "quickshell.peak"
    if (cliSample && cliSample.path)
      return String(cliSample.path)
    return "demo"
  }
  readonly property string reactorMode: Spectra.barMode(root.snapshot)
  readonly property string reactorLabel: Spectra.barLabel(root.snapshot)
  readonly property string reactorStatus: Spectra.statusLine(root.snapshot)
  readonly property real reactorGlow: Spectra.glowFromBars(root.bars)
  readonly property bool chipLoud: reactorLabel === "LIVE" || reactorLabel === "DEMO"

  readonly property var mediaService: bar && bar.shell && bar.shell.firstPartyServiceFor
    ? bar.shell.firstPartyServiceFor("omarchy.media")
    : null
  readonly property var activePlayer: mediaService ? mediaService.activePlayer : null
  readonly property var detectedMedia: Spectra.detectMedia(activePlayer)

  readonly property color neon: Color.accent
  readonly property color neonHot: (bar && bar.urgent) ? bar.urgent : Color.urgent
  readonly property color ink: bar ? bar.foreground : Color.foreground
  readonly property color barFill: chipLoud ? neon : ink

  readonly property string probeScript: {
    var u = Qt.resolvedUrl("probe.py").toString()
    if (u.indexOf("file://") === 0)
      return decodeURIComponent(u.substring(7))
    return u
  }

  function open() {
    if (panelLoader.item) panelLoader.item.open()
  }

  function close() {
    if (panelLoader.item) panelLoader.item.close()
  }

  function toggle() {
    if (panelLoader.item) panelLoader.item.toggle()
  }

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  function currentSample(nowMs) {
    var present = false
    var error = ""
    if (root.forceDemo) {
      present = false
    } else if (root.peakReady) {
      present = true
    } else if (cliSample && cliSample.present === true) {
      present = true
    } else if (cliSample && cliSample.error) {
      error = String(cliSample.error)
    } else if (peakLoader.status === Loader.Error && cliSample && cliSample.demo === true) {
      present = false
    }
    return {
      present: present,
      path: root.rawPath,
      peak: root.rawPeak,
      rms: root.rawPeak,
      muted: root.rawMuted,
      forceDemo: root.forceDemo,
      frozen: root.frozen,
      mediaTitle: root.detectedMedia.title,
      mediaArtist: root.detectedMedia.artist,
      updatedAt: root.lastLiveAt,
      barCount: root.barCount,
      sensitivity: root.sensitivity,
      error: error
    }
  }

  function tickReactor() {
    var now = Date.now()
    if (!root.forceDemo && (root.peakReady || (cliSample && cliSample.present === true && Spectra.hasLevelPath(root.rawPath))))
      root.lastLiveAt = now
    var sample = root.currentSample(now)
    var next = Spectra.mergeSample(root.snapshot, sample)
    next.forceDemo = root.forceDemo
    next.frozen = root.frozen
    next.barCount = root.barCount
    next.sensitivity = root.sensitivity
    next.mediaTitle = root.detectedMedia.title
    next.mediaArtist = root.detectedMedia.artist
    next = Spectra.applyAge(next, now)
    root.snapshot = next
    root.bars = Spectra.nextBars(root.bars, {
      present: next.present,
      demo: next.demo,
      muted: next.muted,
      error: next.error,
      stale: next.stale,
      forceDemo: root.forceDemo,
      frozen: root.frozen,
      peak: next.peak,
      path: next.path,
      t: now / 1000,
      barCount: root.barCount,
      sensitivity: root.sensitivity
    })
  }

  function applyProbe(text) {
    root.cliSample = Spectra.parseProbe(text)
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  Loader {
    id: peakLoader
    active: true
    source: Qt.resolvedUrl("PeakProbe.qml")
  }

  IpcHandler {
    enabled: true
    target: "smf.spectra-reactor"
    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.toggle() }
  }

  Process {
    id: probe
    command: ["python3", root.probeScript]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.applyProbe(text)
    }
    onExited: function(code) {
      if (code !== 0 && !root.cliSample)
        root.applyProbe("")
    }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "SX"
    labelVisible: false
    keepSpace: true
    active: root.opened
    tooltipText: root.reactorStatus
    fixedWidth: vertical ? barSize : Style.space(96)
    fixedHeight: vertical ? Style.space(96) : barSize
    onPressed: function(buttonCode) {
      if (buttonCode === Qt.LeftButton) root.toggle()
    }

    Item {
      id: strip
      z: 1
      anchors.fill: parent
      anchors.leftMargin: Style.spaceReal(5)
      anchors.rightMargin: Style.spaceReal(5)
      anchors.topMargin: Style.spaceReal(3)
      anchors.bottomMargin: Style.spaceReal(3)

      Row {
        id: hBars
        visible: !button.vertical
        anchors.fill: parent
        spacing: Math.max(1, Math.floor(width / (root.barCount * 6)))

        Repeater {
          model: root.barCount

          Rectangle {
            required property int index
            readonly property real level: {
              var values = root.bars
              if (!values || index >= values.length)
                return 0
              return Math.max(0, Math.min(1, Number(values[index] || 0)))
            }
            width: Math.max(2, (hBars.width - hBars.spacing * Math.max(0, root.barCount - 1)) / root.barCount)
            height: Math.max(2, parent.height * (0.12 + level * 0.88))
            anchors.bottom: parent.bottom
            radius: width / 2
            color: index % 3 === 2 ? root.neonHot : root.barFill
            opacity: 0.28 + level * 0.72
          }
        }
      }

      Column {
        id: vBars
        visible: button.vertical
        anchors.fill: parent
        spacing: Math.max(1, Math.floor(height / (root.barCount * 6)))

        Repeater {
          model: root.barCount

          Rectangle {
            required property int index
            readonly property real level: {
              var values = root.bars
              if (!values || index >= values.length)
                return 0
              return Math.max(0, Math.min(1, Number(values[index] || 0)))
            }
            height: Math.max(2, (vBars.height - vBars.spacing * Math.max(0, root.barCount - 1)) / root.barCount)
            width: Math.max(2, parent.width * (0.12 + level * 0.88))
            anchors.left: parent.left
            radius: height / 2
            color: index % 3 === 2 ? root.neonHot : root.barFill
            opacity: 0.28 + level * 0.72
          }
        }
      }

      Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: Math.max(1, Style.spaceReal(2))
        radius: height / 2
        color: root.barFill
        opacity: 0.15 + root.reactorGlow * 0.7
        visible: !button.vertical
      }
    }

    Text {
      z: 2
      anchors.centerIn: parent
      text: root.reactorLabel
      color: root.ink
      font.family: bar ? bar.fontFamily : Style.font.family
      font.pixelSize: Style.font.caption
      font.bold: true
      font.letterSpacing: 1.1
      style: Text.Outline
      styleColor: Qt.rgba(0, 0, 0, 0.45)
    }
  }

  Timer {
    interval: Spectra.FRAME_MS
    running: true
    repeat: true
    onTriggered: root.tickReactor()
  }

  Timer {
    interval: Spectra.POLL_MS
    running: !root.peakReady
    repeat: true
    triggeredOnStart: true
    onTriggered: {
      if (!probe.running)
        probe.running = true
    }
  }

  Component.onCompleted: root.tickReactor()
}
