import { DevtoolsProvider } from "@providers/devtools";
import { useNotificationProvider } from "@refinedev/antd";
import { GitHubBanner, Refine } from "@refinedev/core";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";
import routerProvider from "@refinedev/nextjs-router";
import { Metadata } from "next";
import { cookies } from "next/headers";
import React, { Suspense } from "react";

import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ColorModeContextProvider } from "@contexts/color-mode";
import { authProviderClient } from "@providers/auth-provider/auth-provider.client";
import { dataProvider } from "@providers/data-provider";
import "@refinedev/antd/dist/reset.css";

export const metadata: Metadata = {
  title: "Academia Crystal",
  description: "Software de Gestión para Academia de Belleza",
  icons: {
    icon: "/favicon.ico",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const theme = cookieStore.get("theme");
  const defaultMode = theme?.value === "dark" ? "dark" : "light";

  return (
    <html lang="en">
      <body>
        <Suspense>
          <GitHubBanner />
          <RefineKbarProvider>
            <AntdRegistry>
              <ColorModeContextProvider defaultMode={defaultMode}>
                <DevtoolsProvider>
                  <Refine
                    routerProvider={routerProvider}
                    authProvider={authProviderClient}
                    dataProvider={dataProvider}
                    notificationProvider={useNotificationProvider}
                    // AQUI ESTA LA LISTA COMPLETA DE TUS MENUS
                    resources={[
                      {
                        name: "cursos",
                        list: "/cursos",
                        create: "/cursos/create",
                        edit: "/cursos/edit/:id",
                        show: "/cursos/show/:id",
                        meta: { canDelete: true },
                      },
                      {
                        name: "inventario",
                        list: "/inventario",
                        create: "/inventario/create",
                        edit: "/inventario/edit/:id",
                        show: "/inventario/show/:id",
                        meta: { canDelete: true },
                      },
                      {
                        name: "perfiles",
                        list: "/perfiles",
                        create: "/perfiles/create",
                        edit: "/perfiles/edit/:id",
                        show: "/perfiles/show/:id",
                        meta: { canDelete: true },
                      },
                      {
                        name: "matriculas",
                        list: "/matriculas",
                        create: "/matriculas/create",
                        edit: "/matriculas/edit/:id",
                        show: "/matriculas/show/:id",
                        meta: { canDelete: true },
                      }
                    ]}
                    options={{
                      syncWithLocation: true,
                      warnWhenUnsavedChanges: true,
                      projectId: "Jql38c-WWYmlx-vE6fxG",
                    }}
                  >
                    {children}
                    <RefineKbar />
                  </Refine>
                </DevtoolsProvider>
              </ColorModeContextProvider>
            </AntdRegistry>
          </RefineKbarProvider>
        </Suspense>
      </body>
    </html>
  );
}
