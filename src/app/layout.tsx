"use client";

import React, { Suspense } from "react";
import { Refine } from "@refinedev/core";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App as AntdApp, Layout, Button, Space } from "antd";
import routerProvider from "@refinedev/nextjs-router";
import Link from "next/link"; 
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
                    name: "dashboard",
                    list: "/", 
                    meta: { label: "Dashboard" },
                  },
                  {
                    name: "matriculas",
                    list: "/matriculas",
                    create: "/matriculas/create",
                    edit: "/matriculas/edit/:id",
                    show: "/matriculas/show/:id",
                    meta: { canDelete: true, label: "Matrículas" },
                  },
                  // NUEVO RECURSO: PERFILES (ESTUDIANTES)
                  {
                    name: "perfiles",
                    list: "/perfiles",
                    create: "/perfiles/create",
                    edit: "/perfiles/edit/:id",
                    show: "/perfiles/show/:id",
                    meta: { canDelete: true, label: "Estudiantes" },
                  },
                ]}
              >
                <Layout style={{ minHeight: "100vh", background: "#f0f2f5" }}>
                  
                  {/* CABECERA CON NUEVO BOTÓN */}
                  <Layout.Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
                     <h2 style={{ color: "white", margin: 0, marginRight: '20px' }}>
                        💎 Crystal App
                     </h2>

                     <Space wrap>
                        <Link href="/">
                          <Button type="primary" ghost>📊 Dashboard</Button>
                        </Link>
                        {/* BOTÓN NUEVO */}
                        <Link href="/perfiles">
                          <Button type="primary" ghost>👥 Estudiantes</Button>
                        </Link>
                        <Link href="/matriculas">
                          <Button type="primary" ghost>📝 Matrículas</Button>
                        </Link>
                     </Space>
                  </Layout.Header>

                  <Layout.Content style={{ padding: "24px" }}>
                    <div style={{ background: "transparent", minHeight: "80vh" }}>
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