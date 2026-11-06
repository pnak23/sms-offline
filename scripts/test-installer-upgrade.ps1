# UPGRADE test of the NSIS installer with the REAL per-user locations (Phase 6, steps 5 and 6; approved by the owner on 2026-11-06 with BOTH installers at version 1.0.0):
#   install the OLD installer -> run the OLD program (first-run wizard, one pupil, normal quit) -> run the NEW installer OVER the existing install -> run the NEW program on the same data
#   (it opens the data, the migration runs after a PRE_MIGRATION backup, the pupil is still there) -> uninstall -> nothing of ours is left.
# What it does NOT prove: both installers say 1.0.0 (only the database schema differs: 9 -> 10), so this is NOT a test of a version-number upgrade.
# It is reversible: it refuses to run if the app, its shortcuts, its data folder or its updater folder already exist, and removes everything it creates.
# Usage: powershell -NoProfile -File scripts\test-installer-upgrade.ps1 -Old <old installer.exe> -New <new installer.exe> [-OldSha256 <hash>] [-CheckOnly]
#   -Old       the older installer. It must be the STALE KPSMS-Setup-1.0.0.exe of 2026-11-05 (schema 9): keep a copy of it BEFORE the final build, which writes a file with the same name.
#   -OldSha256 the SHA-256 the older installer must have (default: the stale installer's). The test refuses to run if it differs, so the wrong "old" can never be used.
#   -CheckOnly installs NOTHING: checks the PC and the two installers and prints what it would do.
# Needs Node (it runs desktop\test\e2e-upgrade.mjs, which drives the installed program).
param([Parameter(Mandatory = $true)][string]$Old, [Parameter(Mandatory = $true)][string]$New, [string]$OldSha256 = '6060961b6472b15226375083e8182e93873b41fd2e459efe95f0c2b480bc7a5b', [switch]$CheckOnly)
$Rel = Get-Content (Join-Path $PSScriptRoot '..\release\release.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$ErrorActionPreference = 'Stop'
$Old = (Resolve-Path $Old).Path
$New = (Resolve-Path $New).Path
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$helper = Join-Path $repo 'desktop\test\e2e-upgrade.mjs'
$script:fail = 0
function Check($name, $ok, $detail = '') { if (-not $ok) { $script:fail++ }; '{0}  {1}{2}' -f ($(if ($ok) { 'PASS' } else { 'FAIL' })), $name, $(if ($detail) { "  - $detail" } else { '' }) }

$data = Join-Path $env:LOCALAPPDATA 'RuralSchoolManagement'
$installDir = $null
$desktopLnk = Join-Path ([Environment]::GetFolderPath('Desktop')) ($Rel.shortName + '.lnk')
$startLnk = Join-Path $env:APPDATA ('Microsoft\Windows\Start Menu\Programs\' + $Rel.shortName + '.lnk')
$uninstKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$updaterDir = Join-Path $env:LOCALAPPDATA ($Rel.shortName.ToLower() + '-updater')
$updaterCopy = Join-Path $updaterDir 'installer.exe'
$facts = Join-Path $env:TEMP ('kpsms-upgrade-facts-' + [guid]::NewGuid().ToString('N') + '.json')
function Find-Uninstall { Get-ChildItem $uninstKey -ErrorAction SilentlyContinue | Where-Object { (Get-ItemProperty $_.PSPath).DisplayName -like ($Rel.name + '*') } }
function Get-InstallDir { $u = Find-Uninstall | Select-Object -First 1; if (-not $u) { return $null }; $exe = ((Get-ItemProperty $u.PSPath).UninstallString -replace '^"([^"]+)".*$', '$1'); return (Split-Path $exe) }
function Get-State {
    $lines = @()
    foreach ($d in @($env:LOCALAPPDATA, $env:APPDATA, [Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'), (Join-Path $env:LOCALAPPDATA 'Programs'))) {
        Get-ChildItem $d -Force -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object { $lines += ('{0} :: {1}' -f $d, $_.Name) }
    }
    Get-ChildItem $uninstKey -ErrorAction SilentlyContinue | Sort-Object PSChildName | ForEach-Object { $lines += ('uninstall :: {0} | {1}' -f $_.PSChildName, (Get-ItemProperty $_.PSPath).DisplayName) }
    return $lines
}
function Sha($file) { (Get-FileHash $file -Algorithm SHA256).Hash.ToLower() }
function Run-Helper($mode, $exe) {
    $node = (Get-Command node -ErrorAction Stop).Source
    $out = Join-Path $env:TEMP 'kpsms-upgrade-helper-out.txt'; $err = Join-Path $env:TEMP 'kpsms-upgrade-helper-err.txt'
    $argList = @("`"$helper`"", $mode, "`"$exe`"", '--facts', "`"$facts`"")
    $p = Start-Process -FilePath $node -ArgumentList $argList -NoNewWindow -Wait -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
    Get-Content $out -Encoding UTF8 | ForEach-Object { "      | $_" }
    if ((Get-Item $err).Length -gt 0) { Get-Content $err -Encoding UTF8 | Select-Object -First 8 | ForEach-Object { "      | (stderr) $_" } }
    Remove-Item $out, $err -Force -ErrorAction SilentlyContinue
    return $p.ExitCode
}

$blockers = @()
if (Test-Path $data) { $blockers += "the data folder exists ($data)" }
if (Test-Path $desktopLnk) { $blockers += "the desktop shortcut exists ($desktopLnk)" }
if (Find-Uninstall) { $blockers += 'an uninstall entry for the app exists' }
if (Test-Path $updaterDir) { $blockers += "the updater folder exists ($updaterDir): tell the owner, it is not removed" }
if (Get-Process -Name $Rel.shortName -ErrorAction SilentlyContinue) { $blockers += "$($Rel.shortName).exe is running" }
if ((Sha $Old) -ne $OldSha256.ToLower()) { $blockers += "the OLD installer is not the expected one (SHA-256 $(Sha $Old), expected $OldSha256)" }
if ((Sha $Old) -eq (Sha $New)) { $blockers += 'the OLD and the NEW installer are the same file' }
if (-not (Test-Path $helper)) { $blockers += "missing $helper" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { $blockers += 'Node is not on the path' }
if ($CheckOnly) {
    "CHECK ONLY: nothing is installed."
    "old installer: $Old ($((Get-Item $Old).Length) bytes, SHA-256 $(Sha $Old))"
    "new installer: $New ($((Get-Item $New).Length) bytes, SHA-256 $(Sha $New))"
    "plan: install OLD -> run it (wizard, one pupil, quit) -> install NEW over it -> run NEW on the same data (migration, backup before it, data kept) -> uninstall -> compare the PC with its state before"
    if ($blockers.Count -gt 0) { "BLOCKED: the test would refuse to run: " + ($blockers -join '; '); exit 3 }
    "READY: the PC and the installers are in the state the test needs."
    exit 0
}
if ($blockers.Count -gt 0) { throw ("Refusing to run: " + ($blockers -join '; ') + '.') }
$stateBefore = Get-State
$env:ELECTRON_RUN_AS_NODE = $null; Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Remove-Item Env:SMS_DATA_DIR -ErrorAction SilentlyContinue

try {
    # ---- 1. the OLD installer, then the OLD program on a fresh data folder ----
    $p = Start-Process -FilePath $Old -ArgumentList '/S' -PassThru -Wait
    Check 'U1a the OLD installer finishes (exit 0, no prompt)' ($p.ExitCode -eq 0) "exit $($p.ExitCode)"
    Start-Sleep -Seconds 3
    Get-Process -Name $Rel.shortName -ErrorAction SilentlyContinue | ForEach-Object { & taskkill /PID $_.Id /F | Out-Null }
    $installDir = Get-InstallDir
    Check 'U1b the old program is installed per user under %LOCALAPPDATA%\Programs' ($installDir -and (Test-Path "$installDir\$($Rel.shortName).exe") -and $installDir -like "$env:LOCALAPPDATA\Programs\*") $installDir
    $oldJar = Sha "$installDir\resources\backend\sms-backend.jar"
    $oldExe = Sha "$installDir\$($Rel.shortName).exe"
    "      INFO (the old installer predates the cleanup): copy of the installer in $updaterDir present = $(Test-Path $updaterCopy)"
    "      the OLD program is started on a fresh data folder (no overrides: its own default folder):"
    $code = Run-Helper 'seed' "$installDir\$($Rel.shortName).exe"
    Check 'U1c the old program set up a school through its wizard, recorded a pupil, reported its schema, and quit normally (e2e-upgrade seed)' ($code -eq 0) "exit $code"
    $dbBefore = Sha "$data\database\school.db"

    # ---- 2. the NEW installer OVER the existing install ----
    $p = Start-Process -FilePath $New -ArgumentList '/S' -PassThru -Wait
    Check 'U2a the NEW installer runs over the existing install and finishes (exit 0, no prompt)' ($p.ExitCode -eq 0) "exit $($p.ExitCode)"
    Start-Sleep -Seconds 3
    Get-Process -Name $Rel.shortName -ErrorAction SilentlyContinue | ForEach-Object { & taskkill /PID $_.Id /F | Out-Null }
    $installDir2 = Get-InstallDir
    Check 'U2b it is still ONE installation in the same place (one uninstall entry, the same folder)' (@(Find-Uninstall).Count -eq 1 -and $installDir2 -eq $installDir) "$installDir2"
    Check 'U2c the program files were REPLACED by the new build (the backend jar and the exe differ from the old ones)' ((Sha "$installDir\resources\backend\sms-backend.jar") -ne $oldJar -and (Sha "$installDir\$($Rel.shortName).exe") -ne $oldExe)
    Check 'U2d the shortcuts are still there' ((Test-Path $desktopLnk) -and (Test-Path $startLnk))
    Check 'U2e the installer itself did not touch the data: the database file is byte for byte what the old program left' ((Sha "$data\database\school.db") -eq $dbBefore)
    Check 'U2f the new installer left no copy of itself (the approved cleanup also removes the old installer''s copy)' (-not (Test-Path $updaterCopy) -and -not (Test-Path $updaterDir))

    # ---- 3. the NEW program on the same data ----
    "      the NEW program is started on the old program's data:"
    $code = Run-Helper 'verify' "$installDir\$($Rel.shortName).exe"
    Check 'U3 the new program opened the data, kept the pupil, ran the migration after a PRE_MIGRATION backup of the old schema, and quit normally (e2e-upgrade verify)' ($code -eq 0) "exit $code"
    $dataSize = (Get-Item "$data\database\school.db").Length

    # ---- 4. uninstall: the program goes, the data stays ----
    $un = (Get-ItemProperty (Find-Uninstall | Select-Object -First 1).PSPath).UninstallString
    $exe = ($un -replace '^"([^"]+)".*$', '$1')
    $p = Start-Process -FilePath $exe -ArgumentList '/currentuser', '/S' -PassThru -Wait
    Start-Sleep -Seconds 4
    Check 'U4a the uninstaller finishes (exit 0)' ($p.ExitCode -eq 0) "exit $($p.ExitCode)"
    Check 'U4b the install folder, the shortcuts and the uninstall entry are gone' (-not (Test-Path $installDir) -and -not (Test-Path $desktopLnk) -and -not (Test-Path $startLnk) -and -not (Find-Uninstall))
    Check 'U4c USER DATA SURVIVES the uninstall (the database is still there)' ((Test-Path "$data\database\school.db") -and ((Get-Item "$data\database\school.db").Length -eq $dataSize))
}
finally {
    Get-Process -Name $Rel.shortName -ErrorAction SilentlyContinue | ForEach-Object { & taskkill /PID $_.Id /F /T | Out-Null }
    $u = Find-Uninstall | Select-Object -First 1
    if ($u) { $un = (Get-ItemProperty $u.PSPath).UninstallString; $exe = ($un -replace '^"([^"]+)".*$', '$1'); Start-Process -FilePath $exe -ArgumentList '/currentuser', '/S' -Wait; Start-Sleep -Seconds 4 }
    if (Test-Path $data) { Remove-Item $data -Recurse -Force -ErrorAction SilentlyContinue }   # we created it (the script refused to run otherwise)
    Remove-Item $facts -Force -ErrorAction SilentlyContinue
    "cleanup: app removed = $(-not (Find-Uninstall) -and -not (Test-Path $desktopLnk)); data folder removed = $(-not (Test-Path $data))"
    # an updater copy left by an installer: remove it ONLY after proving it is one of the two installers we ran and the only file in the folder
    if (Test-Path $updaterCopy) {
        $h = Sha $updaterCopy
        $known = ($h -eq (Sha $Old)) -or ($h -eq (Sha $New))
        $only = @(Get-ChildItem $updaterDir -Force).Count -eq 1
        if ($known -and $only) { Remove-Item -LiteralPath $updaterCopy -Force; [IO.Directory]::Delete($updaterDir); "cleanup: a copy of one of the two installers was left in the updater folder and was removed (byte for byte the installer, the only file there)" }
        else { "NOTE: $updaterDir was left in place (one of our installers = $known, only file = $only): tell the owner" }
    }
    Check 'U5a nothing is left of the updater folder at the end' (-not (Test-Path $updaterDir))
    $diff = @(Compare-Object $stateBefore (Get-State))
    $ours = @($diff | Where-Object { $_.InputObject -match 'kpsms|KPSMS|RuralSchool|Khmer Primary' })
    $others = @($diff | Where-Object { $_.InputObject -notmatch 'kpsms|KPSMS|RuralSchool|Khmer Primary' })
    Check 'U5b the PC is as it was before the test (no name of ours left or removed in the folders an installer writes to, or in the uninstall entries)' ($ours.Count -eq 0) (($ours | ForEach-Object { '{0} {1}' -f $_.SideIndicator, $_.InputObject }) -join '; ')
    if ($others.Count -gt 0) { "      NOTE: other names changed while the test ran (other programs at work, not ours): " + (($others | ForEach-Object { '{0} {1}' -f $_.SideIndicator, $_.InputObject }) -join '; ') }
}
"      NOT PROVEN: both installers carry version $($Rel.version) (only the database schema differs), so this does not test a version-number upgrade."
"`n$(if ($script:fail -eq 0) { 'ALL CHECKS PASSED' } else { "$($script:fail) CHECK(S) FAILED" })"
exit $script:fail
