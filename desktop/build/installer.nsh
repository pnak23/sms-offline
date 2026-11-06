# KPSMS: the cleanup of electron-builder's updater copy (owner's decision of 2026-11-06). electron-builder picks this file up by default (build/installer.nsh);
# desktop/scripts/package.mjs also names it, so that a moved or renamed file stops the build instead of being ignored.
#
# WHY: electron-builder's installer copies ITSELF to %LOCALAPPDATA%\<name>-updater\installer.exe while it installs (the base file of electron-updater's differential
# updates, about 226 MB), and its uninstaller never removes it. KPSMS has no updater (no electron-updater, publish "never", no network at run time) and a school
# updates by running a newer installer, so the copy is dead weight. It is removed right after the install and again when the program is uninstalled.
#
# SAFETY (the owner's conditions, enforced by scripts/lib/installerCleanup.mjs, which desktop/test/installerCleanup.test.mjs, desktop/scripts/package.mjs and
# scripts/release-preflight.mjs all run; do not widen this file without the owner's approval):
#   * only the ONE file ${APP_INSTALLER_STORE_FILE} is deleted;
#   * its folder is removed ONLY IF IT IS EMPTY (RMDir without /r), so any other file that is there keeps the folder alive and is never touched;
#   * no recursive deletion, no wildcard, nothing under $APPDATA, $INSTDIR or the school data folder (RuralSchoolManagement), no other path, no program is started;
#   * the build STOPS (it does not guess) unless ${APP_INSTALLER_STORE_FILE} has exactly the shape electron-builder gives it today: <name>-updater\installer.exe.

!ifdef APP_INSTALLER_STORE_FILE
  # read the folder and the file name from the library's own define: "kpsms-updater\installer.exe" -> "kpsms-updater" and "installer.exe"
  !searchparse /noerrors "${APP_INSTALLER_STORE_FILE}" "" KPSMS_UPDATER_DIR "\" KPSMS_UPDATER_FILE
  !ifndef KPSMS_UPDATER_FILE
    !error "installer.nsh: APP_INSTALLER_STORE_FILE has no folder (${APP_INSTALLER_STORE_FILE})"
  !endif
  !if "${KPSMS_UPDATER_FILE}" != "installer.exe"
    !error "installer.nsh: the file is not installer.exe (${APP_INSTALLER_STORE_FILE})"
  !endif
  !searchparse /noerrors "${KPSMS_UPDATER_DIR}" "" KPSMS_UPDATER_BASE "-updater"
  !ifndef KPSMS_UPDATER_BASE
    !error "installer.nsh: the folder name is empty (${APP_INSTALLER_STORE_FILE})"
  !endif
  !if "${KPSMS_UPDATER_DIR}" != "${KPSMS_UPDATER_BASE}-updater"
    !error "installer.nsh: the folder name does not end in -updater (${APP_INSTALLER_STORE_FILE})"
  !endif

  !macro kpsmsRemoveUpdaterCopy
    Delete "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
    RMDir "$LOCALAPPDATA\${KPSMS_UPDATER_DIR}"
    ClearErrors
  !macroend

  # after the install (the copy is made while the files are installed, before this hook)
  !macro customInstall
    !insertmacro kpsmsRemoveUpdaterCopy
  !macroend

  # when the program is uninstalled (the copy of an earlier installer, which never cleaned up, goes too)
  !macro customUnInstall
    !insertmacro kpsmsRemoveUpdaterCopy
  !macroend
!endif
