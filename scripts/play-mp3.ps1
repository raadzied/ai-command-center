param([string]$Path)

Add-Type -AssemblyName PresentationCore
$player = New-Object System.Windows.Media.MediaPlayer
$player.Open([uri]$Path)

# انتظر التحميل (حتى 3 ثوانٍ)
$waited = 0
while (-not $player.NaturalDuration.HasTimeSpan -and $waited -lt 3000) {
  Start-Sleep -Milliseconds 100; $waited += 100
}
if (-not $player.NaturalDuration.HasTimeSpan) { [Console]::Error.WriteLine('MediaPlayer: duration unavailable'); exit 1 }

$ms = $player.NaturalDuration.TimeSpan.TotalMilliseconds
$player.Play()
Start-Sleep -Milliseconds ([int]($ms + 200))
$player.Close()
