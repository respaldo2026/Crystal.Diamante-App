"use client";

import { Refine } from "@refinedev/core";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";
import { notificationProvider, RefineThemes, ThemedLayoutV2 } from "@refinedev/antd";
import { App as AntdApp, ConfigProvider } from "antd";
import routerProvider from "@refinedev/nextjs-router";
import "@refinedev/antd/dist/reset.css";
import React from "react";

// --- IMPORTACIONES EXACTAS SEGÚN TU PROYECTO ---
import { dataProvider } from "../providers/data-provider";
import { authProvider } from "../providers/auth-provider/auth-provider.client";

// --- TRUCO: SILENCIADOR DE ADVERTENCIAS ---
// Esto evita que salga la pantalla roja de "antd v5 support React 16~18"
if (typeof window !== "undefined") {
  const originalError = console.error;
  console.error = (...args) => {
    if (typeof args[0] === "string" && args[0].includes("antd v5 support")) return;
    originalError(...args);
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <RefineKbarProvider>
          <ConfigProvider theme={RefineThemes.Blue}>
            <AntdApp>
              <Refine
                routerProvider={routerProvider}
                dataProvider={dataProvider}
                authProvider={authProvider}
                notificationProvider={notificationProvider}
                resources={[
                  {
                    name: "perfiles",
                    list: "/perfiles",
                    create: "/perfiles/create",
                    edit: "/perfiles/edit",
                    show: "/perfiles/show",
                    meta: { label: "Estudiantes", icon: "👩‍🎓" },
                  },
                  {
                    name: "cursos",
                    list: "/cursos",
                    create: "/cursos/create",
                    edit: "/cursos/edit",
                    show: "/cursos/show",
                    meta: { label: "Cursos", icon: "📚" },
                  },
                  {
                    name: "matriculas",
                    list: "/matriculas",
                    create: "/matriculas/create",
                    edit: "/matriculas/edit",
                    show: "/matriculas/show",
                    meta: { label: "Matrículas", icon: "📝" },
                  },
                  {
                    name: "inventario",
                    list: "/inventario",
                    create: "/inventario/create",
                    edit: "/inventario/edit",
                    show: "/inventario/show",
                    meta: { label: "Inventario", icon: "💅" },
                  },
                ]}
                options={{
                  syncWithLocation: true,
                  warnWhenUnsavedChanges: true,
                  useNewQueryKeys: true,
                }}
              >
                {children}
                <RefineKbar />
              </Refine>
            </AntdApp>
          </ConfigProvider>
        </RefineKbarProvider>
      </body>
    </html>
  );
}