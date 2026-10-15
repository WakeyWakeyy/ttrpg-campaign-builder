param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $GraphifyArguments
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$argumentsToPass = @($GraphifyArguments)
$newSnapshot = $false
if ($argumentsToPass.Count -gt 0 -and $argumentsToPass[0] -eq 'snapshot') {
  $graphPath = Join-Path $repoRoot 'graphify-out/graph.json'
  if (Test-Path -LiteralPath $graphPath) {
    $argumentsToPass = @('update', $repoRoot, '--force')
  } else {
    $argumentsToPass = @('extract', $repoRoot, '--code-only')
    $newSnapshot = $true
  }
}
if ($argumentsToPass.Count -ge 2 -and $argumentsToPass[0] -in @('update', 'extract', 'cluster-only') -and $argumentsToPass[1] -eq '.') {
  $argumentsToPass[1] = $repoRoot
}
$savedInterpreter = Join-Path $repoRoot 'graphify-out/.graphify_python'
$candidates = @()
if (Test-Path -LiteralPath $savedInterpreter) {
  $candidates += (Get-Content -LiteralPath $savedInterpreter -Raw).Trim()
}
$uvInterpreter = Join-Path $env:APPDATA 'uv/tools/graphifyy/Scripts/python.exe'
$candidates += $uvInterpreter
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if ($pythonCommand) { $candidates += $pythonCommand.Source }

foreach ($candidate in ($candidates | Select-Object -Unique)) {
  if (-not (Test-Path -LiteralPath $candidate)) { continue }
  & $candidate -c 'import graphify' 2>$null
  if ($LASTEXITCODE -ne 0) { continue }
  Push-Location $repoRoot
  try {
    & $candidate -m graphify @argumentsToPass
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if ($newSnapshot) {
      & $candidate -m graphify cluster-only $repoRoot
    }
    exit $LASTEXITCODE
  } finally {
    Pop-Location
  }
}

Write-Error 'Graphify Python package not found. Install graphifyy with uv tool install graphifyy and try again.'
exit 1
