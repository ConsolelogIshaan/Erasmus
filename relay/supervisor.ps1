$ErrorActionPreference = "Stop"
$RelayWorkspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $RelayWorkspace
# Keep the scheduled task's existing entry point; use one supervisor everywhere.
& node (Join-Path $PSScriptRoot "supervisor.mjs")
exit $LASTEXITCODE
