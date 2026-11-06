# Install -> run -> uninstall -> reinstall test for the NSIS installer, using the REAL per-user locations.
# It is reversible: it refuses to run if the app or its data folder already exist, and removes everything it creates.
# Usage: powershell -NoProfile -File scripts\test-installer.ps1 [path\to\<short name>-Setup-x.y.z.exe]
param([string]$Installer = '')   # (param must be the first statement of a script)
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
function Find-Uninstall { Get-ChildItem $uninstKey -ErrorAction SilentlyContinue | Where-Object { (Get-ItemProperty $_.PSPath).DisplayName -like ($Rel.name + '*') } }
function Get-InstallDir { $u = Find-Uninstall; if (-not $u) { return $null }; $exe = ((Get-ItemProperty $u.PSPath).UninstallString -replace '^"([^"]+)".*$', '$1'); return (Split-Path $exe) }

if ((Test-Path $data) -or (Test-Path $desktopLnk) -or (Find-Uninstall)) {
    throw "Refusing to run: the app, its shortcuts or its data folder already exist on this PC ($data)."
}
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

    # ---- 2. run from the shortcut target with NO overrides: data must go to %LOCALAPPDATA%\RuralSchoolManagement ----
    $app = Start-Process -FilePath "$installDir\$($Rel.shortName).exe" -PassThru
    $up = Wait-Log 'main window shown'
    Check '2a installed app starts (bundled JRE) and shows its window' $up
    Check '2b default data folder created with database, logs, config, uploads' ((Test-Path "$data\database\school.db") -and (Test-Path "$data\logs\backend.log") -and (Test-Path "$data\config\app.json") -and (Test-Path "$data\uploads\school"))
    Check '2c nothing user-specific was written into the install folder' (-not (Test-Path "$installDir\database") -and -not (Test-Path "$installDir\resources\database"))
    Check '2d closing the window stops the backend too' (Close-App $app)
    Set-Content -Path "$data\uploads\school\marker.txt" -Value 'user data must survive upgrades and uninstalls' -Encoding utf8
    $dbBytes = (Get-Item "$data\database\school.db").Length

    # ---- 3. uninstall (silent): program goes, data stays ----
    $un = (Get-ItemProperty (Find-Uninstall).PSPath).UninstallString
    $exe = ($un -replace '^"([^"]+)".*$', '$1')
    $p = Start-Process -FilePath $exe -ArgumentList '/currentuser', '/S' -PassThru -Wait
    Start-Sleep -Seconds 4
    Check '3a uninstaller finishes (exit 0)' ($p.ExitCode -eq 0) "exit $($p.ExitCode)"
    Check '3b install folder, shortcuts and uninstall entry are gone' (-not (Test-Path $installDir) -and -not (Test-Path $desktopLnk) -and -not (Test-Path $startLnk) -and -not (Find-Uninstall))
    Check '3c USER DATA SURVIVES the uninstall (database, uploads marker, logs)' ((Test-Path "$data\database\school.db") -and ((Get-Item "$data\database\school.db").Length -eq $dbBytes) -and (Test-Path "$data\uploads\school\marker.txt") -and (Test-Path "$data\logs\desktop.log"))

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
}
finally {
    Get-Process -Name $Rel.shortName -ErrorAction SilentlyContinue | ForEach-Object { & taskkill /PID $_.Id /F /T | Out-Null }
    $u = Find-Uninstall
    if ($u) { $un = (Get-ItemProperty $u.PSPath).UninstallString; $exe = ($un -replace '^"([^"]+)".*$', '$1'); Start-Process -FilePath $exe -ArgumentList '/currentuser', '/S' -Wait; Start-Sleep -Seconds 4 }
    if (Test-Path $data) { Remove-Item $data -Recurse -Force -ErrorAction SilentlyContinue }   # we created it (the script refused to run otherwise)
    "cleanup: app removed = $(-not (Find-Uninstall) -and -not (Test-Path $desktopLnk)); data folder removed = $(-not (Test-Path $data))"
}
"`n$(if ($script:fail -eq 0) { 'ALL CHECKS PASSED' } else { "$($script:fail) CHECK(S) FAILED" })"
exit $script:fail
