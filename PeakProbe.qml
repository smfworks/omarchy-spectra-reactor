import QtQuick
import Quickshell.Services.Pipewire

// Isolated so BarWidget still loads if this Quickshell build lacks PwNodePeakMonitor.
Item {
  id: root

  readonly property var sink: Pipewire.defaultAudioSink
  readonly property bool ready: sink !== null && sink !== undefined
  readonly property bool muted: sink && sink.audio ? sink.audio.muted === true : false
  readonly property real peak: monitor.peak
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
