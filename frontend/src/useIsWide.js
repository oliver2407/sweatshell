import { useEffect, useState } from "react";

/**
 * True when the viewport is wide enough for the desktop layout.
 *
 * The breakpoint lives here rather than only in CSS because two things actually
 * change shape, not just size: the dial is drawn at a fixed pixel size in SVG, and
 * the control view splits into two columns. Both need the answer in JavaScript.
 *
 * 900px, because that is where a sidebar plus two readable columns stops being a
 * squeeze — not because it is a round number.
 */
export const WIDE = "(min-width: 900px)";

export default function useIsWide() {
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia(WIDE).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const onChange = (e) => setWide(e.matches);
    mq.addEventListener("change", onChange);
    setWide(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return wide;
}
