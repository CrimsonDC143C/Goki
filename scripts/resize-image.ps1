param(
    [Parameter(Mandatory=$true)]
    [string]$Path,
    [int]$Width = 512,
    [int]$Height = 512
)
Add-Type -AssemblyName System.Drawing
$fullPath = (Resolve-Path $Path).Path
$img = [System.Drawing.Image]::FromFile($fullPath)
$bmp = New-Object System.Drawing.Bitmap $Width, $Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($img, 0, 0, $Width, $Height)
$img.Dispose()
$g.Dispose()
$tmp = "$fullPath.tmp.png"
$bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Move-Item -Force $tmp $fullPath
