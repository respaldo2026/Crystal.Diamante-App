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
        background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 25%, #1e3a8a 50%, #0f172a 75%, #0c0a1a 100%)",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: isMobile ? "12px" : isTablet ? "20px" : "40px 24px",
      }}
    >
      {/* Animated background gradients */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(circle at 10% 20%, rgba(236, 72, 153, 0.15), transparent 40%),
            radial-gradient(circle at 80% 80%, rgba(168, 85, 247, 0.15), transparent 40%),
            radial-gradient(circle at 40% 40%, rgba(6, 182, 212, 0.1), transparent 50%)
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
          gap: isMobile ? "16px" : isTablet ? "24px" : "32px",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h1
            style={{
              fontSize: isMobile ? "1.7rem" : isTablet ? "2.2rem" : "2.6rem",
              fontWeight: 800,
              margin: 0,
              color: "#f8fafc",
              letterSpacing: "0.02em",
            }}
          >
            Academia Crystal Diamante
          </h1>
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
