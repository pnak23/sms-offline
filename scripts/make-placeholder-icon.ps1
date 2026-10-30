# Generates PLACEHOLDER app icons at desktop/build/: icon.png (512x512) and a multi-size icon.ico (PNG-compressed entries).
# Replace both with the final artwork later. We build the .ico ourselves so electron-builder's own PNG->ICO tool (a CommonJS
# script that breaks when a parent folder's package.json says "type": "module") never has to run.
Add-Type -AssemblyName System.Drawing

function New-IconPng([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'
    $g.Clear([System.Drawing.Color]::Transparent)
    $m = [int]($size * 0.047); $w = $size - 2 * $m; $d = [int]($size * 0.375)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($m, $m, $d, $d, 180, 90); $path.AddArc($m + $w - $d, $m, $d, $d, 270, 90)
    $path.AddArc($m + $w - $d, $m + $w - $d, $d, $d, 0, 90); $path.AddArc($m, $m + $w - $d, $d, $d, 90, 90); $path.CloseFigure()
    $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 47, 111, 179))), $path)
    $font = New-Object System.Drawing.Font 'Noto Sans Khmer', ([single]($size * 0.49)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
    $g.DrawString('ស', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 0, ([single]($size * 0.04)), $size, $size), $fmt)
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    return , $ms.ToArray()
}

$outDir = Join-Path $PSScriptRoot '..\desktop\build'
New-Item -ItemType Directory -Force $outDir | Out-Null
[System.IO.File]::WriteAllBytes((Join-Path $outDir 'icon.png'), (New-IconPng 512))

$sizes = 16, 24, 32, 48, 64, 128, 256
$images = foreach ($s in $sizes) { , (New-IconPng $s) }
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $ms
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)            # ICONDIR
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {                                              # ICONDIRENTRY x n
    $s = $sizes[$i]; $len = $images[$i].Length
    $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s }))); $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))
    $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([uint16]1); $bw.Write([uint16]32)
    $bw.Write([uint32]$len); $bw.Write([uint32]$offset); $offset += $len
}
foreach ($img in $images) { $bw.Write($img) }
$bw.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $outDir 'icon.ico'), $ms.ToArray())
"icons written: $((Resolve-Path (Join-Path $outDir 'icon.png')).Path) , icon.ico ($($ms.Length) bytes, sizes $($sizes -join ','))"
