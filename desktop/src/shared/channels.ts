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
  backupCopy: 'desktop:backupCopy',
  backupPick: 'desktop:backupPick',
  openBackups: 'desktop:openBackups',
  configGet: 'desktop:configGet',
  configUpdate: 'desktop:configUpdate',
  relaunch: 'desktop:relaunch',
  cancelClose: 'desktop:cancelClose',
  backendStatus: 'desktop:backendStatus',   // main -> renderer event
  closeRequested: 'desktop:closeRequested', // main -> renderer event: the user closed the window; the page decides (exit prompt) and answers quit() or cancelClose()
  closing: 'desktop:closing',               // main -> renderer event: a backup is being made while the program closes
  error: {
    getInfo: 'error:getInfo',
    retry: 'error:retry',
    openLogs: 'error:openLogs',
    quit: 'error:quit',
  },
} as const;
