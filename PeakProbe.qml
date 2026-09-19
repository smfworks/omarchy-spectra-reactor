import QtQuick
import Quickshell.Services.Pipewire

// Isolated so BarWidget still loads if this Quickshell build lacks PwNodePeakMonitor.
Item {
  id: root

  // ready = default sink object exists. That is a peak *path*, not proof of music.
  // BarWidget must still distinguish MUTED / silent LIVE / STALE.
  readonly property var sink: Pipewire.defaultAudioSink
  readonly property bool ready: sink !== null && sink !== undefined
  readonly property bool muted: sink && sink.audio ? sink.audio.muted === true : false
  readonly property real peak: muted ? 0 : monitor.peak
  readonly property string path: "quickshell.peak"
  readonly property string pathLabel: "Quickshell PwNodePeakMonitor · default sink"

  PwObjectTracker {
    objects: root.sink ? [root.sink] : []
  }

  PwNodePeakMonitor {
    id: monitor
    node: root.sink
    enabled: root.ready
  }
}
