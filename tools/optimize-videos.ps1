param(
  [string]$VideoDirectory = (Join-Path $PSScriptRoot "..\videos"),
  [int]$Height = 720,
  [int]$Crf = 25
)

$ErrorActionPreference = "Stop"
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw "ffmpeg が見つかりません。ffmpegをインストールしてPATHを通してください。"
}

$outDir = Join-Path $VideoDirectory "optimized"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Get-ChildItem $VideoDirectory -Filter *.mp4 -File | ForEach-Object {
  $output = Join-Path $outDir $_.Name
  Write-Host "最適化: $($_.Name)"
  & ffmpeg -hide_banner -y -i $_.FullName `
    -map 0:v:0 -an `
    -vf "scale=-2:$Height`:force_original_aspect_ratio=decrease,fps=30" `
    -c:v libx264 -preset medium -crf $Crf -pix_fmt yuv420p `
    -movflags +faststart $output
  if ($LASTEXITCODE -ne 0) { throw "変換に失敗しました: $($_.Name)" }
}

Write-Host "完了: $outDir"
Write-Host "確認後、optimized内の動画で元ファイルを置き換えてください。"
