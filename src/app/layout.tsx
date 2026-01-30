import type { ReactNode } from "react";
import { Suspense } from "react";
import "@refinedev/antd/dist/reset.css";
import "@utils/suppress-warnings";
import { AppShell } from "./AppShell";
import { PwaRegister } from "@components/PwaRegister";
import { LoginLanding } from "@components/auth-page/LoginLanding";
import { AuthPage } from "@components/auth-page";

const LayoutFallback = () => (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
      fontSize: 14,
      color: "#4b5563",
    }}
  >
    Preparando la interfaz…
  </div>
);

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#ff2aa1" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body>
        <Suspense fallback={<LayoutFallback />}>
          <AppShell>{children}</AppShell>
        </Suspense>
        <PwaRegister />
      </body>
    </html>
  );
}