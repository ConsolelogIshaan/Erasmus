"use client";

import * as React from "react";
import type { AmbientPalette } from "@/lib/media/ambient-palette-types";
import { DEFAULT_AMBIENT_PALETTE } from "@/lib/media/ambient-palette-types";

export interface AmbientTheme {
  palette: AmbientPalette;
  backdropUrl?: string | null;
  id?: string;
}

interface AmbientContextValue {
  currentTheme: AmbientTheme;
  previousTheme: AmbientTheme | null;
  setAmbientTheme: (theme: Partial<AmbientTheme>) => void;
  resetAmbientTheme: () => void;
}

const AmbientContext = React.createContext<AmbientContextValue | null>(null);

export function AmbientProvider({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrentThemeState] = React.useState<AmbientTheme>({
    palette: DEFAULT_AMBIENT_PALETTE,
    backdropUrl: null,
    id: "default",
  });
  const [previousTheme, setPreviousThemeState] = React.useState<AmbientTheme | null>(null);

  const setAmbientTheme = React.useCallback((theme: Partial<AmbientTheme>) => {
    setCurrentThemeState((prev) => {
      const nextId = theme.id ?? (theme.backdropUrl || JSON.stringify(theme.palette));
      if (prev.id === nextId) return prev;

      setPreviousThemeState(prev);
      return {
        palette: theme.palette ?? prev.palette,
        backdropUrl: theme.backdropUrl !== undefined ? theme.backdropUrl : prev.backdropUrl,
        id: nextId,
      };
    });
  }, []);

  const resetAmbientTheme = React.useCallback(() => {
    setCurrentThemeState((prev) => {
      if (prev.id === "default") return prev;
      setPreviousThemeState(prev);
      return {
        palette: DEFAULT_AMBIENT_PALETTE,
        backdropUrl: null,
        id: "default",
      };
    });
  }, []);

  return (
    <AmbientContext.Provider
      value={{
        currentTheme,
        previousTheme,
        setAmbientTheme,
        resetAmbientTheme,
      }}
    >
      {children}
    </AmbientContext.Provider>
  );
}

export function useAmbient() {
  const ctx = React.useContext(AmbientContext);
  if (!ctx) {
    throw new Error("useAmbient must be used within an AmbientProvider");
  }
  return ctx;
}

/**
 * Declarative component for pages to set their ambient theme on mount
 */
export function AmbientThemeSetter({
  palette,
  backdropUrl,
  id,
}: {
  palette?: AmbientPalette;
  backdropUrl?: string | null;
  id?: string;
}) {
  const { setAmbientTheme } = useAmbient();

  React.useEffect(() => {
    if (palette || backdropUrl) {
      setAmbientTheme({
        palette,
        backdropUrl,
        id: id ?? (backdropUrl || JSON.stringify(palette)),
      });
    }
  }, [palette, backdropUrl, id, setAmbientTheme]);

  return null;
}
