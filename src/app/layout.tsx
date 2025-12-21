"use client";

import React, { Suspense } from "react";
import { Refine } from "@refinedev/core";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App as AntdApp, Layout } from "antd";
import routerProvider from "@refinedev/nextjs-router";
import "@refinedev/antd/dist/reset.css";

import { dataProvider } from "../providers/data-provider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <Suspense>
          <AntdRegistry>
            <AntdApp>
              <Refine
                routerProvider={routerProvider}
                dataProvider={dataProvider}
                options={{
                  syncWithLocation: true,
                  warnWhenUnsavedChanges: true,
                }}
                resources={[
                  {
                    name: "matriculas",
                    list: "/matriculas",
                    create: "/matriculas/create",
                    edit: "/matriculas/edit/:id",
                    show: "/matriculas/show/:id",
                    meta: { canDelete: true, label: "Matrículas" },
                  },
                ]}
              >
                {/* DISEÑO SIMPLE Y LIMPIO - SIN FORMULARIOS */}
                <Layout style={{ minHeight: "100vh", background: "#f0f2f5" }}>
                  <Layout.Header style={{ display: 'flex', alignItems: 'center', padding: '0 24px' }}>
                     <h2 style={{ color: "white", margin: 0 }}>Crystal App</h2>
                  </Layout.Header>
                  <Layout.Content style={{ padding: "24px" }}>
                    <div style={{ background: "white", padding: "24px", borderRadius: "8px", minHeight: "80vh" }}>
                      {children}
                    </div>
                  </Layout.Content>
                </Layout>

              </Refine>
            </AntdApp>
          </AntdRegistry>
        </Suspense>
      </body>
    </html>
  );
}