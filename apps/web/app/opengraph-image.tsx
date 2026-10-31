import { ImageResponse } from "next/og";

export const alt =
  "Incident Witness — portable, signature-verifiable incident evidence for decentralized compute";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px",
        background:
          "radial-gradient(900px 620px at 4% -8%, rgba(38,209,140,0.36), transparent 62%), #070908",
        color: "#f1f7f3",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "56px",
            height: "56px",
            border: "1px solid rgba(38,209,140,0.55)",
            borderRadius: "6px",
            background: "rgba(38,209,140,0.12)",
            color: "#67e9b4",
            fontSize: "30px",
            fontWeight: 700,
          }}
        >
          #
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.03em" }}>
            Incident Witness
          </span>
          <span style={{ fontSize: "15px", color: "#a2aca5", letterSpacing: "0.14em" }}>
            PORTABLE INCIDENT EVIDENCE
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: "58px",
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: "-0.04em",
            maxWidth: "980px",
          }}
        >
          <span>A common record of what</span>
          <span>each source observed.</span>
        </div>
        <div style={{ fontSize: "22px", color: "#a2aca5", maxWidth: "920px", lineHeight: 1.4 }}>
          Signed, bounded observations from a GPU host, a renter client and a platform-operated
          probe. Sealed, portable and verifiable offline.
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px", fontSize: "16px", color: "#67e9b4" }}>
        <span>RFC 8785 JCS</span>
        <span style={{ color: "#3f4a44" }}>·</span>
        <span>SHA-256</span>
        <span style={{ color: "#3f4a44" }}>·</span>
        <span>Ed25519</span>
        <span style={{ color: "#3f4a44" }}>·</span>
        <span>Offline verification</span>
      </div>
    </div>,
    size,
  );
}
