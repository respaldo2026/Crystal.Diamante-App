"use client";

import type { ReactNode } from "react";
import React, { useState, useEffect } from "react";

const HIGHLIGHT_CARDS = [
  {
    title: "💅 Uñas Artísticas",
    icon: "✨",
    description: "Diseños 3D y tendencias globales",
    color: "#ec4899",
  },
  {
    title: "💄 Maquillaje Pro",
    icon: "🎨",
    description: "Técnicas HD y editorial",
    color: "#d946ef",
  },
  {
    title: "✂️ Barbería",
    icon: "💼",
    description: "Fades y estilismo premium",
    color: "#a855f7",
  },
  {
    title: "👁️ Miradas",
    icon: "✴️",
    description: "Cejas y pestañas perfectas",
    color: "#06b6d4",
  },
];

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
        padding: isMobile ? "12px" : isTablet ? "20px" : "24px",
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
          maxWidth: isMobile ? "100%" : isTablet ? "900px" : "1200px",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          gap: isMobile ? "16px" : "32px",
          alignItems: isMobile ? "stretch" : "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        {/* Left section - only visible on desktop and tablet */}
        {!isMobile && (
          <section
            style={{
              flex: isTablet ? 0 : 1,
              color: "#e2e8f0",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                padding: "6px 12px",
                borderRadius: "999px",
                background: "rgba(236, 72, 153, 0.15)",
                color: "#f472b6",
                fontSize: "0.8rem",
                fontWeight: 700,
                marginBottom: "12px",
                width: "fit-content",
                letterSpacing: "0.05em",
              }}
            >
              💎 ACADEMIA CRYSTAL
            </div>

            <h1
              style={{
                fontSize: isTablet ? "2rem" : "2.5rem",
                lineHeight: 1.1,
                fontWeight: 800,
                marginBottom: "12px",
                color: "#f8fafc",
                backgroundImage: "linear-gradient(135deg, #f8fafc, #cbd5f5)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Tu Belleza, <br />
              Tu Poder
            </h1>

            <p
              style={{
                fontSize: isTablet ? "0.95rem" : "1rem",
                lineHeight: 1.6,
                color: "#cbd5f5",
                marginBottom: "20px",
                maxWidth: "400px",
              }}
            >
              Domina las técnicas de belleza más demandadas con instructores certificados y recursos exclusivos. Impulsa tu carrera en la industria de la estética.
            </p>

            {/* Feature cards grid - only on desktop */}
            {!isTablet && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  marginBottom: "20px",
                }}
              >
                {HIGHLIGHT_CARDS.map((card) => (
                  <div
                    key={card.title}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "12px",
                      background: `linear-gradient(135deg, ${card.color}15, ${card.color}05)`,
                      border: `1px solid ${card.color}30`,
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    <div style={{ fontSize: "1.2rem", marginBottom: "4px" }}>{card.icon}</div>
                    <h4
                      style={{
                        margin: "0 0 4px 0",
                        fontSize: "0.9rem",
                        fontWeight: 600,
                        color: "#f8fafc",
                      }}
                    >
                      {card.title}
                    </h4>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.75rem",
                        color: "#cbd5f5",
                      }}
                    >
                      {card.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Mobile header */}
        {isMobile && (
          <div style={{ textAlign: "center", marginBottom: "8px" }}>
            <div
              style={{
                fontSize: "2.5rem",
                marginBottom: "8px",
              }}
            >
              💎
            </div>
            <h1
              style={{
                fontSize: "1.6rem",
                fontWeight: 800,
                margin: "0 0 8px 0",
                color: "#f8fafc",
                backgroundImage: "linear-gradient(135deg, #ec4899, #a855f7)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Crystal Diamante
            </h1>
            <p
              style={{
                fontSize: "0.85rem",
                color: "#cbd5f5",
                margin: 0,
                marginBottom: "8px",
              }}
            >
              Tu carrera en belleza profesional
            </p>

            {/* Feature chips - mobile */}
            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                justifyContent: "center",
                marginBottom: "8px",
              }}
            >
              {HIGHLIGHT_CARDS.map((card) => (
                <span
                  key={card.title}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "4px 10px",
                    borderRadius: "20px",
                    background: `${card.color}20`,
                    border: `1px solid ${card.color}40`,
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    color: "#f8fafc",
                  }}
                >
                  {card.icon} {card.title.split(" ")[1]}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Login form container */}
        <div
          style={{
            flex: 1,
            backdropFilter: "blur(12px)",
            padding: isMobile ? "16px" : isTablet ? "24px" : "28px",
            borderRadius: isMobile ? "16px" : "20px",
            background: "rgba(15, 23, 42, 0.6)",
            border: "1px solid rgba(236, 72, 153, 0.2)",
            boxShadow: "0 25px 50px rgba(0, 0, 0, 0.3)",
            minHeight: isMobile ? "auto" : "450px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            maxWidth: isMobile ? "100%" : isTablet ? "400px" : "380px",
            width: "100%",
          }}
        >
          {/* Decorative top element */}
          <div
            style={{
              textAlign: "center",
              marginBottom: "16px",
            }}
          >
            <span
              style={{
                fontSize: "2rem",
                display: "inline-block",
              }}
            >
              ✨
            </span>
          </div>

          <div
            style={{
              background: "#ffffff",
              borderRadius: isMobile ? "14px" : "16px",
              padding: isMobile ? "16px" : "20px",
              boxShadow: "0 15px 35px rgba(15, 23, 42, 0.2)",
            }}
          >
            <h2
              style={{
                textAlign: "center",
                fontSize: isMobile ? "1.2rem" : "1.4rem",
                fontWeight: 700,
                margin: "0 0 8px 0",
                color: "#1e1b4b",
                backgroundImage: "linear-gradient(135deg, #ec4899, #a855f7)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Acceso Rápido
            </h2>
            <p
              style={{
                textAlign: "center",
                fontSize: "0.85rem",
                color: "#6b7280",
                margin: "0 0 16px 0",
              }}
            >
              Ingresa con tu correo y cédula
            </p>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
