"use client";

import React from "react";

type GlobalLoadingScreenProps = {
  logoUrl?: string | null;
  title?: string;
  subtitle?: string;
};

export const GlobalLoadingScreen: React.FC<GlobalLoadingScreenProps> = ({
  title = "Cargando...",
  subtitle,
}) => {
  return (
    <div className="global-loading-screen" role="status" aria-live="polite" aria-label="Cargando aplicación">
      <div className="global-loading-card">
        <div className="global-loading-title">{title}</div>
        {subtitle ? <div className="global-loading-subtitle">{subtitle}</div> : null}
        <div className="skeleton-block skeleton-lg" />
        <div className="skeleton-block skeleton-sm" />
        <div className="skeleton-block skeleton-md" />
        <div className="skeleton-block skeleton-md" />
      </div>

      <style jsx>{`
        .global-loading-screen {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ffffff;
          padding: 16px;
        }

        .global-loading-card {
          width: min(420px, 100%);
          border: 1px solid #f1f5f9;
          border-radius: 12px;
          padding: 16px;
          background: #fff;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
        }

        .global-loading-title {
          color: #111827;
          font-size: 16px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .global-loading-subtitle {
          color: #6b7280;
          font-size: 13px;
          margin-bottom: 14px;
        }

        .skeleton-block {
          position: relative;
          overflow: hidden;
          border-radius: 8px;
          background: #eef2f7;
          margin-bottom: 10px;
        }

        .skeleton-block::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.75) 50%, transparent 100%);
          animation: shimmer 1.1s infinite;
        }

        .skeleton-lg { height: 38px; }
        .skeleton-sm { height: 18px; width: 42%; }
        .skeleton-md { height: 16px; width: 100%; }

        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
};
