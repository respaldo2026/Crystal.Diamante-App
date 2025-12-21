"use client";

import React, { Suspense } from "react";
import { Refine } from "@refinedev/core";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App as AntdApp, Layout, Button, Space, ConfigProvider } from "antd";
import routerProvider from "@refinedev/nextjs-router";
import Link from "next/link"; 
import "@refinedev/antd/dist/reset.css";

import { dataProvider } from "../providers/data-provider";

// TEMA CRYSTAL (Púrpura)
const crystalTheme = {
  token: {
    colorPrimary: "#722ed1", 
    borderRadius: 8, 
    fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  components: {
    Layout: { headerBg: "#722ed1" },
    Button: { controlHeight: 40, fontWeight: 600 }
  }
};

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
            <ConfigProvider theme={crystalTheme}>
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
                    {
                      name: "perfiles",
                      list: "/perfiles",
                      create: "/perfiles/create",
                      edit: "/perfiles/edit/:id",
                      show: "/perfiles/show/:id",
                      meta: { canDelete: true, label: "Estudiantes" },
                    },
                    // --- NUEVO RECURSO: CURSOS ---
                    {
                      name: "cursos",
                      list: "/cursos",
                      create: "/cursos/create",
                      edit: "/cursos/edit/:id",
                      show: "/cursos/show/:id",
                      meta: { canDelete: true, label: "Cursos" },
                    },
                  ]}
                >
                  <Layout style={{ minHeight: "100vh", background: "#f5f5f5" }}>
                    
                    {/* CABECERA */}
                    <Layout.Header style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      padding: '0 24px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                      zIndex: 10
                    }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ 
                            background: 'white', 
                            borderRadius: '50%', 
                            width: '35px', 
                            height: '35px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            fontSize: '20px'
                          }}>💎</div>
                          <h2 style={{ color: "white", margin: 0, fontWeight: 'bold', letterSpacing: '1px' }}>
                              CRYSTAL APP
                          </h2>
                       </div>

                       <Space wrap>
                          <Link href="/">
                            <Button type="text" style={{ color: 'white' }}>📊 Dashboard</Button>
                          </Link>
                          
                          {/* BOTONES DE NAVEGACIÓN */}
                          <Link href="/cursos">
                            <Button type="text" style={{ color: 'white' }}>📚 Cursos</Button>
                          </Link>
                          <Link href="/perfiles">
                            <Button type="text" style={{ color: 'white' }}>👥 Estudiantes</Button>
                          </Link>
                          
                          {/* Matrículas resaltado */}
                          <Link href="/matriculas">
                            <Button style={{ 
                                background: 'white', 
                                color: crystalTheme.token.colorPrimary, 
                                border: 'none' 
                            }}>
                                📝 Matrículas
                            </Button>
                          </Link>
                       </Space>
                    </Layout.Header>

                    <Layout.Content style={{ padding: "24px", maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
                      <div style={{ minHeight: "80vh", borderRadius: "12px" }}>
                        {children}
                      </div>
                    </Layout.Content>
                  </Layout>

                </Refine>
              </AntdApp>
            </ConfigProvider>
          </AntdRegistry>
        </Suspense>
      </body>
    </html>
  );
}