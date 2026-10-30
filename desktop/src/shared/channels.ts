/** The complete list of IPC channels. There is deliberately no generic "invoke any channel" escape hatch. */
export const CH = {
  getInfo: 'desktop:getInfo',
  restartBackend: 'desktop:restartBackend',
  print: 'desktop:print',
  savePdf: 'desktop:savePdf',
  saveFile: 'desktop:saveFile',
  printers: 'desktop:printers',
  metrics: 'desktop:metrics',
  exportDiagnostics: 'desktop:exportDiagnostics',
  openLogs: 'desktop:openLogs',
  quit: 'desktop:quit',
  backendStatus: 'desktop:backendStatus',   // main -> renderer event
  error: {
    getInfo: 'error:getInfo',
    retry: 'error:retry',
    openLogs: 'error:openLogs',
    quit: 'error:quit',
  },
} as const;
