param(
  [Parameter(Mandatory=$false)][string]$Text = '',
  [Parameter(Mandatory=$false)][string]$TextFile = '',
  [Parameter(Mandatory=$true)][string]$OutputPath,
  [Parameter(Mandatory=$false)][string]$VoiceName = 'Microsoft Naayf',
  [Parameter(Mandatory=$false)][double]$Rate = 1.0
)

$ErrorActionPreference = 'Stop'

if ($TextFile) { $Text = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8) }
if (-not $Text) { [Console]::Error.WriteLine('No text provided'); exit 3 }

Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer

$voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices |
  Where-Object { $_.DisplayName -like "*$VoiceName*" } |
  Select-Object -First 1

if (-not $voice) {
  [Console]::Error.WriteLine("Voice not found: $VoiceName")
  exit 2
}

$synth.Voice = $voice
try { $synth.Options.SpeakingRate = [double]$Rate } catch { }

$stream = Await ($synth.SynthesizeTextToStreamAsync($Text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])

$size = [int]$stream.Size
$buffer = New-Object byte[] $size
$reader = New-Object Windows.Storage.Streams.DataReader($stream)
Await ($reader.LoadAsync($size)) ([uint32]) | Out-Null
$reader.ReadBytes($buffer)
$reader.Dispose()

[System.IO.File]::WriteAllBytes($OutputPath, $buffer)

Write-Host "OK: $OutputPath ($size bytes) voice=$($voice.DisplayName)"
exit 0
