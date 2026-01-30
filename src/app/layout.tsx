import type { ReactNode } from "react";
import { Suspense } from "react";
import type { Metadata } from "next";
import "@refinedev/antd/dist/reset.css";
import "@utils/suppress-warnings";
import { AppShell } from "./AppShell";
import { PwaRegister } from "@components/PwaRegister";
import { LoginLanding } from "@components/auth-page/LoginLanding";
import { AuthPage } from "@components/auth-page";

export const metadata: Metadata = {
  title: "Academia Crystal Diamante",
  description: "Sistema de gestión académica - Academia de Belleza Crystal Diamante",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icon.svg",
  },
  manifest: "/manifest.webmanifest",
  themeColor: "#ff2aa1",
  openGraph: {
    type: "website",
    title: "Academia de Belleza Crystal Diamante",
    description: "Sistema de gestión académica",
    siteName: "Academia Crystal Diamante",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Academia Crystal Diamante",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Academia de Belleza Crystal Diamante",
    description: "Sistema de gestión académica",
    images: ["/og-image.svg"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Crystal Diamante",
  },
};

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
        <meta name="mobile-web-app-capable" content="yes" />
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