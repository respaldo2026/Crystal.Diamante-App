"use client";

import React from "react";
import { Card, Skeleton } from "antd";

type GlobalLoadingScreenProps = {
  logoUrl?: string | null;
  title?: string;
  subtitle?: string;
};

export const GlobalLoadingScreen: React.FC<GlobalLoadingScreenProps> = ({
  title = "Cargando...",
}) => {
  return (
    <div className="global-loading-screen" role="status" aria-live="polite" aria-label="Cargando aplicación">
      <Card className="global-loading-card" bodyStyle={{ padding: 16 }}>
        <div className="global-loading-title">{title}</div>
        <Skeleton.Button active block style={{ height: 36, marginBottom: 12 }} />
        <Skeleton active paragraph={{ rows: 4 }} title={{ width: "60%" }} />
      </Card>

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
        }

        .global-loading-title {
          color: #111827;
          font-size: 16px;
          font-weight: 700;
          margin-bottom: 14px;
        }
      `}</style>
    </div>
  );
};
