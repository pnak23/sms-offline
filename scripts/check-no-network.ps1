# Does the packaged app talk to anything but itself? Starts it, then for N seconds samples every TCP connection and UDP endpoint
# owned by its processes (Electron + children + bundled java.exe) and diffs the Windows DNS cache.
# Usage: powershell -NoProfile -File scripts\check-no-network.ps1 [-Exe path\<short name>.exe] [-Seconds 60]
param([string]$Exe = (Join-Path $PSScriptRoot ('..\desktop\release\win-unpacked\' + (Get-Content (Join-Path $PSScriptRoot '..\release\release.json') -Raw -Encoding UTF8 | ConvertFrom-Json).shortName + '.exe')), [int]$Seconds = 60)
$Exe = (Resolve-Path $Exe).Path
$appDir = (Split-Path $Exe).ToLower()
$data = Join-Path $env:TEMP ('sms-net-' + [guid]::NewGuid().ToString('N').Substring(0, 8)); New-Item -ItemType Directory $data | Out-Null
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:SMS_DATA_DIR = $data
$dnsBefore = @(Get-DnsClientCache -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Entry)
$p = Start-Process -FilePath $Exe -PassThru
$log = Join-Path $data 'logs\desktop.log'; $end = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $end -and -not ((Test-Path $log) -and ((Get-Content $log -Raw) -match 'main window shown'))) { Start-Sleep -Milliseconds 500 }
"app is up; sampling for $Seconds s..."
$remotes = @{}; $listening = @{}; $udp = @{}; $samples = 0
$until = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $until) {
    $pids = @(Get-Process | Where-Object { $_.Path -and $_.Path.ToLower().StartsWith($appDir) } | Select-Object -ExpandProperty Id)
    foreach ($c in (Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $pids -contains $_.OwningProcess })) {
        if ($c.State -eq 'Listen') { $listening["$($c.LocalAddress):$($c.LocalPort)"] = 1 }
        else { $remotes["$($c.RemoteAddress):$($c.RemotePort) ($($c.State))"] = 1 }
    }
    foreach ($u in (Get-NetUDPEndpoint -ErrorAction SilentlyContinue | Where-Object { $pids -contains $_.OwningProcess })) { $udp["$($u.LocalAddress):$($u.LocalPort)"] = 1 }
    $samples++; Start-Sleep -Seconds 2
}
$dnsAfter = @(Get-DnsClientCache -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Entry)
$newDns = $dnsAfter | Where-Object { $dnsBefore -notcontains $_ }
& taskkill /PID $p.Id | Out-Null; Start-Sleep -Seconds 4
Remove-Item Env:SMS_DATA_DIR; Remove-Item $data -Recurse -Force -ErrorAction SilentlyContinue

$loop = { param($a) $a -match '^(127\.0\.0\.1|::1|0\.0\.0\.0|::):' -or $a -match '^\[?(::1|::)\]?:' }
"samples taken: $samples"
"TCP listening sockets: " + (($listening.Keys | Sort-Object) -join ', ')
"TCP peers seen: " + $(if ($remotes.Count) { ($remotes.Keys | Sort-Object) -join ', ' } else { '(none)' })
"UDP endpoints: " + $(if ($udp.Count) { ($udp.Keys | Sort-Object) -join ', ' } else { '(none)' })
"new DNS cache entries during the run (INFORMATIONAL ONLY: the cache is machine-wide, so Office, antivirus, etc. add entries too): " + $(if ($newDns) { ($newDns | Sort-Object -Unique) -join ', ' } else { '(none)' })
$bad = @($remotes.Keys | Where-Object { $_ -notmatch '^(127\.0\.0\.1|::1|0\.0\.0\.0|::):' })
$badListen = @($listening.Keys | Where-Object { $_ -notmatch '^(127\.0\.0\.1|::1):' })
$badUdp = @($udp.Keys | Where-Object { $_ -notmatch '^(127\.0\.0\.1|::1):' })
"non-loopback TCP peers: $($bad.Count) | non-loopback listeners: $($badListen.Count) | non-loopback UDP endpoints: $($badUdp.Count)"
# Sampling every few seconds can miss a very short connection; a stricter proof needs a firewall rule or a VM without a network.
if ($bad.Count -eq 0 -and $badListen.Count -eq 0 -and $badUdp.Count -eq 0) { 'RESULT: PASS (sampled) - the processes of this app only used 127.0.0.1' } else { 'RESULT: REVIEW - see the lists above' }
