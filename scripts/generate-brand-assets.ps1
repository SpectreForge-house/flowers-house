param(
  [string]$LogoPath = (Join-Path $PSScriptRoot '..\assets\logo.png'),
  [string]$BackgroundColor = '#2D5A3D',
  [string]$ForegroundColor = '#F6F1E7'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$logoPath = (Resolve-Path $LogoPath).Path
$bgColor = [System.Drawing.ColorTranslator]::FromHtml($BackgroundColor)
$fgColor = [System.Drawing.ColorTranslator]::FromHtml($ForegroundColor)

function New-Canvas {
  param([int]$Width, [int]$Height)
  $bmp = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  return @($bmp, $g)
}

function Save-Png {
  param([System.Drawing.Bitmap]$Bitmap, [string]$Path)
  $dir = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Recolor-Logo {
  param([string]$Path, [System.Drawing.Color]$Color)
  $src = [System.Drawing.Bitmap]::FromFile($Path)
  $dst = [System.Drawing.Bitmap]::new($src.Width, $src.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $rect = [System.Drawing.Rectangle]::new(0, 0, $src.Width, $src.Height)
  $srcData = $src.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $dstData = $dst.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $bytes = New-Object byte[] ($srcData.Stride * $src.Height)
  [System.Runtime.InteropServices.Marshal]::Copy($srcData.Scan0, $bytes, 0, $bytes.Length)
  for ($i = 0; $i -lt $bytes.Length; $i += 4) {
    $alpha = $bytes[$i + 3]
    if ($alpha -gt 0) {
      $bytes[$i] = $Color.B
      $bytes[$i + 1] = $Color.G
      $bytes[$i + 2] = $Color.R
      $bytes[$i + 3] = $alpha
    }
  }
  [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $dstData.Scan0, $bytes.Length)
  $src.UnlockBits($srcData)
  $dst.UnlockBits($dstData)
  $src.Dispose()
  return $dst
}

function Draw-Logo {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Bitmap]$Logo,
    [int]$CanvasWidth,
    [int]$CanvasHeight,
    [double]$Ratio
  )
  $size = [int][Math]::Round([Math]::Min($CanvasWidth, $CanvasHeight) * $Ratio)
  $x = [int](($CanvasWidth - $size) / 2)
  $y = [int](($CanvasHeight - $size) / 2)
  $Graphics.DrawImage($Logo, $x, $y, $size, $size)
}

function New-SquareIcon {
  param([int]$Size, [System.Drawing.Bitmap]$Logo, [double]$Ratio)
  $canvas = New-Canvas -Width $Size -Height $Size
  $bmp = $canvas[0]
  $g = $canvas[1]
  $g.Clear($bgColor)
  Draw-Logo -Graphics $g -Logo $Logo -CanvasWidth $Size -CanvasHeight $Size -Ratio $Ratio
  $g.Dispose()
  return $bmp
}

function New-ForegroundIcon {
  param([int]$Size, [System.Drawing.Bitmap]$Logo, [double]$Ratio)
  $canvas = New-Canvas -Width $Size -Height $Size
  $bmp = $canvas[0]
  $g = $canvas[1]
  Draw-Logo -Graphics $g -Logo $Logo -CanvasWidth $Size -CanvasHeight $Size -Ratio $Ratio
  $g.Dispose()
  return $bmp
}

function New-RoundIcon {
  param([int]$Size, [System.Drawing.Bitmap]$Logo, [double]$Ratio)
  $canvas = New-Canvas -Width $Size -Height $Size
  $bmp = $canvas[0]
  $g = $canvas[1]
  $brush = [System.Drawing.SolidBrush]::new($bgColor)
  $g.FillEllipse($brush, 0, 0, $Size - 1, $Size - 1)
  $brush.Dispose()
  Draw-Logo -Graphics $g -Logo $Logo -CanvasWidth $Size -CanvasHeight $Size -Ratio $Ratio
  $g.Dispose()
  return $bmp
}

function New-Splash {
  param([int]$Width, [int]$Height, [System.Drawing.Bitmap]$Logo, [double]$Ratio)
  $canvas = New-Canvas -Width $Width -Height $Height
  $bmp = $canvas[0]
  $g = $canvas[1]
  $g.Clear($bgColor)
  Draw-Logo -Graphics $g -Logo $Logo -CanvasWidth $Width -CanvasHeight $Height -Ratio $Ratio
  $g.Dispose()
  return $bmp
}

function Write-Ico {
  param([string]$Path, [int[]]$Sizes, [System.Drawing.Bitmap]$Logo)
  $frames = @()
  foreach ($size in $Sizes) {
    $bmp = New-SquareIcon -Size $size -Logo $Logo -Ratio 0.80
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $frames += ,@($size, $ms.ToArray())
    $ms.Dispose()
    $bmp.Dispose()
  }

  $dir = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }

  $stream = [System.IO.File]::Create($Path)
  $writer = [System.IO.BinaryWriter]::new($stream)
  $writer.Write([UInt16]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]$frames.Count)
  $offset = 6 + (16 * $frames.Count)
  foreach ($frame in $frames) {
    $size = [int]$frame[0]
    $data = [byte[]]$frame[1]
    $dim = if ($size -ge 256) { 0 } else { $size }
    $writer.Write([Byte]$dim)
    $writer.Write([Byte]$dim)
    $writer.Write([Byte]0)
    $writer.Write([Byte]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]32)
    $writer.Write([UInt32]$data.Length)
    $writer.Write([UInt32]$offset)
    $offset += $data.Length
  }
  foreach ($frame in $frames) {
    $writer.Write([byte[]]$frame[1])
  }
  $writer.Close()
  $stream.Close()
}

$logoSource = [System.Drawing.Bitmap]::FromFile($logoPath)
$logo = Recolor-Logo -Path $logoPath -Color $fgColor
$logoSource.Dispose()

Save-Png -Bitmap $logo -Path (Join-Path $projectRoot 'assets\logo-cream.png')

$master = New-SquareIcon -Size 1024 -Logo $logo -Ratio 0.80
Save-Png -Bitmap $master -Path (Join-Path $projectRoot 'assets\icon-master.png')
$master.Dispose()

$foreground = New-ForegroundIcon -Size 1024 -Logo $logo -Ratio 0.64
Save-Png -Bitmap $foreground -Path (Join-Path $projectRoot 'assets\icon-foreground.png')
$foreground.Dispose()

$round = New-RoundIcon -Size 1024 -Logo $logo -Ratio 0.64
Save-Png -Bitmap $round -Path (Join-Path $projectRoot 'assets\icon-round.png')
$round.Dispose()

$splashMaster = New-Splash -Width 1024 -Height 1024 -Logo $logo -Ratio 0.55
Save-Png -Bitmap $splashMaster -Path (Join-Path $projectRoot 'assets\splash-master.png')
$splashMaster.Dispose()

$androidRes = Join-Path $projectRoot 'android\app\src\main\res'
$legacySizes = @{
  'mdpi' = 48
  'hdpi' = 72
  'xhdpi' = 96
  'xxhdpi' = 144
  'xxxhdpi' = 192
}
$foregroundSizes = @{
  'mdpi' = 108
  'hdpi' = 162
  'xhdpi' = 216
  'xxhdpi' = 324
  'xxxhdpi' = 432
}

foreach ($density in $legacySizes.Keys) {
  $size = $legacySizes[$density]
  $bmp = New-SquareIcon -Size $size -Logo $logo -Ratio 0.80
  Save-Png -Bitmap $bmp -Path (Join-Path $androidRes "mipmap-$density\ic_launcher.png")
  $bmp.Dispose()

  $bmp = New-RoundIcon -Size $size -Logo $logo -Ratio 0.64
  Save-Png -Bitmap $bmp -Path (Join-Path $androidRes "mipmap-$density\ic_launcher_round.png")
  $bmp.Dispose()

  $fgSize = $foregroundSizes[$density]
  $bmp = New-ForegroundIcon -Size $fgSize -Logo $logo -Ratio 0.64
  Save-Png -Bitmap $bmp -Path (Join-Path $androidRes "mipmap-$density\ic_launcher_foreground.png")
  $bmp.Dispose()
}

$splashSizes = @(
  @('drawable', 480, 320),
  @('drawable-land-mdpi', 480, 320),
  @('drawable-land-hdpi', 800, 480),
  @('drawable-land-xhdpi', 1280, 720),
  @('drawable-land-xxhdpi', 1600, 960),
  @('drawable-land-xxxhdpi', 1920, 1280),
  @('drawable-port-mdpi', 320, 480),
  @('drawable-port-hdpi', 480, 800),
  @('drawable-port-xhdpi', 720, 1280),
  @('drawable-port-xxhdpi', 960, 1600),
  @('drawable-port-xxxhdpi', 1280, 1920)
)
foreach ($entry in $splashSizes) {
  $bmp = New-Splash -Width $entry[1] -Height $entry[2] -Logo $logo -Ratio 0.55
  Save-Png -Bitmap $bmp -Path (Join-Path $androidRes "$($entry[0])\splash.png")
  $bmp.Dispose()
}

$publicDir = Join-Path $projectRoot 'public'
$icon192 = New-SquareIcon -Size 192 -Logo $logo -Ratio 0.80
Save-Png -Bitmap $icon192 -Path (Join-Path $publicDir 'icons\icon-192.png')
$icon192.Dispose()

$icon512 = New-SquareIcon -Size 512 -Logo $logo -Ratio 0.80
Save-Png -Bitmap $icon512 -Path (Join-Path $publicDir 'icons\icon-512.png')
$icon512.Dispose()

$maskable = New-SquareIcon -Size 512 -Logo $logo -Ratio 0.64
Save-Png -Bitmap $maskable -Path (Join-Path $publicDir 'icons\icon-maskable-512.png')
$maskable.Dispose()

$apple = New-SquareIcon -Size 180 -Logo $logo -Ratio 0.80
Save-Png -Bitmap $apple -Path (Join-Path $publicDir 'apple-touch-icon.png')
$apple.Dispose()

$favicon = New-SquareIcon -Size 64 -Logo $logo -Ratio 0.82
Save-Png -Bitmap $favicon -Path (Join-Path $publicDir 'favicon.png')
$favicon.Dispose()

Write-Ico -Path (Join-Path $projectRoot 'build\icon.ico') -Sizes @(16, 24, 32, 48, 64, 128, 256) -Logo $logo

$logo.Dispose()
Write-Output 'Brand assets generated.'
