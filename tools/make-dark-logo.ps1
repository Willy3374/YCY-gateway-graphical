# make-dark-logo.ps1 — 由 logo.jpg 生成深色主题用的反色版本 logo-dark.png
#
# 处理规则（与 CSS 中 `.logo` 深色主题的观感一致，但背景转透明以避免黑块）：
#   1) invert(1)          : c' = 255 - c
#   2) hue-rotate(180deg) : SVG/CSS 色相旋转矩阵（θ=180°，cos=-1，sin=0），保持品牌蓝紫色相
#   3) brightness(B)      : c' = c * B
#   4) 浅色背景（原白底）按亮度渐变转成透明 alpha，避免深色顶栏上出现黑色方块
#
# 用法: powershell -ExecutionPolicy Bypass -File tools\make-dark-logo.ps1

param(
  [string]$Src = (Join-Path $PSScriptRoot '..\logo.jpg'),
  [string]$Dst = (Join-Path $PSScriptRoot '..\logo-dark.png'),
  [double]$Brightness = 1.5,
  [int]$AlphaFull = 214,   # 亮度 <= 此值 → 完全不透明
  [int]$AlphaZero = 244    # 亮度 >= 此值 → 完全透明
)

Add-Type -AssemblyName System.Drawing

$srcPath = (Resolve-Path $Src).Path
$bmp = [System.Drawing.Bitmap]::FromFile($srcPath)
$w = $bmp.Width
$h = $bmp.Height

$out = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

# hue-rotate(180deg) 矩阵系数
$a11 = -0.574; $a12 = 1.430; $a13 = 0.144
$a21 = 0.426; $a22 = 0.430; $a23 = 0.144
$a31 = 0.426; $a32 = 1.430; $a33 = -0.856

function ClampByte([double]$v) {
  if ($v -lt 0) { return 0 }
  if ($v -gt 255) { return 255 }
  return [int][math]::Round($v)
}

$transparent = 0
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    $p = $bmp.GetPixel($x, $y)

    # 1) 反色
    $r1 = 255 - $p.R
    $g1 = 255 - $p.G
    $b1 = 255 - $p.B

    # 2) 色相旋转 180°
    $r2 = $a11 * $r1 + $a12 * $g1 + $a13 * $b1
    $g2 = $a21 * $r1 + $a22 * $g1 + $a23 * $b1
    $b2 = $a31 * $r1 + $a32 * $g1 + $a33 * $b1

    # 3) 提亮
    $r3 = ClampByte ($r2 * $Brightness)
    $g3 = ClampByte ($g2 * $Brightness)
    $b3 = ClampByte ($b2 * $Brightness)

    # 4) 原图亮度决定 alpha：白底 → 透明，图形 → 实心
    $lum = 0.2126 * $p.R + 0.7152 * $p.G + 0.0722 * $p.B
    if ($lum -ge $AlphaZero) { $a = 0 }
    elseif ($lum -le $AlphaFull) { $a = 255 }
    else {
      $t = ($AlphaZero - $lum) / ($AlphaZero - $AlphaFull)
      $a = ClampByte (255 * $t)
    }
    if ($a -lt 255) { $transparent++ }
    if ($a -eq 0) { continue }

    $out.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($a, $r3, $g3, $b3))
  }
}

$dstPath = [System.IO.Path]::GetFullPath($Dst)
$out.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)
$out.Dispose()
$bmp.Dispose()

$ratio = [math]::Round(100.0 * $transparent / ($w * $h), 1)
Write-Output "written: $dstPath ($w x $h, brightness=$Brightness, 透明像素 $ratio%)"
