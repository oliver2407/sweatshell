/*
 * Line-art icons for the mode row and the tab bar.
 *
 * Drawn rather than pulled from a set so the roller actually looks like a roller:
 * a tube with a sheet hanging off it, which is a shape no icon library has. They
 * share one stroke weight and one 24-unit grid so the row reads as a set.
 */

const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const RollOut = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="5" r="2.6" />
    <path d="M7 9.5h10v9H7z" />
    <path d="M6 21h12" />
  </svg>
);

// The pair has to read as a pair: same roller at the top, sheet down in one and an
// arrow where the sheet used to be in the other. An earlier version drew the rolled
// state as a dashed ring, which at 24px is indistinguishable from a settings gear.
export const RollUp = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="5" r="2.6" />
    <path d="M12 20v-7" />
    <path d="M8.5 16.5 12 13l3.5 3.5" />
    <path d="M6 21h12" />
  </svg>
);

export const Clock = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const Drop = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3.5c3.2 4 5 6.6 5 9a5 5 0 0 1-10 0c0-2.4 1.8-5 5-9z" />
  </svg>
);

export const Chart = (p) => (
  <svg {...base} {...p}>
    <path d="M4 18V7M4 18h16" />
    <path d="M7.5 15l3.5-4 3 2.5 4.5-6" />
  </svg>
);

export const Leaf = (p) => (
  <svg {...base} {...p}>
    <path d="M5 19c0-7 4.5-11 14-11 0 8-4 12-10 12a4 4 0 0 1-4-1z" />
    <path d="M10 18c1.5-4 3.5-6.5 6.5-8.5" />
  </svg>
);
