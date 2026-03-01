"use client";

import React from "react";
import Lottie from "lottie-react";
import globalLoaderAnimation from "@/assets/lottie/global-loader.json";

type GlobalLoadingScreenProps = {
  logoUrl?: string | null;
  title?: string;
  subtitle?: string;
};

export const GlobalLoadingScreen: React.FC<GlobalLoadingScreenProps> = ({
  logoUrl,
  title = "Academia Crystal Diamante",
  subtitle = "Cargando tu experiencia...",
}) => {
  const imageSrc = logoUrl || "/icon.svg";
  const [showFallbackImage, setShowFallbackImage] = React.useState(false);

  return (
    <div className="global-loading-screen" role="status" aria-live="polite" aria-label="Cargando aplicación">
      <div className="global-loading-card">
        <div className="global-loading-media">
          {!showFallbackImage ? (
            <Lottie
              animationData={globalLoaderAnimation}
              loop
              autoplay
              className="global-loading-lottie"
              onDataFailed={() => setShowFallbackImage(true)}
            />
          ) : (
            <img src={imageSrc} alt={title} className="global-loading-logo" />
          )}
        </div>
        <div className="global-loading-title">{title}</div>
        <div className="global-loading-subtitle">{subtitle}</div>
        <div className="global-loading-progress-track">
          <span className="global-loading-progress-bar" />
        </div>
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
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          text-align: center;
        }

        .global-loading-media {
          width: 140px;
          height: 140px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .global-loading-lottie {
          width: 140px;
          height: 140px;
        }

        .global-loading-logo {
          width: 112px;
          height: 112px;
          object-fit: contain;
          animation: logoPulse 1.6s ease-in-out infinite;
        }

        .global-loading-title {
          color: #111827;
          font-size: 16px;
          font-weight: 700;
          letter-spacing: 0.2px;
        }

        .global-loading-subtitle {
          color: #4b5563;
          font-size: 13px;
        }

        .global-loading-progress-track {
          width: 100%;
          max-width: 280px;
          height: 8px;
          border-radius: 999px;
          background: #f3f4f6;
          overflow: hidden;
          position: relative;
        }

        .global-loading-progress-bar {
          position: absolute;
          inset: 0 auto 0 -40%;
          width: 40%;
          border-radius: inherit;
          background: linear-gradient(90deg, #d81b87 0%, #f472b6 100%);
          animation: slideBar 1.2s ease-in-out infinite;
        }

        @keyframes logoPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.85;
          }
          50% {
            transform: scale(1.06);
            opacity: 1;
          }
        }

        @keyframes slideBar {
          0% {
            left: -40%;
          }
          100% {
            left: 100%;
          }
        }
      `}</style>
    </div>
  );
};
