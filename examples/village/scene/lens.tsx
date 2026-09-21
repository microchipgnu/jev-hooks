import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
export function useLensController() {
  const [selected, setSelected] = useState("village"),
    [hovered, setHovered] = useState("village"),
    [pinned, setPinned] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    over = useRef("village"),
    pinnedRef = useRef(false);
  const hover = useCallback((scope: string) => {
    if (over.current === scope) return;
    over.current = scope;
    setHovered(scope);
    clearTimeout(timer.current);
    if (!pinnedRef.current)
      timer.current = setTimeout(() => setSelected(scope), 160);
  }, []);
  const pin = useCallback((scope: string) => {
    clearTimeout(timer.current);
    setSelected(scope);
    setHovered(scope);
    over.current = scope;
    pinnedRef.current = true;
    setPinned(pinnedRef.current);
  }, []);
  const unpin = useCallback(() => {
    clearTimeout(timer.current);
    pinnedRef.current = false;
    setPinned(false);
    setSelected("village");
    setHovered("village");
    over.current = "village";
  }, []);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") unpin();
    };
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("keydown", escape);
      clearTimeout(timer.current);
    };
  }, [unpin]);
  return { selected, hovered, pinned, hover, pin, unpin };
}
const LensContext = createContext<ReturnType<typeof useLensController> | null>(
  null,
);
export function LensProvider({ children }: { children: ReactNode }) {
  const lens = useLensController();
  return <LensContext.Provider value={lens}>{children}</LensContext.Provider>;
}
export function useLens() {
  const lens = useContext(LensContext);
  if (!lens) throw new Error("LensProvider required");
  return lens;
}
