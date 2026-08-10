import qrcode from "qrcode-generator";

export interface QrCodeProps {
  /** The text this code encodes — e.g. a booking reference. */
  value: string;
  /** Rendered size in px (square). */
  size?: number;
  className?: string;
}

/**
 * Real, scannable QR code rendered as inline SVG rects — no canvas, no
 * dangerouslySetInnerHTML (the codebase has none anywhere; this keeps it
 * that way instead of using qrcode-generator's own createSvgTag() string).
 * Uses "M" error correction (~15% redundancy), the standard default for a
 * printed/on-screen ticket that might get slightly scuffed or glared on.
 */
export function QrCode({ value, size = 96, className }: QrCodeProps) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();

  const count = qr.getModuleCount();
  const cell = size / count;
  const modules: { row: number; col: number }[] = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) modules.push({ row, col });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR code for ${value}`}
    >
      <rect width={size} height={size} fill="#ffffff" />
      {modules.map((m) => (
        <rect key={`${m.row}-${m.col}`} x={m.col * cell} y={m.row * cell} width={cell} height={cell} fill="#0f172a" />
      ))}
    </svg>
  );
}
