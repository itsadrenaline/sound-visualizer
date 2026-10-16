/**
 * Opening and saving files in the browser.
 *
 * Chrome and Edge have the File System Access API: real Open and Save dialogs,
 * and a file you saved can be saved again in place. Safari and Firefox don't, so
 * Open uses a file input and Save downloads the file (to the Downloads folder).
 */
export interface FileFilter {
  name: string
  extensions: string[]
}

// The parts of the File System Access API used here (not in TypeScript's DOM types yet).
interface WritableFile {
  write(data: Blob | BufferSource | string): Promise<void>
  close(): Promise<void>
}
export interface FileHandle {
  kind: 'file'
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<WritableFile>
}
export interface DirectoryHandle {
  kind: 'directory'
  name: string
  getFileHandle(name: string): Promise<FileHandle>
  values(): AsyncIterable<FileHandle | DirectoryHandle>
  queryPermission(options?: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission(options?: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}
type PickerTypes = Array<{ description: string; accept: Record<string, string[]> }>
interface Pickers {
  showOpenFilePicker?(options: { types?: PickerTypes; multiple?: boolean; id?: string }): Promise<FileHandle[]>
  showSaveFilePicker?(options: { suggestedName?: string; types?: PickerTypes; id?: string }): Promise<FileHandle>
  showDirectoryPicker?(options?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }): Promise<DirectoryHandle>
}
export const pickers = window as unknown as Pickers

export const canSaveInPlace = typeof pickers.showSaveFilePicker === 'function'
export const canPickFolders = typeof pickers.showDirectoryPicker === 'function'

const MIME: Record<string, string> = { json: 'application/json', png: 'image/png', csv: 'text/csv', mvr: 'application/zip', ssvis: 'application/json', svfixture: 'application/json', gdtf: 'application/zip', qxf: 'application/xml' }

function types(filters: FileFilter[]): PickerTypes {
  return filters.map((f) => ({ description: f.name, accept: { [MIME[f.extensions[0]] ?? 'application/octet-stream']: f.extensions.map((e) => `.${e}`) } }))
}

/** Cancelled dialogs throw AbortError: that's "nothing picked", not a failure. */
const cancelled = (error: unknown) => (error as DOMException)?.name === 'AbortError'

/** Pick files with a plain file input (every browser). Resolves with [] if nothing is picked. */
export function inputFiles(filters: FileFilter[], multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = multiple
    input.accept = filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',')
    input.addEventListener('change', () => resolve([...(input.files ?? [])]))
    input.addEventListener('cancel', () => resolve([]))
    input.click()
  })
}

export async function pickFiles(filters: FileFilter[], multiple = false): Promise<Array<{ file: File; handle?: FileHandle }>> {
  if (pickers.showOpenFilePicker) {
    try {
      const handles = await pickers.showOpenFilePicker({ types: types(filters), multiple, id: filters[0]?.extensions[0] })
      return Promise.all(handles.map(async (handle) => ({ file: await handle.getFile(), handle })))
    } catch (error) {
      if (cancelled(error)) return []
      throw error
    }
  }
  return (await inputFiles(filters, multiple)).map((file) => ({ file }))
}

/** Save data: in place when `handle` is given, else asks where. Returns the handle (or the downloaded name), or null if cancelled. */
export async function saveData(name: string, filters: FileFilter[], data: Blob, handle?: FileHandle | null): Promise<{ name: string; handle?: FileHandle } | null> {
  if (pickers.showSaveFilePicker) {
    try {
      const target = handle ?? (await pickers.showSaveFilePicker({ suggestedName: name, types: types(filters), id: filters[0]?.extensions[0] }))
      const writable = await target.createWritable()
      await writable.write(data)
      await writable.close()
      return { name: target.name, handle: target }
    } catch (error) {
      if (cancelled(error)) return null
      throw error
    }
  }
  download(name, data)
  return { name }
}

export function download(name: string, data: Blob): void {
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function safeName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '-').trim() || 'Untitled'
}
