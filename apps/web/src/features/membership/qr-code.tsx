import { encode } from 'uqr';

/**
 * A QR code drawn as SVG from the module matrix (no HTML injection). Dark modules on white with
 * a quiet zone, the contrast scanners need in both light and dark themes.
 */
export function QrCode({
  value,
  label,
  size = 240,
}: {
  value: string;
  label: string;
  size?: number;
}) {
  const { data } = encode(value, { ecc: 'M', border: 4 });
  const count = data.length;
  const path = data
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : '')))
    .join('');
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${count} ${count}`}
      shapeRendering="crispEdges"
      className="rounded-md"
    >
      <rect width={count} height={count} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
