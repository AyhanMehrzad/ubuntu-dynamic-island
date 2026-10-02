const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Island window controls
  resizeIsland: (state, width, height) => ipcRenderer.invoke('island:resize', { state, width, height }),
  collapseIsland: () => ipcRenderer.invoke('island:collapse'),
  expandIsland: (tab) => ipcRenderer.invoke('island:expand', { tab }),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('island:set-always-on-top', flag),
  hideIsland: () => ipcRenderer.invoke('island:hide'),
  closeApp: () => ipcRenderer.invoke('island:close'),

  // System controls & agent actions
  executeCommand: (command) => ipcRenderer.invoke('system:exec-command', command),
  openUrl: (url) => ipcRenderer.invoke('system:open-url', url),
  openPath: (path) => ipcRenderer.invoke('system:open-path', path),
  launchApp: (appName) => ipcRenderer.invoke('system:launch-app', appName),
  getSystemStats: () => ipcRenderer.invoke('system:get-stats'),
  setVolume: (level) => ipcRenderer.invoke('system:set-volume', level),
  getVolume: () => ipcRenderer.invoke('system:get-volume'),
  mediaControl: (action, playerName, extra = {}) => ipcRenderer.invoke('system:media-control', { action, playerName, ...(typeof extra === 'object' ? extra : {}) }),
  seekMedia: (positionSec, playerName) => ipcRenderer.invoke('system:media-control', { action: 'seek', positionSec, playerName }),
  getMediaInfo: () => ipcRenderer.invoke('system:get-media'),
  pauseAllMedia: () => ipcRenderer.invoke('system:pause-all-media'),
  resumeAllMedia: () => ipcRenderer.invoke('system:resume-all-media'),
  snipScreen: () => ipcRenderer.invoke('system:snip-screen'),
  focusWindow: (titlePattern) => ipcRenderer.invoke('system:focus-window', titlePattern),
  typeText: (data) => ipcRenderer.invoke('system:type-text', data),
  webSearch: (query) => ipcRenderer.invoke('system:web-search', query),
  getDesktopContext: () => ipcRenderer.invoke('system:get-desktop-context'),
  setNotificationSuppress: (enabled) => ipcRenderer.invoke('system:set-notify-suppress', enabled),
  getAudioSinks: () => ipcRenderer.invoke('system:get-audio-sinks'),
  setAudioSink: (sinkId) => ipcRenderer.invoke('system:set-audio-sink', sinkId),
  
  // Display selection & sizing
  getDisplays: () => ipcRenderer.invoke('screen:get-displays'),
  setDisplay: (displayId) => ipcRenderer.invoke('screen:set-display', displayId),
  setCustomSize: (params) => ipcRenderer.invoke('island:set-custom-size', params),

  // Autostart management
  getAutostartStatus: () => ipcRenderer.invoke('autostart:get-status'),
  setAutostartStatus: (enabled) => ipcRenderer.invoke('autostart:set-status', enabled),

  // AI & External integrations
  callOpenRouter: (params) => ipcRenderer.invoke('ai:openrouter', params),
  callGemini: (params) => ipcRenderer.invoke('ai:gemini', params),
  callAvalAI: (params) => ipcRenderer.invoke('ai:avalai', params),
  transcribeAudio: (params) => ipcRenderer.invoke('ai:transcribe-audio', params),
  textToSpeech: (params) => ipcRenderer.invoke('ai:text-to-speech', params),
  speakText: (params) => ipcRenderer.invoke('system:speak-text', params),
  stopSpeaking: () => ipcRenderer.invoke('system:stop-speaking'),
  getEnvKeys: () => ipcRenderer.invoke('env:get-keys'),
  callCustomEndpoint: (params) => ipcRenderer.invoke('ai:custom', params),
  callNotion: (params) => ipcRenderer.invoke('notion:api', params),

  // Event listeners
  onToggleShortcut: (callback) => {
    ipcRenderer.on('shortcut:toggle', () => callback());
  },
  onWindowBlur: (callback) => {
    ipcRenderer.on('window:blur', () => callback());
  },
  onTestSetState: (callback) => {
    ipcRenderer.on('test:set-state', (_, state) => callback(state));
  },
  onSystemNotification: (callback) => {
    ipcRenderer.on('notification:system', (_, data) => callback(data));
  },
  onMediaChange: (callback) => {
    ipcRenderer.on('media:change', (_, data) => callback(data));
  }
});
