import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c0e12",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 88,
              height: 88,
              borderRadius: 22,
              background: "#131313",
            }}
          >
            <div style={{ display: "flex", color: "#B7F34A", fontSize: 56, fontWeight: 800 }}>P</div>
          </div>
          <div style={{ display: "flex", color: "#f2f2f4", fontSize: 76, fontWeight: 700, letterSpacing: -2 }}>
            Provah
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 28, color: "#a3a3a3", fontSize: 32 }}>
          Provable STRK20 activity. Unlinkable capability.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 56,
            width: 64,
            height: 4,
            borderRadius: 2,
            background: "#B7F34A",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
