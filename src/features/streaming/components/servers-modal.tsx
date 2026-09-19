"use client";

import * as React from "react";
import { Check, GripVertical, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  TOTAL_STREAMING_SERVERS,
  isEmbedServer,
  type StreamServer,
} from "@/lib/streaming/stream-resolver";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "erasmus_preferred_server";

interface ServersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeServerId: string;
  onSelectServer: (serverId: string) => void;
  servers?: StreamServer[];
}

export function ServersModal({
  open,
  onOpenChange,
  activeServerId,
  onSelectServer,
  servers = TOTAL_STREAMING_SERVERS,
}: ServersModalProps) {
  if (!open) return null;

  const directServers = servers.filter((s) => !isEmbedServer(s.id));
  const embedServers = servers.filter((s) => isEmbedServer(s.id));

  const renderServerItem = (server: StreamServer) => {
    const active = server.id === activeServerId;
    return (
      <li key={server.id}>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(STORAGE_KEY, server.id);
            } catch {
              /* ignore */
            }
            onSelectServer(server.id);
            onOpenChange(false);
          }}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-150",
            active ? "bg-white/15 shadow-sm" : "hover:bg-white/5",
          )}
        >
          <GripVertical className="h-4 w-4 text-white/20 shrink-0" />
          <span className="text-base shrink-0">{server.flag}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white truncate">
                {server.name}
              </span>
              {server.badge && (
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/60 shrink-0">
                  {server.badge}
                </span>
              )}
            </div>
            {server.description && (
              <p className="text-[11px] text-white/40 truncate">
                {server.description}
              </p>
            )}
          </div>
          {active ? (
            <Check className="h-4 w-4 text-[#22c55e] shrink-0" strokeWidth={3} />
          ) : null}
        </button>
      </li>
    );
  };

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="w-[min(26rem,94vw)] max-h-[82vh] flex flex-col rounded-2xl border border-white/[0.14] bg-neutral-950/90 p-4 text-white shadow-[0_24px_70px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-3xl ring-1 ring-white/10">
        <div className="mb-2 flex items-center justify-between pb-2 border-b border-white/10">
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-white">Streaming Servers</h2>
            <p className="text-[11px] text-white/45">Select a direct CDN or fallback embed player</p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[11px] text-white/60 hover:text-white"
              onClick={() => {
                try {
                  localStorage.removeItem(STORAGE_KEY);
                } catch {
                  /* ignore */
                }
                onSelectServer("lisbon");
              }}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Reset
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-white/70 hover:text-white"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="overflow-y-auto pr-1 space-y-4 max-h-[64vh]">
          {directServers.length > 0 && (
            <div>
              <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                Direct Streams (4K & Fast Native)
              </div>
              <ul className="space-y-0.5">
                {directServers.map(renderServerItem)}
              </ul>
            </div>
          )}

          {embedServers.length > 0 && (
            <div>
              <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                Embed Fallback Players (Filmu / Bingr Network)
              </div>
              <ul className="space-y-0.5">
                {embedServers.map(renderServerItem)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function readPreferredServer(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || "lisbon";
  } catch {
    return "lisbon";
  }
}
