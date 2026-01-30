"use client";

import { useEffect, useState } from "react";

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export const PwaInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredPrompt | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    if (isStandalone) return;

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredPrompt);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler as EventListener);
    return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
  }, []);

  if (!visible || !deferredPrompt) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setVisible(false);
      setDeferredPrompt(null);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 1200,
        background: "linear-gradient(135deg, #ffffff, #ffe6f3)",
        border: "1px solid rgba(255, 42, 161, 0.25)",
        borderRadius: 14,
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        boxShadow: "0 12px 28px rgba(255, 42, 161, 0.25)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "#ff2aa1" }}>
        Instala la app en tu celular con un toque
      </div>
      <button
        onClick={handleInstall}
        style={{
          background: "#ff2aa1",
          color: "#ffffff",
          border: "none",
          borderRadius: 10,
          padding: "8px 12px",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Instalar
      </button>
    </div>
  );
};
