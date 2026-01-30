"use client";

import type { ReactNode } from "react";
import React, { useState, useEffect } from "react";

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
        background: "linear-gradient(135deg, #ffffff 0%, #ffe6f3 40%, #ffb3db 70%, #ff6fb5 100%)",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: isMobile ? "4px" : isTablet ? "8px" : "16px 12px",
      }}
    >
      {/* Animated background gradients */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(circle at 15% 20%, rgba(255, 0, 153, 0.22), transparent 40%),
            radial-gradient(circle at 85% 80%, rgba(255, 0, 204, 0.18), transparent 45%),
            radial-gradient(circle at 45% 45%, rgba(255, 20, 147, 0.12), transparent 50%)
          `,
          pointerEvents: "none",
        }}
        aria-hidden
      />

      {/* Main container */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: isMobile ? "100%" : isTablet ? "900px" : "1400px",
          display: "flex",
          flexDirection: "column",
          gap: isMobile ? "8px" : isTablet ? "10px" : "14px",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h1
            style={{
              fontSize: isMobile ? "1.45rem" : isTablet ? "1.9rem" : "2.2rem",
              fontWeight: 800,
              margin: 0,
              color: "#ff2aa1",
              letterSpacing: "0.02em",
            }}
          >
            Academia de Belleza
          </h1>
          <div
            style={{
              marginTop: isMobile ? "4px" : "6px",
              fontSize: isMobile ? "1.25rem" : isTablet ? "1.6rem" : "1.8rem",
              fontWeight: 800,
              color: "#ff2aa1",
              letterSpacing: "0.02em",
            }}
          >
            Crystal Diamante
          </div>
          <p
            style={{
              margin: isMobile ? "4px 0 0" : "6px 0 0",
              fontSize: isMobile ? "0.85rem" : isTablet ? "0.95rem" : "1rem",
              fontWeight: 500,
              color: "#ff2aa1",
            }}
          >
            Plataforma Académica
          </p>
        </div>

        {/* Login form container */}
        <div
          style={{
            flex: "0 0 auto",
            width: "100%",
            maxWidth: isMobile ? "100%" : isTablet ? "420px" : "480px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
