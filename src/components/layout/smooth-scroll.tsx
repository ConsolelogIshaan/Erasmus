"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

interface SmoothScrollProps {
  children: React.ReactNode;
}

/**
 * High-performance 60fps / 120fps smooth scrolling provider using Lenis.
 * Interpolates wheel ticks with fluid exponential decay for buttery momentum scrolling.
 */
export function SmoothScroll({ children }: SmoothScrollProps) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const lenisRef = React.useRef<Lenis | null>(null);
  const pathname = usePathname();

  React.useEffect(() => {
    const wrapper = document.getElementById("main-content");
    if (!wrapper) return;

    // 60+ FPS high-precision momentum easing
    const lenis = new Lenis({
      wrapper,
      content: contentRef.current || wrapper,
      duration: 1.0,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
      wheelMultiplier: 1.1,
      touchMultiplier: 1.5,
      infinite: false,
    });

    lenisRef.current = lenis;

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // Reset scroll to top smoothly or immediately on page transition
  React.useEffect(() => {
    if (lenisRef.current) {
      lenisRef.current.scrollTo(0, { immediate: true });
    } else {
      const main = document.getElementById("main-content");
      if (main) main.scrollTop = 0;
    }
  }, [pathname]);

  return (
    <div ref={contentRef} className="min-w-0 w-full">
      {children}
    </div>
  );
}
