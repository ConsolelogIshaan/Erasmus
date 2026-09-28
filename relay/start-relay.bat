@echo off
title Erasmus Video Relay Daemon
cd /d "%~dp0.."
node relay/daemon.mjs
