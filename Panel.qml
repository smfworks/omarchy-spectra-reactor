import QtQuick
import Quickshell
import qs.Commons
import qs.Ui
import "SpectraLogic.js" as Spectra

Panel {
  id: root
  moduleName: "smf.spectra-reactor"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null

  readonly property var host: hostWidget
  readonly property var snapshot: host && host.snapshot ? host.snapshot : Spectra.demoSnapshot()
  readonly property string statusLine: host && host.reactorStatus ? host.reactorStatus : Spectra.statusLine(snapshot)
  readonly property string modeLabel: host && host.reactorLabel ? host.reactorLabel : Spectra.barLabel(snapshot)
  readonly property string pathLine: Spectra.pathDisplay(snapshot)
  readonly property string mediaLine: Spectra.mediaLine(snapshot)
  readonly property real sensitivity: host ? Number(host.sensitivity) : Spectra.DEFAULT_SENSITIVITY
  readonly property bool forceDemo: host ? host.forceDemo === true : false
  readonly property bool frozen: host ? host.frozen === true : false
  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property color neon: Color.accent
  readonly property color neonHot: (bar && bar.urgent) ? bar.urgent : Color.urgent
  readonly property color glass: Color.popups && Color.popups.background ? Color.popups.background : Color.background
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  function open() {
    setCenterHoverRevealSuppressed(false)
    root.controller.show()
  }

  function close() {
    setCenterHoverRevealSuppressed(false)
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.open()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.hostWidget || root, direction)
    return false
  }

  function setCenterHoverRevealSuppressed(value) {
    if (root.bar && "centerHoverRevealSuppressed" in root.bar)
      root.bar.centerHoverRevealSuppressed = value
  }

  function glassFill(alpha) {
    return Qt.rgba(glass.r, glass.g, glass.b, alpha)
  }

  function accentFill(color, alpha) {
    return Qt.rgba(color.r, color.g, color.b, alpha)
  }

  function setSensitivity(value) {
    if (host)
      host.sensitivity = Spectra.clampSensitivity(value)
  }

  function setForceDemo(value) {
    if (host)
      host.forceDemo = value === true
  }

  function setFrozen(value) {
    if (host)
      host.frozen = value === true
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.hostWidget || root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(360))
    contentHeight: panel.fittedContentHeight(body.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(t) {
        if (t === "d" || t === "D") root.setForceDemo(!root.forceDemo)
        else if (t === "f" || t === "F") root.setFrozen(!root.frozen)
      }

      Column {
        id: body
        width: parent.width
        spacing: Style.space(12)
        leftPadding: Style.space(16)
        rightPadding: Style.space(16)
        topPadding: Style.space(14)
        bottomPadding: Style.space(14)

        Rectangle {
          width: parent.width - Style.space(32)
          implicitHeight: headerColumn.implicitHeight + Style.space(18)
          radius: Style.cornerRadius
          color: root.accentFill(root.neon, 0.08)
          border.width: 1
          border.color: root.accentFill(root.neonHot, 0.45)

          Column {
            id: headerColumn
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            anchors.leftMargin: Style.space(12)
            anchors.rightMargin: Style.space(12)
            spacing: Style.space(4)

            Row {
              spacing: Style.space(8)

              Text {
                text: "SPECTRA REACTOR"
                color: root.neon
                font.family: root.fontFamily
                font.pixelSize: Style.font.heading
                font.bold: true
                font.letterSpacing: 2.2
              }

              Rectangle {
                anchors.verticalCenter: parent.verticalCenter
                implicitWidth: chipText.implicitWidth + Style.space(10)
                implicitHeight: chipText.implicitHeight + Style.space(4)
                radius: height / 2
                color: root.accentFill(root.modeLabel === "LIVE" ? root.neon : root.neonHot, 0.22)
                border.width: 1
                border.color: root.accentFill(root.neon, 0.55)

                Text {
                  id: chipText
                  anchors.centerIn: parent
                  text: root.modeLabel
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  font.bold: true
                  font.letterSpacing: 1.1
                }
              }
            }

            Text {
              width: parent.width
              wrapMode: Text.WordWrap
              text: root.statusLine
              color: root.modeLabel === "LIVE" ? root.neon : root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
            }

            Text {
              width: parent.width
              wrapMode: Text.WordWrap
              text: "Path · " + root.pathLine
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }

            Text {
              width: parent.width
              wrapMode: Text.WordWrap
              visible: root.mediaLine !== ""
              text: "MPRIS (not the spectrum) · " + root.mediaLine
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }
          }
        }

        Column {
          width: parent.width - Style.space(32)
          spacing: Style.space(6)

          Text {
            text: "Sensitivity  " + root.sensitivity.toFixed(2)
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.body
            font.bold: true
          }

          Item {
            id: slider
            width: parent.width
            height: Style.space(22)
            readonly property real from: 0.25
            readonly property real to: 3.0

            function setFromX(x) {
              var t = Math.max(0, Math.min(1, x / Math.max(1, width)))
              root.setSensitivity(from + t * (to - from))
            }

            Rectangle {
              anchors.verticalCenter: parent.verticalCenter
              width: parent.width
              height: Style.space(4)
              radius: height / 2
              color: root.accentFill(root.neon, 0.18)

              Rectangle {
                width: parent.width * ((root.sensitivity - slider.from) / (slider.to - slider.from))
                height: parent.height
                radius: height / 2
                color: root.neon
              }
            }

            Rectangle {
              width: Style.space(12)
              height: Style.space(12)
              radius: width / 2
              color: root.foreground
              border.width: 1
              border.color: root.neon
              anchors.verticalCenter: parent.verticalCenter
              x: Math.max(0, (slider.width - width) * ((root.sensitivity - slider.from) / (slider.to - slider.from)))
            }

            MouseArea {
              anchors.fill: parent
              cursorShape: Qt.PointingHandCursor
              onPressed: function(mouse) { slider.setFromX(mouse.x) }
              onPositionChanged: function(mouse) {
                if (pressed) slider.setFromX(mouse.x)
              }
            }
          }
        }

        Column {
          width: parent.width - Style.space(32)
          spacing: Style.space(8)

          Rectangle {
            width: parent.width
            implicitHeight: demoRow.implicitHeight + Style.space(12)
            radius: Style.cornerRadius
            color: root.glassFill(0.42)
            border.width: 1
            border.color: root.accentFill(root.neon, root.forceDemo ? 0.55 : 0.25)

            Row {
              id: demoRow
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              anchors.leftMargin: Style.space(12)
              anchors.rightMargin: Style.space(12)
              spacing: Style.space(10)

              Rectangle {
                width: Style.space(16)
                height: Style.space(16)
                radius: 3
                color: root.forceDemo ? root.neon : "transparent"
                border.width: 1
                border.color: root.neon
                anchors.verticalCenter: parent.verticalCenter
              }

              Column {
                width: parent.width - Style.space(26)
                spacing: Style.space(2)

                Text {
                  text: "Force DEMO oscillator"
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                  font.bold: true
                }

                Text {
                  width: parent.width
                  wrapMode: Text.WordWrap
                  text: "Labeled DEMO even when a live peak path exists. Never pretends this is music."
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                }
              }
            }

            MouseArea {
              anchors.fill: parent
              cursorShape: Qt.PointingHandCursor
              onClicked: root.setForceDemo(!root.forceDemo)
            }
          }

          Rectangle {
            width: parent.width
            implicitHeight: freezeRow.implicitHeight + Style.space(12)
            radius: Style.cornerRadius
            color: root.glassFill(0.42)
            border.width: 1
            border.color: root.accentFill(root.neonHot, root.frozen ? 0.55 : 0.25)

            Row {
              id: freezeRow
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              anchors.leftMargin: Style.space(12)
              anchors.rightMargin: Style.space(12)
              spacing: Style.space(10)

              Rectangle {
                width: Style.space(16)
                height: Style.space(16)
                radius: 3
                color: root.frozen ? root.neonHot : "transparent"
                border.width: 1
                border.color: root.neonHot
                anchors.verticalCenter: parent.verticalCenter
              }

              Column {
                width: parent.width - Style.space(26)
                spacing: Style.space(2)

                Text {
                  text: "Freeze spectrum"
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                  font.bold: true
                }

                Text {
                  width: parent.width
                  wrapMode: Text.WordWrap
                  text: "Hold the current bar heights. Honesty chip stays on the live path."
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                }
              }
            }

            MouseArea {
              anchors.fill: parent
              cursorShape: Qt.PointingHandCursor
              onClicked: root.setFrozen(!root.frozen)
            }
          }
        }

        Text {
          width: parent.width - Style.space(32)
          wrapMode: Text.WordWrap
          text: Spectra.aboutText()
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }

        Text {
          width: parent.width - Style.space(32)
          wrapMode: Text.WordWrap
          text: "Click the strip to close · D DEMO · F freeze · Esc close"
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }
      }
    }
  }
}
