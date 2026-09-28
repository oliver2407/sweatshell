/*
 * Care, folded away.
 *
 * Reference material, not glance material: read once when the sheet goes up, then
 * looked up when something seems wrong. It sits closed so it costs nothing on the
 * way past, and it replaces a manual nobody keeps.
 *
 * Straight from how the sheet is actually made and maintained, in the words someone
 * who owns one would use. No chemistry.
 */

const RULES = [
  "Plain water only — rain or tap. No soap, no salt, nothing added.",
  "Rain is fine. The sheet does not wash off or dissolve.",
  "Rolled up wet for a day or two is fine. Dry it fully before storing it away for the season.",
  "Gone soft after a few months? One spray of the setting solution firms it up again.",
];

export default function CareCard() {
  return (
    <details className="card fold">
      <summary>Looking after it</summary>
      <ul className="care">
        {RULES.map((r) => (
          <li key={r}>
            <span className="mark">·</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
