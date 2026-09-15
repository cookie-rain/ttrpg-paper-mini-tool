/** Explains the two colours used for sizes: printed size on paper vs. size in the game world. */
export function SizeLegend() {
  return (
    <span className="size-legend">
      <span className="size-print" title="Size of the image on paper">
        <span className="swatch-dot" aria-hidden="true" />
        Print size
      </span>
      <span className="size-ingame" title="Size of the figure in the game world">
        <span className="swatch-dot" aria-hidden="true" />
        In-game size
      </span>
    </span>
  );
}
