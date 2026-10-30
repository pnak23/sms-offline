import path from 'node:path';

/** Strips path characters so a renderer-supplied name can never escape the folder chosen in the dialog. */
export function safeFileName(name: string, extension: string): string {
  let n = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().replace(/^\.+/, '');
  if (!n) n = 'file';
  return path.extname(n).toLowerCase() === extension ? n : n + extension;
}
