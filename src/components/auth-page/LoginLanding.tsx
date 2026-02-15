"use client";

import type { ReactNode } from "react";
import React, { useState, useEffect } from "react";
import { PwaInstallPrompt } from "../PwaInstallPrompt";

export function LoginLanding({ children }: { children: ReactNode }) {
  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!mounted) return null;

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth < 1024;

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        background: "linear-gradient(140deg, #fff8fc 0%, #ffe7f3 35%, #ffd2e9 70%, #ffc2e0 100%)",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: isMobile ? "20px" : "32px",
        paddingBottom: isMobile ? "20px" : "32px",
        paddingLeft: isMobile ? "12px" : "28px",
        paddingRight: isMobile ? "12px" : "28px",
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(circle at 14% 20%, rgba(255, 47, 161, 0.20), transparent 38%),
            radial-gradient(circle at 85% 78%, rgba(255, 111, 181, 0.22), transparent 42%),
            radial-gradient(circle at 50% 52%, rgba(255, 255, 255, 0.42), transparent 45%)
          `,
          pointerEvents: "none",
        }}
        aria-hidden
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: isMobile ? "96%" : "1120px",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          gap: isMobile ? "16px" : "32px",
          alignItems: "stretch",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            flex: isMobile ? "0 0 auto" : "1 1 52%",
            borderRadius: 20,
            padding: isMobile ? "18px" : "28px",
            background: "rgba(255, 255, 255, 0.62)",
            border: "1px solid rgba(255,255,255,0.7)",
            boxShadow: "0 18px 40px rgba(196, 52, 128, 0.14)",
            backdropFilter: "blur(8px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              alignSelf: isMobile ? "center" : "flex-start",
              background: "rgba(255, 42, 161, 0.12)",
              color: "#c73384",
              borderRadius: 999,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 14,
            }}
          >
            Academy Crystal
          </div>

          <h1
            style={{
              fontSize: isMobile ? "1.45rem" : isTablet ? "1.9rem" : "2.2rem",
              fontWeight: 800,
              margin: 0,
              color: "#93205f",
              lineHeight: 1.2,
              textAlign: isMobile ? "center" : "left",
            }}
          >
            Bienvenido a Crystal Diamante
          </h1>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: isMobile ? "0.9rem" : "1rem",
              fontWeight: 500,
              color: "#7f4b67",
              lineHeight: 1.5,
              textAlign: isMobile ? "center" : "left",
            }}
          >
            Gestiona cursos, seguimiento académico y recursos en una experiencia moderna y segura.
          </p>

          <div
            style={{
              marginTop: 16,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              justifyContent: isMobile ? "center" : "flex-start",
            }}
          >
            {["Acceso seguro", "Panel académico", "Soporte institucional"].map((item) => (
              <span
                key={item}
                style={{
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.82)",
                  border: "1px solid rgba(255, 123, 184, 0.35)",
                  color: "#9b2a67",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "6px 10px",
                }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div
          style={{
            flex: isMobile ? "0 0 auto" : "1 1 48%",
            width: "100%",
            maxWidth: isMobile ? "100%" : "500px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            justifyContent: "center",
          }}
        >
          <PwaInstallPrompt inline={true} />
          {children}
        </div>
      </div>
    </div>
  );
}
