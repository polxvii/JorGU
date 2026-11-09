// English UI strings (default). Every visible string lives here or in th.ts (spec §12.3).
export const en = {
  'app.name': 'JorGu',

  'apps.dashboard': 'Dashboard',
  'apps.map': 'Map',
  'apps.youtube': 'YouTube',
  'apps.web': 'Web',

  'pane.change': 'Change',
  'pane.fullscreen': 'Full screen',
  'pane.left': 'left pane',
  'pane.right': 'right pane',
  'pane.dragToSwap': 'Drag onto the other pane to swap',
  'pane.showHeader': 'Show pane controls',

  'dock.label': 'Dock',
  'dock.home': 'Home',
  'dock.swap': 'Swap',
  'dock.split': 'Two panes',
  'dock.single': 'One pane',
  'dock.settings': 'Settings',

  'divider.label': 'Resize panes',

  'fs.exit': 'Exit full screen',
  'fs.switch': 'Switch app',
  'fs.picker': 'Choose app',
  'fs.showControls': 'Show controls',

  'picker.title': 'Choose app for the {side}',
  'picker.titleFullscreen': 'Choose full-screen app',
  'picker.bookmarks': 'Bookmarks',
  'picker.current': 'Showing now',

  'sheet.close': 'Close',

  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.languageEn': 'English',
  'settings.languageTh': 'ไทย',
  'settings.theme': 'Theme',
  'settings.driverSide': 'Driver side',
  'settings.driverRight': 'Right (Thailand)',
  'settings.driverLeft': 'Left',
  'settings.nightMode': 'Night mode',
  'settings.nightAuto': 'Automatic by time',
  'settings.nightOff': 'Off',
  'settings.nightStart': 'Starts',
  'settings.nightEnd': 'Ends',
  'settings.miniPlayer': 'Mini player size',
  'settings.reset': 'Reset settings',
  'settings.resetConfirm': 'Tap again to reset everything',
  'settings.version': 'Version {version}',

  'theme.carbon': 'Carbon Sport',
  'theme.racing': 'Racing M-Sport',
  'theme.neon': 'Cyberpunk Neon',
  'theme.emerald': 'Eco Emerald',
  'theme.amber': 'Classic Amber HUD',
  'theme.stealth': 'Stealth Matte Black',

  'banner.offline': 'Offline · Video, maps, and websites need an internet connection',
  'banner.update': 'New version available',
  'banner.reload': 'Reload',

  'placeholder.dashboard': 'Speed, clock, and alerts arrive in a later version',
  'placeholder.map': 'Google Maps arrives in a later version',
  'placeholder.web': 'Websites arrive in a later version',
  'placeholder.youtube': 'YouTube player arrives in the next version',
  'placeholder.webNewTab': 'New tab',

  'yt.prev': 'Previous',
  'yt.play': 'Play',
  'yt.pause': 'Pause',
  'yt.next': 'Next',
  'yt.simulated': 'Test playback (simulated)',
  'yt.nothingPlaying': 'Nothing playing',

  'mini.restore': 'Show YouTube',
  'mini.dismiss': 'Hide mini player',
} as const;

export type MessageKey = keyof typeof en;
