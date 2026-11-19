'use strict'

import { app } from 'electron'
import { uIOhook } from 'uiohook-napi'
import os from 'node:os'
import { startServer, eventPipe, server } from './server'
import { Logger } from './RemoteLogger'
import { GameWindow } from './windowing/GameWindow'
import { OverlayWindow } from './windowing/OverlayWindow'
import { GameConfig } from './host-files/GameConfig'
import { Shortcuts } from './shortcuts/Shortcuts'
import { AppUpdater } from './AppUpdater'
import { AppTray } from './AppTray'
import { OverlayVisibility } from './windowing/OverlayVisibility'
import { GameLogWatcher } from './host-files/GameLogWatcher'
import { HttpProxy } from './proxy'

if (!app.requestSingleInstanceLock()) {
  app.exit()
}

if (process.platform !== 'darwin') {
  app.disableHardwareAcceleration()
}
app.enableSandbox()

let tray: AppTray

app.on('ready', async () => {
  tray = new AppTray(eventPipe)
  const logger = new Logger(eventPipe)
  const gameLogWatcher = new GameLogWatcher(eventPipe, logger)
  const gameConfig = new GameConfig(eventPipe, logger)
  const poeWindow = new GameWindow()
  const appUpdater = new AppUpdater(eventPipe)
  const _httpProxy = new HttpProxy(server, logger)

  // Start the server immediately so it binds a port and is ready
  const serverPortPromise = startServer(appUpdater, logger)
  tray.setServerPortPromise(serverPortPromise)

  serverPortPromise.then((port) => {
    tray.setServerPort(port)
    logger.write(`info ${os.type()} ${os.release} / v${app.getVersion()}`)
  }).catch((err) => {
    logger.write(`error [server] Failed to start server: ${err}`)
  })

  setTimeout(
    async () => {
      const port = await serverPortPromise
      const overlay = new OverlayWindow(eventPipe, logger, poeWindow)
      new OverlayVisibility(eventPipe, overlay, gameConfig)
      const shortcuts = await Shortcuts.create(logger, overlay, poeWindow, gameConfig, eventPipe)
      eventPipe.onEventAnyClient('CLIENT->MAIN::update-host-config', (cfg) => {
        overlay.updateOpts(cfg.overlayKey, cfg.windowTitle)
        shortcuts.updateActions(cfg.shortcuts, cfg.stashScroll, cfg.logKeys, cfg.restoreClipboard, cfg.language)
        gameLogWatcher.restart(cfg.clientLog ?? '')
        gameConfig.readConfig(cfg.gameConfig ?? '')
        appUpdater.checkAtStartup()
        tray.overlayKey = cfg.overlayKey
      })
      try {
        uIOhook.start()
      } catch (err) {
        logger.write(`error [uIOhook] Failed to start: ${err}`)
      }
      overlay.loadAppPage(port)
    },
    // fixes(linux): window is black instead of transparent
    process.platform === 'linux' ? 1000 : 0
  )
})
