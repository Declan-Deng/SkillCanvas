type ArrowDirection = "right" | "up-right" | "down" | "back-up";

// Local Tabler SVGs share one size, stroke and currentColor treatment.
export function ShowcaseArrow({ direction = "right" }: { direction?: ArrowDirection }) {
  return <span className="sc-arrow" aria-hidden="true" style={{ maskImage: `url("/icons/tabler/arrow-${direction}.svg")` }} />;
}
