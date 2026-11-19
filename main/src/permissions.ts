import { dialog, shell, systemPreferences } from 'electron'
import type { Logger } from './RemoteLogger'

export type MacPermissionType = 'Accessibility' | 'Input Monitoring' | 'Screen Recording'

const SETTINGS_URLS: Record<MacPermissionType, string> = {
  'Accessibility': 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  'Input Monitoring': 'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent',
  'Screen Recording': 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
}

export class MacPermissionError extends Error {
  public readonly permissionType: MacPermissionType

  constructor (permissionType: MacPermissionType, details?: string) {
    const defaultMsg = `Missing macOS permission: ${permissionType}.\n` +
      `Awakened PoE Trade requires ${permissionType} to function properly.\n\n` +
      `How to fix:\n` +
      `1. Open System Settings → Privacy & Security → ${permissionType}\n` +
      `2. Toggle ON "Awakened PoE Trade"\n` +
      `3. Restart the application.`
    super(details ? `[PermissionError: ${permissionType}] ${details}` : `[PermissionError: ${permissionType}] ${defaultMsg}`)
    this.name = 'MacPermissionError'
    this.permissionType = permissionType
  }
}

/**
 * Shows a native dialog explaining the missing permission, opens System Settings,
 * and throws a MacPermissionError.
 */
export function handleMissingMacPermission (
  permissionType: MacPermissionType,
  contextMessage?: string,
  logger?: Logger
): never {
  const settingsUrl = SETTINGS_URLS[permissionType]
  const message = contextMessage
    ? `${contextMessage}\n\n` +
      `Missing Permission: ${permissionType}\n\n` +
      `To fix this:\n` +
      `1. Go to System Settings → Privacy & Security → ${permissionType}\n` +
      `2. Toggle ON "Awakened PoE Trade"\n` +
      `3. Restart the app.`
    : `Awakened PoE Trade requires "${permissionType}" permission to function properly.\n\n` +
      `To fix this:\n` +
      `1. Go to System Settings → Privacy & Security → ${permissionType}\n` +
      `2. Toggle ON "Awakened PoE Trade"\n` +
      `3. Restart the app.`

  if (logger) {
    logger.write(`error [Permissions] Missing ${permissionType} permission. ${contextMessage ?? ''}`)
  }

  try {
    shell.openExternal(settingsUrl)
  } catch {}

  dialog.showErrorBox(`Permission Required: ${permissionType}`, message)

  throw new MacPermissionError(permissionType, message)
}

/**
 * Checks macOS Accessibility permission.
 * Prompts macOS system dialog if prompt is true.
 */
export function assertMacAccessibility (logger?: Logger, prompt = true): void {
  if (process.platform !== 'darwin') return

  const isTrusted = systemPreferences.isTrustedAccessibilityClient(prompt)
  if (!isTrusted) {
    handleMissingMacPermission(
      'Accessibility',
      'Awakened PoE Trade needs Accessibility permission to detect the game window and register hotkeys.',
      logger
    )
  }
}

/**
 * Starts uIOhook and identifies the exact missing permission if it fails.
 */
export function startHookWithPermissionCheck (uIOhook: { start: () => void }, logger?: Logger): void {
  try {
    uIOhook.start()
  } catch (err: any) {
    if (process.platform === 'darwin') {
      const isAccessibilityTrusted = systemPreferences.isTrustedAccessibilityClient(false)
      const permissionType: MacPermissionType = !isAccessibilityTrusted
        ? 'Accessibility'
        : 'Input Monitoring'

      handleMissingMacPermission(
        permissionType,
        `Failed to start global input listener (${err?.message || err}).`,
        logger
      )
    } else {
      throw err
    }
  }
}

/**
 * Checks Screen Recording permission on macOS when taking screenshots.
 */
export function assertMacScreenRecording (logger?: Logger): void {
  if (process.platform !== 'darwin') return

  const status = systemPreferences.getMediaAccessStatus('screen')
  if (status === 'denied' || status === 'restricted') {
    handleMissingMacPermission(
      'Screen Recording',
      'Awakened PoE Trade requires Screen Recording permission to capture item tooltips or run OCR.',
      logger
    )
  }
}
