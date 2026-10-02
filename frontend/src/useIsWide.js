import { useEffect, useState } from "react";

/**
 * True when the viewport is wide enough for the desktop layout.
 *
 * The breakpoint lives here rather than only in CSS because the shape changes, not
 * just the size: the tab bar disappears entirely and the dial is drawn at a fixed
 * pixel size in SVG. Both need the answer in JavaScript.
 *
 * 1100px is where three columns stop being a squeeze. The schedule editor sets it:
 * below about 330px its seven day chips and two time inputs start fighting, and
 * three of those plus gutters is what 1100 buys. Narrower than that the tabs are
 * the better layout, so the middle ground is simply not entered.
 */
export const WIDE = "(min-width: 1100px)";

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
