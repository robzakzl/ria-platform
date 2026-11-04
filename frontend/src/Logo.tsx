// The shield's outline, drawn once filled and once as the inset gold rule.
const shield = "M60,10 L100,22 V58 C100,86 82,102 60,112 C38,102 20,86 20,58 V22 Z";
const serif = "Georgia, 'Times New Roman', serif";

/**
 * The Asterly crest logo: a shield bearing an A under a gold star, beside the name in spaced serif capitals.
 * Colours come from the --logo-* theme tokens in App.css, so it follows the light/dark switch.
 * The favicon (public/favicon.svg) is the same shield without the name.
 */
export default function Logo() {
  return (
    <svg className="logo" viewBox="18 8 326 106" role="img" aria-label="Asterly" xmlns="http://www.w3.org/2000/svg">
      <path d={shield} fill="var(--logo-ink)" />
      <path
        d={shield}
        fill="none"
        stroke="var(--logo-gold)"
        strokeWidth="2"
        transform="translate(60 61) scale(.86) translate(-60 -61)"
      />
      <path d="M60,28 L62.3,34.7 L69,37 L62.3,39.3 L60,46 L57.7,39.3 L51,37 L57.7,34.7 Z" fill="var(--logo-gold)" />
      <text x="60" y="90" textAnchor="middle" fontFamily={serif} fontSize="40" fill="var(--logo-card)">
        A
      </text>
      <text
        x="122"
        y="72"
        fontFamily={serif}
        fontSize="32"
        textLength="220"
        lengthAdjust="spacingAndGlyphs"
        fill="var(--logo-ink)"
      >
        ASTERLY
      </text>
    </svg>
  );
}
