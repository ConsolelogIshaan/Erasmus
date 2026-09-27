"use client";

import * as React from "react";

/**
 * UI state for mobile navigation.
 * Separated from auth and server state intentionally.
 */

interface UIContextValue {
  mobileNavOpen: boolean;
  setMobileNavOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
}

const UIContext = React.createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  const value = React.useMemo(
    () => ({
      mobileNavOpen,
      setMobileNavOpen,
    }),
    [mobileNavOpen],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = React.useContext(UIContext);
  if (!ctx) {
    throw new Error("useUI must be used within UIProvider");
  }
  return ctx;
}
