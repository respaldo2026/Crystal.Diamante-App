"use client";

import React from "react";
import { Refine } from "@refinedev/core";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";
// CORRECCIÓN: Usamos los componentes clásicos que SÍ tienes instalados
import { RefineThemes, ThemedLayout, ThemedTitle } from "@refinedev/antd";
import { ConfigProvider, App as AntdApp } from "antd";
import "@refinedev/antd/dist/reset.css";

// ICONOS
import { 
  DashboardOutlined, 
  UserOutlined, 
  TeamOutlined, 
  BookOutlined, 
  FileTextOutlined, 
  DollarCircleOutlined, 
  SettingOutlined, 
  CalculatorOutlined,
  ShopOutlined 
} from "@ant-design/icons";

import routerProvider from "@refinedev/nextjs-router";

// PROVIDERS
import { dataProvider } from "../providers/data-provider"; 
import { authProvider } from "../providers/auth-provider/auth-provider.client"; 

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <RefineKbarProvider>
          <ConfigProvider theme={RefineThemes.Purple}>
            <AntdApp>
              <Refine
                routerProvider={routerProvider}
                dataProvider={dataProvider}
                authProvider={authProvider}
                resources={[
                  {
                    name: "dashboard",
                    list: "/",
                    meta: {
                      label: "Dashboard",
                      icon: <DashboardOutlined />,
                    },
                  },
                  {
                    name: "estudiantes",
                    list: "/estudiantes",
                    create: "/estudiantes/create",
                    edit: "/estudiantes/edit/:id",
                    show: "/estudiantes/show/:id",
                    meta: {
                      label: "Estudiantes",
                      icon: <UserOutlined />,
                    },
                  },
                  {
                    name: "profesores",
                    list: "/profesores",
                    create: "/profesores/create",
                    edit: "/profesores/edit/:id",
                    show: "/profesores/show/:id",
                    meta: {
                      label: "Profesores",
                      icon: <TeamOutlined />,
                    },
                  },
                  {
                    name: "cursos",
                    list: "/cursos",
                    create: "/cursos/create",
                    edit: "/cursos/edit/:id",
                    show: "/cursos/show/:id",
                    meta: {
                      label: "Cursos",
                      icon: <BookOutlined />,
                    },
                  },
                  {
                    name: "matriculas",
                    list: "/matriculas",
                    create: "/matriculas/create",
                    edit: "/matriculas/edit/:id",
                    meta: {
                      label: "Matrículas",
                      icon: <FileTextOutlined />,
                    },
                  },
                  {
                    name: "inventario",
                    list: "/inventario",
                    meta: {
                      label: "Inventario",
                      icon: <ShopOutlined />,
                    },
                  },
                  // --- TESORERÍA ---
                  {
                    name: "tesoreria",
                    list: "/tesoreria",
                    create: "/tesoreria/create", // <--- ESTO ACTIVA EL BOTÓN
                    meta: {
                      label: "Tesorería",
                      icon: <DollarCircleOutlined />,
                    },
                  },
                  // -----------------
                  {
                    name: "nomina",
                    list: "/nomina",
                    meta: {
                      label: "Pago Profesores",
                      icon: <CalculatorOutlined />,
                    },
                  },
                  {
                    name: "configuracion",
                    list: "/configuracion",
                    meta: {
                      label: "Configuración",
                      icon: <SettingOutlined />,
                    },
                  },
                ]}
                options={{
                  syncWithLocation: true,
                  warnWhenUnsavedChanges: true,
                }}
              >
                {/* COMPONENTE CLÁSICO (Compatible con tu versión) */}
                <ThemedLayout
                  initialSiderCollapsed={true}
                  Title={({ collapsed }) => (
                    <ThemedTitle
                      collapsed={collapsed}
                      text="Crystal App"
                      icon={<BookOutlined />}
                    />
                  )}
                >
                  {children}
                </ThemedLayout>
                <RefineKbar />
              </Refine>
            </AntdApp>
          </ConfigProvider>
        </RefineKbarProvider>
      </body>
    </html>
  );
}