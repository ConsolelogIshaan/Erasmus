$ErrorActionPreference = "SilentlyContinue"
$RelayDir = "C:\Users\Administrator\Documents\Argus\Argus"
Set-Location $RelayDir

$CloudflaredBin = "C:\Users\Administrator\bin\cloudflared.exe"
$LogFile = "$RelayDir\relay\tunnel.log"
$PrimaryWorker = "https://erasmus-hls-relay.erasmustv.workers.dev"
$Secret = "erasmus_relay_tunnel_key_9247f1"

# Kill any existing orphaned relay or cloudflared instances to ensure clean state
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 8443 -ErrorAction SilentlyContinue | ForEach-Object { 
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue 
}

# 1. Start Node Relay on port 8443
$RelayProc = Start-Process -FilePath "node" -ArgumentList "relay/erasmus-relay.mjs" -WorkingDirectory $RelayDir -WindowStyle Hidden -PassThru

# 2. Start Cloudflare Tunnel
if (Test-Path $LogFile) { Remove-Item $LogFile -Force -ErrorAction SilentlyContinue }
$TunnelProc = Start-Process -FilePath $CloudflaredBin -ArgumentList "tunnel --url http://localhost:8443 --logfile `"$LogFile`"" -WorkingDirectory $RelayDir -WindowStyle Hidden -PassThru

$LastUrl = ""
$LastPing = 0

while ($true) {
    Start-Sleep -Seconds 3

    # Check and heal Relay process if died
    if ($null -eq $RelayProc -or $RelayProc.HasExited) {
        $RelayProc = Start-Process -FilePath "node" -ArgumentList "relay/erasmus-relay.mjs" -WorkingDirectory $RelayDir -WindowStyle Hidden -PassThru
    }

    # Check and heal Tunnel process if died
    if ($null -eq $TunnelProc -or $TunnelProc.HasExited) {
        $TunnelProc = Start-Process -FilePath $CloudflaredBin -ArgumentList "tunnel --url http://localhost:8443 --logfile `"$LogFile`"" -WorkingDirectory $RelayDir -WindowStyle Hidden -PassThru
    }

    # Parse and register new tunnel URL when cloudflared outputs it
    if (Test-Path $LogFile) {
        try {
            $LogContent = Get-Content $LogFile -Raw -ErrorAction SilentlyContinue
            $Matches = [regex]::Matches($LogContent, "https://[a-z0-9-]+\.trycloudflare\.com")
            if ($Matches.Count -gt 0) {
                $CurrentUrl = $Matches[$Matches.Count - 1].Value
                if ($CurrentUrl -ne $LastUrl) {
                    $LastUrl = $CurrentUrl
                    $CurrentUrl | Set-Content "$RelayDir\relay\CURRENT_TUNNEL_URL.txt" -Force
                    
                    # Register with Cloudflare Worker
                    $body = @{ target = $CurrentUrl } | ConvertTo-Json
                    Invoke-RestMethod -Uri "$PrimaryWorker/set-target" -Method POST -Headers @{ "Authorization" = "Bearer $Secret"; "Content-Type" = "application/json" } -Body $body -TimeoutSec 10 -ErrorAction SilentlyContinue
                }
            }
        } catch {}
    }

    # Heartbeat every 25 seconds
    $Now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    if ($Now - $LastPing -ge 25 -and $LastUrl) {
        $LastPing = $Now
        try {
            Invoke-RestMethod -Uri "$PrimaryWorker/ping" -Method POST -Headers @{ "Authorization" = "Bearer $Secret" } -TimeoutSec 5 -ErrorAction SilentlyContinue
        } catch {}
    }
}
