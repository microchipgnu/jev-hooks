import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Presentation only. Never changes facts, inference timing, or semantic values. */
export function motionAllowed(element: Element) {
  return (
    !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches &&
    !element.closest('[data-motion="off"]')
  );
}

export function Changed({
  children,
  value: token,
  className = "",
}: {
  children: ReactNode;
  value: unknown;
  className?: string;
}) {
  return (
    <span className={`changed-value ${className}`} key={String(token)}>
      {children}
    </span>
  );
}

/** FLIP keeps severity sorting readable without changing the actual list order. */
export function useAnimatedOrder(order: string) {
  const ref = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const next = new Map<string, number>();
    root.querySelectorAll<HTMLElement>("[data-object-id]").forEach((row) => {
      const id = row.dataset.objectId!;
      const top = row.offsetTop;
      next.set(id, top);
      const before = positions.current.get(id);
      if (
        before !== undefined &&
        before !== top &&
        row.animate &&
        motionAllowed(row)
      ) {
        row.animate(
          [
            { transform: `translateY(${before - top}px)` },
            { transform: "translateY(0)" },
          ],
          { duration: 520, easing: "cubic-bezier(.22,1,.36,1)" },
        );
      }
    });
    positions.current = next;
  }, [order]);
  return ref;
}
