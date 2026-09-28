/*
 * Care.
 *
 * Straight from how the sheet is actually made and maintained, in the words someone
 * who owns one would use. Four lines, no chemistry. This is the part of the app that
 * replaces a manual nobody keeps.
 */

const RULES = [
  "Plain water only — rain or tap. No soap, no salt, nothing added.",
  "Rain is fine. The sheet does not wash off or dissolve.",
  "Rolled up wet for a day or two is fine. Dry it fully before storing it away for the season.",
  "Gone soft after a few months? One spray of the setting solution firms it up again.",
];

export default function CareCard() {
  return (
    <div className="card">
      <h2>Looking after it</h2>
      <ul className="care">
        {RULES.map((r) => (
          <li key={r}>
            <span className="mark">·</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
