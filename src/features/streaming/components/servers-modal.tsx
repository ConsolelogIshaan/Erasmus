"use client";

import * as React from "react";
import { Check, GripVertical, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { STREAMING_SERVERS, type StreamServer } from "@/lib/streaming/stream-resolver";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "argus_preferred_server";

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
  servers = STREAMING_SERVERS,
}: ServersModalProps) {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[min(22rem,92vw)] rounded-2xl border border-white/10 bg-[#111] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-white">Servers</h2>
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
              Reset order
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
        <ul className="space-y-0.5">
          {servers.map((server) => {
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
                    "flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors duration-150",
                    active ? "bg-white/10" : "hover:bg-white/5",
                  )}
                >
                  <GripVertical className="h-4 w-4 text-white/25" />
                  <span className="text-base">{server.flag}</span>
                  <span className="flex-1 text-sm font-semibold text-white">
                    {server.name}
                  </span>
                  {active ? (
                    <Check className="h-4 w-4 text-[#22c55e]" strokeWidth={3} />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
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
