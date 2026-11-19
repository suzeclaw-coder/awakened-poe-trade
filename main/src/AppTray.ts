import path from 'path'
import { app, Tray, Menu, shell, nativeImage, dialog } from 'electron'
import type { ServerEvents } from './server'

export class AppTray {
  private _overlayKey = 'Shift + Space'
  private tray: Tray
  public serverPort = 0
  private serverPortPromise?: Promise<number>

  get overlayKey () { return this._overlayKey }
  set overlayKey (key: string) {
    if (this._overlayKey !== key) {
      this._overlayKey = key
      this.rebuildMenu()
    }
  }

  setServerPortPromise (promise: Promise<number>) {
    this.serverPortPromise = promise
  }

  setServerPort (port: number) {
    this.serverPort = port
    this.rebuildMenu()
  }

  constructor (server: ServerEvents) {
    let trayImage = nativeImage.createFromPath(
      path.join(
        __dirname,
        process.env.STATIC!,
        process.platform === "win32" ? "icon.ico" : "icon.png"
      )
    )

    if (process.platform === 'darwin') {
      // Mac image size needs to be smaller, or else it looks huge. Size
      // guideline is from https://iconhandbook.co.uk/reference/chart/osx/
      trayImage = trayImage.resize({ width: 22, height: 22 })
    }

    this.tray = new Tray(trayImage)
    this.tray.setToolTip(`Awakened PoE Trade v${app.getVersion()}`)
    this.rebuildMenu()

    server.onEventAnyClient('CLIENT->MAIN::user-action', ({ action }) => {
      if (action === 'quit') {
        app.quit()
      }
    })
  }

  rebuildMenu () {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Settings/League',
        click: () => {
          dialog.showMessageBox({
            title: 'Settings',
            message: `Open Path of Exile and press "${this.overlayKey}". Click on the button with cog icon there.`
          })
        }
      },
      {
        label: 'Open in Browser',
        click: async () => {
          if (!this.serverPort && this.serverPortPromise) {
            try {
              this.serverPort = await this.serverPortPromise
            } catch {}
          }

          if (this.serverPort) {
            shell.openExternal(`http://localhost:${this.serverPort}`)
          } else {
            dialog.showMessageBox({
              type: 'info',
              title: 'Awakened PoE Trade',
              message: 'The local server is still starting up. Please try again in a moment.'
            })
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Open config folder',
        click: () => {
          shell.openPath(path.join(app.getPath('userData'), 'apt-data'))
        }
      },
      {
        label: 'Quit',
        click: () => {
          app.quit()
        }
      }
    ])

    this.tray.setContextMenu(contextMenu)
  }
}
