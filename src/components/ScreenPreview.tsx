"use client";

const NATIVE_W = 1280;
const NATIVE_H = 720;

export function ScreenPreview({ src, width = 300 }: { src: string; width?: number }) {
  const scale = width / NATIVE_W;
  const height = NATIVE_H * scale;

  return (
    <div
      style={{ width, height }}
      className="rounded-xl overflow-hidden border border-[var(--surface-border)] bg-[var(--background)] shrink-0"
    >
      <iframe
        src={src}
        style={{
          width: NATIVE_W,
          height: NATIVE_H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          border: "none",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
