import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * The same mark as components/Logo.tsx (charcoal badge, lime "P", no
 * counter/hole), redrawn as plain divs — ImageResponse renders via Satori,
 * which doesn't execute the app's React components or load its CSS.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#131313",
          borderRadius: 9,
        }}
      >
        <div
          style={{
            display: "flex",
            color: "#B7F34A",
            fontSize: 22,
            fontWeight: 800,
            fontFamily: "system-ui, sans-serif",
            lineHeight: 1,
          }}
        >
          P
        </div>
      </div>
    ),
    { ...size }
  );
}
