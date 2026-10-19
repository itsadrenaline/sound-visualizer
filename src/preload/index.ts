/**
 * The preload script runs before the page and is the only bridge between
 * Node.js and the web page. It exposes a tiny, typed API on `window.api`
 * instead of giving the page full access to Node (which would be unsafe).
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ArtNetStatus, DmxMessage, Notice, OpenedProject, SoundSwitchStatus, VisualizerApi } from '../shared/ipc'

function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, value: T) => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: VisualizerApi = {
  platform: 'desktop',
  onDmx: (callback) => subscribe<DmxMessage>('dmx', callback),
  onArtNetStatus: (callback) => subscribe<ArtNetStatus>('artnet-status', callback),
  requestArtNetStatus: () => ipcRenderer.send('artnet-status-request'),
  onSoundSwitch: (callback) => subscribe<SoundSwitchStatus>('soundswitch', callback),
  refreshSoundSwitch: () => ipcRenderer.send('soundswitch-refresh'),
  excludeSoundSwitchFixtures: (project, keys) => ipcRenderer.send('soundswitch-exclude', project, keys),
  soundSwitchProfiles: () => ipcRenderer.invoke('soundswitch-profiles'),
  readSoundSwitchProfile: (path) => ipcRenderer.invoke('soundswitch-profile-read', path),
  browseSoundSwitchProfile: () => ipcRenderer.invoke('soundswitch-profile-browse'),
  useSoundSwitchProfile: (path) => ipcRenderer.send('soundswitch-profile-use', path),
  saveProject: (json, path, saveAs, name) => ipcRenderer.invoke('project-save', json, path, saveAs, name),
  openProject: () => ipcRenderer.invoke('project-open'),
  onProjectOpened: (callback) => subscribe<OpenedProject>('project-opened', callback),
  setTitle: (name, path, edited) => ipcRenderer.send('set-title', name, path, edited),
  saveImage: (dataUrl, name) => ipcRenderer.invoke('image-save', dataUrl, name),
  saveMedia: (name, data) => ipcRenderer.invoke('media-save', name, data),
  readMedia: (id) => ipcRenderer.invoke('media-read', id),
  loadLibrary: () => ipcRenderer.invoke('library-load'),
  importFixtureFiles: () => ipcRenderer.invoke('library-import'),
  loadQlcLibrary: () => ipcRenderer.invoke('library-qlc'),
  qlcDefinition: (key) => ipcRenderer.invoke('library-qlc-def', key),
  myFixtures: () => ipcRenderer.invoke('my-fixtures'),
  saveMyFixture: (def) => ipcRenderer.invoke('my-fixture-save', def),
  deleteMyFixture: (id) => ipcRenderer.invoke('my-fixture-delete', id),
  onMenu: (callback) => subscribe<string>('menu', callback),
  onNotice: (callback) => subscribe<Notice>('notice', callback),
  log: (level, message, detail) => ipcRenderer.send('log', level, message, detail),
  openLogs: () => ipcRenderer.send('open-logs'),
  installInfo: () => ipcRenderer.invoke('install-info'),
  aboutInfo: () => ipcRenderer.invoke('about-info'),
  freshStart: (options) => ipcRenderer.invoke('fresh-start', options),
  claudeStatus: () => ipcRenderer.invoke('claude-status'),
  setClaudeKey: (key) => ipcRenderer.invoke('claude-set-key', key),
  clearClaudeKey: () => ipcRenderer.invoke('claude-clear-key'),
  claudeRequest: (body) => ipcRenderer.invoke('claude-request', body),
  saveFile: (defaultName, filters, data) => ipcRenderer.invoke('file-save', defaultName, filters, data),
  openFile: (filters) => ipcRenderer.invoke('file-open', filters)
}

contextBridge.exposeInMainWorld('api', api)
