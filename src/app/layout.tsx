"use client";

import React, { Suspense } from "react";
import { Refine } from "@refinedev/core";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App as AntdApp, Layout, Button, Space, ConfigProvider } from "antd";
import routerProvider from "@refinedev/nextjs-router";
import Link from "next/link"; 
import "@refinedev/antd/dist/reset.css";

import { dataProvider } from "../providers/data-provider";
// import { authProvider } from "../providers/auth-provider"; 

// --- TEMA CRYSTAL (Púrpura) ---
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
                  // authProvider={authProvider} 
                  options={{
                    syncWithLocation: true,
                    warnWhenUnsavedChanges: true,
                  }}
                  resources={[
                    // 1. DASHBOARD
                    {
                      name: "dashboard",
                      list: "/", 
                      meta: { label: "Dashboard" },
                    },
                    // 2. ESTUDIANTES (Módulo Exclusivo)
                    {
                      name: "estudiantes",
                      list: "/estudiantes",
                      create: "/estudiantes/create",
                      edit: "/estudiantes/edit/:id",
                      show: "/estudiantes/show/:id",
                      meta: { canDelete: true, label: "Estudiantes" },
                    },
                    // 3. PROFESORES (Módulo Exclusivo)
                    {
                      name: "profesores",
                      list: "/profesores",
                      create: "/profesores/create",
                      edit: "/profesores/edit/:id",
                      show: "/profesores/show/:id",
                      meta: { label: "Docentes" },
                    },
                    // 4. MATRÍCULAS
                    {
                      name: "matriculas",
                      list: "/matriculas",
                      create: "/matriculas/create",
                      edit: "/matriculas/edit/:id",
                      show: "/matriculas/show/:id",
                      meta: { canDelete: true, label: "Matrículas" },
                    },
                    // 5. CURSOS
                    {
                      name: "cursos",
                      list: "/cursos",
                      create: "/cursos/create",
                      edit: "/cursos/edit/:id",
                      show: "/cursos/show/:id",
                      meta: { canDelete: true, label: "Cursos" },
                    },
                    // 6. INVENTARIO
                    {
                      name: "productos",
                      list: "/inventario",
                      create: "/inventario/create",
                      meta: { label: "Inventario" },
                    },
                    // 7. TESORERÍA
                    {
                      name: "tesoreria",
                      list: "/tesoreria",
                      meta: { label: "Tesorería" },
                    },
                  ]}
                >
                  <Layout style={{ minHeight: "100vh", background: "#f5f5f5" }}>
                    
                    {/* --- HEADER --- */}
                    <Layout.Header style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      padding: '0 24px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                      zIndex: 10
                    }}>
                       {/* LOGO */}
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
                          <h2 style={{ color: "white", margin: 0, fontWeight: 'bold' }}>
                              CRYSTAL APP
                          </h2>
                       </div>

                       {/* MENÚ DE NAVEGACIÓN */}
                       <Space wrap>
                          <Link href="/">
                            <Button type="text" style={{ color: 'white' }}>📊 Dashboard</Button>
                          </Link>
                          
                          {/* Botón Estudiantes */}
                          <Link href="/estudiantes">
                            <Button type="text" style={{ color: 'white' }}>🎓 Estudiantes</Button>
                          </Link>

                          {/* Botón Profesores */}
                          <Link href="/profesores">
                            <Button type="text" style={{ color: 'white' }}>👩‍🏫 Profesores</Button>
                          </Link>

                          <Link href="/cursos">
                            <Button type="text" style={{ color: 'white' }}>📚 Cursos</Button>
                          </Link>

                          <Link href="/inventario">
                            <Button type="text" style={{ color: 'white' }}>📦 Inventario</Button>
                          </Link>

                          <Link href="/tesoreria">
                            <Button type="text" style={{ color: 'white' }}>💰 Tesorería</Button>
                          </Link>
                          
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

                    {/* --- CONTENIDO --- */}
                    <Layout.Content style={{ padding: "24px", maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
                      <div style={{ minHeight: "80vh" }}>
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