# Install -> run -> uninstall -> reinstall test for the NSIS installer, using the REAL per-user locations.
# It is reversible: it refuses to run if the app, its shortcuts, its data folder or its updater folder already exist, and removes everything it creates.
# Usage: powershell -NoProfile -File scripts\test-installer.ps1 [path\to\<short name>-Setup-x.y.z.exe] [-OldInstaller] [-CheckOnly]
#   -OldInstaller : the installer is an OLDER build that predates the cleanup of electron-builder's updater copy (the stale KPSMS-Setup-1.0.0.exe of 2026-11-05). Its copy of itself in
#                   %LOCALAPPDATA%\kpsms-updater is then EXPECTED: it is reported (not failed) and removed by this script at the end, after it has proved the copy is byte for byte
#                   the installer (and the only file in the folder).
#   -CheckOnly    : installs NOTHING. It checks that this PC is in the state the test needs and prints what it would do.
# The approved cleanup (desktop/build/installer.nsh, owner's decision of 2026-11-06) is tested here on the REAL installer: no copy of the installer is left after the install, a dummy
# file of someone else in the updater folder survives the uninstall (and so does the folder), and nothing is left of the updater folder at the end.
param([string]$Installer = '', [switch]$OldInstaller, [switch]$CheckOnly)   # (param must be the first statement of a script)
$Rel = Get-Content (Join-Path $PSScriptRoot '..\release\release.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $Installer) { $Installer = Join-Path $PSScriptRoot ('..\desktop\release\' + $Rel.shortName + '-Setup-' + $Rel.version + '.exe') }
$ErrorActionPreference = 'Stop'
$Installer = (Resolve-Path $Installer).Path
$script:fail = 0
function Check($name, $ok, $detail = '') { if (-not $ok) { $script:fail++ }; '{0}  {1}{2}' -f ($(if ($ok) { 'PASS' } else { 'FAIL' })), $name, $(if ($detail) { "  - $detail" } else { '' }) }

$data = Join-Path $env:LOCALAPPDATA 'RuralSchoolManagement'
$installDir = $null   # discovered from the uninstall entry after installing (never assumed)
$desktopLnk = Join-Path ([Environment]::GetFolderPath('Desktop')) ($Rel.shortName + '.lnk')
$startLnk = Join-Path $env:APPDATA ('Microsoft\Windows\Start Menu\Programs\' + $Rel.shortName + '.lnk')
$uninstKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$updaterDir = Join-Path $env:LOCALAPPDATA ($Rel.shortName.ToLower() + '-updater')   # electron-builder's name: <package name>-updater
$updaterCopy = Join-Path $updaterDir 'installer.exe'
$dummy = Join-Path $updaterDir 'keep-me-dummy.txt'
function Find-Uninstall { Get-ChildItem $uninstKey -ErrorAction SilentlyContinue | Where-Object { (Get-ItemProperty $_.PSPath).DisplayName -like ($Rel.name + '*') } }
function Get-InstallDir { $u = Find-Uninstall; if (-not $u) { return $null }; $exe = ((Get-ItemProperty $u.PSPath).UninstallString -replace '^"([^"]+)".*$', '$1'); return (Split-Path $exe) }
# What this test touches, as names only (read-only): the top level of the folders an installer writes to, and the uninstall entries. Compared before and after.
function Get-State {
    $lines = @()
    foreach ($d in @($env:LOCALAPPDATA, $env:APPDATA, [Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'), (Join-Path $env:LOCALAPPDATA 'Programs'))) {
        Get-ChildItem $d -Force -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object { $lines += ('{0} :: {1}' -f $d, $_.Name) }
    }
    Get-ChildItem $uninstKey -ErrorAction SilentlyContinue | Sort-Object PSChildName | ForEach-Object { $lines += ('uninstall :: {0} | {1}' -f $_.PSChildName, (Get-ItemProperty $_.PSPath).DisplayName) }
    return $lines
}

$blockers = @()
if (Test-Path $data) { $blockers += "the data folder exists ($data)" }
if (Test-Path $desktopLnk) { $blockers += "the desktop shortcut exists ($desktopLnk)" }
if (Find-Uninstall) { $blockers += 'an uninstall entry for the app exists' }
if (Test-Path $updaterDir) { $blockers += "the updater folder exists ($updaterDir): tell the owner, it is not removed" }
if (Get-Process -Name $Rel.shortName -ErrorAction SilentlyContinue) { $blockers += "$($Rel.shortName).exe is running" }
if ($CheckOnly) {
    "CHECK ONLY: nothing is installed."
    "installer : $Installer ($((Get-Item $Installer).Length) bytes, SHA-256 $((Get-FileHash $Installer -Algorithm SHA256).Hash))"
    "mode      : $(if ($OldInstaller) { 'OLD installer (the updater copy is expected and is removed at the end)' } else { 'installer WITH the approved cleanup (no updater copy may remain)' })"
    "state     : $((Get-State).Count) names recorded (folders an installer writes to, uninstall entries)"
    if ($blockers.Count -gt 0) { "BLOCKED  : the test would refuse to run: " + ($blockers -join '; '); exit 3 }
    "READY     : the PC is in the state the test needs (no app, no shortcuts, no data folder, no updater folder, nothing running)."
    exit 0
}
if ($blockers.Count -gt 0) { throw ("Refusing to run: " + ($blockers -join '; ') + '.') }
$stateBefore = Get-State
$env:ELECTRON_RUN_AS_NODE = $null; Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Remove-Item Env:SMS_DATA_DIR -ErrorAction SilentlyContinue
function Wait-Log($text, $timeoutSec = 90) {
    $log = Join-Path $data 'logs\desktop.log'; $end = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $end) { if ((Test-Path $log) -and ((Get-Content $log -Raw) -match $text)) { return $true }; Start-Sleep -Milliseconds 500 }
    return $false
}
function Close-App($proc) {
    & taskkill /PID $proc.Id | Out-Null
    $end = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $end -and ((Get-Process -Id $proc.Id -ErrorAction SilentlyContinue) -or (Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object { $_.CommandLine -match [regex]::Escape($installDir) }))) { Start-Sleep -Milliseconds 500 }
    return -not ((Get-Process -Id $proc.Id -ErrorAction SilentlyContinue) -or (Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object { $_.CommandLine -match [regex]::Escape($installDir) }))
}
# Is there a copy of the installer left behind by the installer? (the approved cleanup removes it; an OLD installer leaves it, which is expected and only reported)
function Check-UpdaterCopy($label) {
    if ($OldInstaller) {
        "      INFO $label (old installer): copy of the installer in $updaterDir present = $(Test-Path $updaterCopy) (expected: this build predates the cleanup)"
    } else {
        Check "$label the install left NO copy of the installer: no installer.exe in $updaterDir and no such folder (the approved cleanup)" (-not (Test-Path $updaterCopy) -and -not (Test-Path $updaterDir))
    }
}

try {
    # ---- 1. install (silent) ----
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $p = Start-Process -FilePath $Installer -ArgumentList '/S' -PassThru -Wait
    Check '1a installer finishes without a prompt (exit 0, no admin elevation)' ($p.ExitCode -eq 0) "exit $($p.ExitCode), $([int]$sw.Elapsed.TotalSeconds) s"
    Start-Sleep -Seconds 3
    Get-Process -Name $Rel.shortName -ErrorAction SilentlyContinue | ForEach-Object { & taskkill /PID $_.Id /F | Out-Null }   # silent mode may auto-launch; we start it ourselves
    $installDir = Get-InstallDir
    Check '1b installed under %LOCALAPPDATA%\Programs (per-user, not Program Files)' ($installDir -and (Test-Path "$installDir\$($Rel.shortName).exe") -and $installDir -like "$env:LOCALAPPDATA\Programs\*") $installDir
    Check '1c desktop shortcut and Start-menu entry were created' ((Test-Path $desktopLnk) -and (Test-Path $startLnk))
    Check '1d an uninstall entry exists in the current user hive' ([bool](Find-Uninstall))
    Check '1e bundled runtime + backend + web ship inside the install folder' ((Test-Path "$installDir\resources\jre\bin\java.exe") -and (Test-Path "$installDir\resources\backend\sms-backend.jar") -and (Test-Path "$installDir\resources\web\index.html"))
    $sizeMb = [math]::Round((Get-ChildItem $installDir -Recurse -File | Measure-Object Length -Sum).Sum / 1MB)
    "      installed size on disk: $sizeMb MB"
    Check-UpdaterCopy '1f'

    # ---- 2. run from the shortcut target with NO overrides: data must go to %LOCALAPPDATA%\RuralSchoolManagement ----
    $app = Start-Process -FilePath "$installDir\$($Rel.shortName).exe" -PassThru
    $up = Wait-Log 'main window shown'
    Check '2a installed app starts (bundled JRE) and shows its window' $up
    Check '2b default data folder created with database, logs, config, uploads' ((Test-Path "$data\database\school.db") -and (Test-Path "$data\logs\backend.log") -and (Test-Path "$data\config\app.json") -and (Test-Path "$data\uploads\school"))
    Check '2c nothing user-specific was written into the install folder' (-not (Test-Path "$installDir\database") -and -not (Test-Path "$installDir\resources\database"))
    Check '2d closing the window stops the backend too' (Close-App $app)
    Set-Content -Path "$data\uploads\school\marker.txt" -Value 'user data must survive upgrades and uninstalls' -Encoding utf8
    $dbBytes = (Get-Item "$data\database\school.db").Length
    # the dummy-file test (the owner's condition): a file that is not ours, put in the updater folder, must survive the uninstall
    if (-not $OldInstaller) {
        New-Item -ItemType Directory -Path $updaterDir -Force | Out-Null
        Set-Content -Path $dummy -Value 'a dummy file that is not ours: the uninstall must not touch it' -Encoding ascii
    }

    # ---- 3. uninstall (silent): program goes, data stays ----
    $un = (Get-ItemProperty (Find-Uninstall).PSPath).UninstallString
    $exe = ($un -replace '^"([^"]+)".*$', '$1')
    $p = Start-Process -FilePath $exe -ArgumentList '/currentuser', '/S' -PassThru -Wait
    Start-Sleep -Seconds 4
    Check '3a uninstaller finishes (exit 0)' ($p.ExitCode -eq 0) "exit $($p.ExitCode)"
    Check '3b install folder, shortcuts and uninstall entry are gone' (-not (Test-Path $installDir) -and -not (Test-Path $desktopLnk) -and -not (Test-Path $startLnk) -and -not (Find-Uninstall))
    Check '3c USER DATA SURVIVES the uninstall (database, uploads marker, logs)' ((Test-Path "$data\database\school.db") -and ((Get-Item "$data\database\school.db").Length -eq $dbBytes) -and (Test-Path "$data\uploads\school\marker.txt") -and (Test-Path "$data\logs\desktop.log"))
    if ($OldInstaller) {
        "      INFO 3d (old installer): copy of the installer in $updaterDir present after the uninstall = $(Test-Path $updaterCopy) (expected: the old uninstaller never removed it)"
    } else {
        Check '3d the DUMMY FILE of someone else in the updater folder is preserved by the uninstall' (Test-Path $dummy)
        Check '3e ...the folder is kept while it holds that file, and no copy of the installer is in it' ((Test-Path $updaterDir) -and -not (Test-Path $updaterCopy))
        # the test removes its own dummy file and the then empty folder (no recursion: the .NET call refuses a folder that is not empty)
        Remove-Item -LiteralPath $dummy -Force
        [IO.Directory]::Delete($updaterDir)
    }

    # ---- 4. reinstall over the existing data ----
    $p = Start-Process -FilePath $Installer -ArgumentList '/S' -PassThru -Wait
    Start-Sleep -Seconds 3
    Get-Process -Name $Rel.shortName -ErrorAction SilentlyContinue | ForEach-Object { & taskkill /PID $_.Id /F | Out-Null }
    $installDir = Get-InstallDir
    Check '4a reinstall works on top of existing user data' ($p.ExitCode -eq 0 -and $installDir -and (Test-Path "$installDir\$($Rel.shortName).exe"))
    $before = (Get-Content "$data\logs\desktop.log" -Raw).Length
    $app = Start-Process -FilePath "$installDir\$($Rel.shortName).exe" -PassThru
    $end = (Get-Date).AddSeconds(90); $ok = $false
    while ((Get-Date) -lt $end -and -not $ok) { Start-Sleep -Milliseconds 500; $ok = (Get-Content "$data\logs\desktop.log" -Raw).Substring($before) -match 'main window shown' }
    Check '4b the reinstalled app opens the existing database' $ok
    Check '4c ...and the marker file is still there' (Test-Path "$data\uploads\school\marker.txt")
    Check '4d closing it again stops the backend' (Close-App $app)
    Check-UpdaterCopy '4e'
}
finally {
    Get-Process -Name $Rel.shortName -ErrorAction SilentlyContinue | ForEach-Object { & taskkill /PID $_.Id /F /T | Out-Null }
    $u = Find-Uninstall
    if ($u) { $un = (Get-ItemProperty $u.PSPath).UninstallString; $exe = ($un -replace '^"([^"]+)".*$', '$1'); Start-Process -FilePath $exe -ArgumentList '/currentuser', '/S' -Wait; Start-Sleep -Seconds 4 }
    if (Test-Path $data) { Remove-Item $data -Recurse -Force -ErrorAction SilentlyContinue }   # we created it (the script refused to run otherwise)
    "cleanup: app removed = $(-not (Find-Uninstall) -and -not (Test-Path $desktopLnk)); data folder removed = $(-not (Test-Path $data))"
    # the updater folder: an OLD installer leaves its copy of itself; remove it ONLY after proving it is the installer we ran and the only file in the folder
    if ($OldInstaller -and (Test-Path $updaterCopy)) {
        $same = (Get-FileHash $updaterCopy -Algorithm SHA256).Hash -eq (Get-FileHash $Installer -Algorithm SHA256).Hash
        $only = @(Get-ChildItem $updaterDir -Force).Count -eq 1
        if ($same -and $only) { Remove-Item -LiteralPath $updaterCopy -Force; [IO.Directory]::Delete($updaterDir); "cleanup: the old installer's copy of itself was removed (byte for byte the installer, the only file in the folder)" }
        else { "NOTE: $updaterDir was left in place (same as the installer = $same, only file = $only): tell the owner" }
    }
    Check '5a nothing is left of the updater folder at the end' (-not (Test-Path $updaterDir))
    # the PC compared with its state before: nothing of ours may be left, and nothing else may have changed because of us
    $diff = @(Compare-Object $stateBefore (Get-State))
    $ours = @($diff | Where-Object { $_.InputObject -match 'kpsms|KPSMS|RuralSchool|Khmer Primary' })
    $others = @($diff | Where-Object { $_.InputObject -notmatch 'kpsms|KPSMS|RuralSchool|Khmer Primary' })
    Check '5b the PC is as it was before the test (no name of ours left or removed in the folders an installer writes to, or in the uninstall entries)' ($ours.Count -eq 0) (($ours | ForEach-Object { '{0} {1}' -f $_.SideIndicator, $_.InputObject }) -join '; ')
    if ($others.Count -gt 0) { "      NOTE: other names changed while the test ran (other programs at work, not ours): " + (($others | ForEach-Object { '{0} {1}' -f $_.SideIndicator, $_.InputObject }) -join '; ') }
}
"`n$(if ($script:fail -eq 0) { 'ALL CHECKS PASSED' } else { "$($script:fail) CHECK(S) FAILED" })"
exit $script:fail
