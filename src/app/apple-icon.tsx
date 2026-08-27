import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
        }}
      >
        <div
          style={{
            display: "flex",
            color: "#B7F34A",
            fontSize: 120,
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
