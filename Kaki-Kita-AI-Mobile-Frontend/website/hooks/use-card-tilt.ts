"use client";
import { useEffect, type RefObject } from "react";
import { tiltAt } from "@/lib/interaction";

export function useCardTilt(scope: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)"), reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let active: HTMLElement | null = null, frame = 0;
    const reset = () => {
      cancelAnimationFrame(frame);
      active?.removeAttribute("data-tilting");
      for (const key of ["--tilt-x", "--tilt-y", "--glare-x", "--glare-y"]) active?.style.removeProperty(key);
      active = null;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !pointer.matches || reduced.matches) { reset(); return; }
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-tilt]") : null;
      if (!card || !root.contains(card) || card.matches(":disabled")) { reset(); return; }
      if (active !== card) { reset(); active = card; }
      const rect = card.getBoundingClientRect(), tilt = tiltAt(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        card.style.setProperty("--tilt-x", `${tilt.rotateX}deg`); card.style.setProperty("--tilt-y", `${tilt.rotateY}deg`);
        card.style.setProperty("--glare-x", `${tilt.glareX}%`); card.style.setProperty("--glare-y", `${tilt.glareY}%`);
        card.setAttribute("data-tilting", "true");
      });
    };
    root.addEventListener("pointermove", move); root.addEventListener("pointerleave", reset);
    pointer.addEventListener("change", reset); reduced.addEventListener("change", reset); window.addEventListener("blur", reset);
    return () => { reset(); root.removeEventListener("pointermove", move); root.removeEventListener("pointerleave", reset); pointer.removeEventListener("change", reset); reduced.removeEventListener("change", reset); window.removeEventListener("blur", reset); };
  }, [scope]);
}
