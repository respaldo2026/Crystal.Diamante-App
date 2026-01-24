import type { ReactNode } from "react";
import { Suspense } from "react";
import "@refinedev/antd/dist/reset.css";
import "@utils/suppress-warnings";
import { AppShell } from "./AppShell";

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
      <body>
        <Suspense fallback={<LayoutFallback />}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}