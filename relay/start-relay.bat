@echo off
title Erasmus Video Relay Daemon
cd /d "%~dp0.."

echo [Erasmus Relay] Starting local video relay on port 8443...
start /b node relay/erasmus-relay.mjs > relay/relay.log 2>&1

echo [Erasmus Relay] Starting Cloudflare Tunnel...
start /b C:\Users\Administrator\bin\cloudflared.exe tunnel --url http://localhost:8443 > relay/tunnel.log 2>&1

echo [Erasmus Relay] Syncing tunnel URL...
start /b node relay/sync-tunnel-url.mjs

echo [Erasmus Relay] Services started successfully in background.
