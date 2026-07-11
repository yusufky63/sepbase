import { ImageResponse } from "next/og";
import { projectConfig } from "@/config/project.config";

export const alt = `${projectConfig.brand.name} on ${projectConfig.chain.name}`;
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
        padding: "58px 72px",
        background: "#ffffff",
        color: "#0a0b0d",
        borderLeft: `32px solid ${projectConfig.brand.accent}`,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 22, borderBottom: "2px solid #0a0b0d", fontSize: 22 }}>
        <span>{projectConfig.brand.shortName}</span>
        <span>{projectConfig.chain.name.toUpperCase()} / {projectConfig.chain.id}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", lineHeight: .82, fontSize: 118, fontWeight: 700 }}>
        <span>{projectConfig.brand.name}</span>
        <span style={{ color: projectConfig.brand.accent }}>alice.{projectConfig.brand.suffix}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 22, borderTop: "2px solid #0a0b0d", fontSize: 22 }}>
        <span>{projectConfig.brand.motto}</span>
        <span>SEARCH / REGISTER / RESOLVE / TRADE</span>
      </div>
    </div>,
    size,
  );
}
