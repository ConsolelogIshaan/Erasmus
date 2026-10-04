@echo off
setlocal
title Erasmus Lisbon Tunnel

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $root = Split-Path -Parent '%~f0'; $task = Get-ScheduledTask -TaskName 'ErasmusRelay' -ErrorAction SilentlyContinue; if ($task) { if ($task.State -ne 'Running') { Write-Host 'Starting the Erasmus tunnel supervisor...'; Start-ScheduledTask -InputObject $task } else { Write-Host 'Tunnel supervisor is already running; it will recover a closed tunnel automatically.' } } else { Write-Host 'Scheduled task not found; starting the existing relay daemon...'; Start-Process -FilePath 'node' -ArgumentList 'relay/daemon.mjs' -WorkingDirectory $root -WindowStyle Hidden }; $uri = 'https://erasmus-hls-relay.erasmustv.workers.dev/status'; Write-Host 'Waiting for the live tunnel and relay health check...'; for ($attempt = 0; $attempt -lt 24; $attempt++) { try { $status = Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec 3; if ($status.isTunnelAlive -and $status.relay.status -eq 'ok') { Write-Host 'Lisbon tunnel is online; relay health is OK.'; exit 0 } } catch {}; Start-Sleep -Seconds 2 }; Write-Error 'The tunnel did not report healthy within 2 minutes. The supervisor may still be reconnecting; check relay/supervisor.log and try again.'; exit 1"

if errorlevel 1 (
  echo.
  echo The tunnel is not confirmed online yet.
) else (
  echo.
  echo The Lisbon tunnel is ready.
)

echo.
pause
endlocal
