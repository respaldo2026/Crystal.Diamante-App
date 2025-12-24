"use client";

import React from "react";
import { Refine } from "@refinedev/core";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";
import { notificationProvider, RefineThemes, ThemedLayout, ThemedTitle } from "@refinedev/antd";
import { ConfigProvider, App as AntdApp } from "antd";
import "@refinedev/antd/dist/reset.css";

import { 
  DashboardOutlined, 
  UserOutlined, 
  TeamOutlined, 
  BookOutlined, 
  FileTextOutlined, 
  DollarCircleOutlined, 
  SettingOutlined, 
  ShopOutlined,
  CalculatorOutlined // <--- NUEVO ICONO PARA NÓMINA
} from "@ant-design/icons";

import routerProvider from "@refinedev/nextjs-router";

// TUS PROVIDERS (No los cambies si ya funcionan)
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
                notificationProvider={notificationProvider}
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
                    meta: {
                      label: "Matrículas",
                      icon: <FileTextOutlined />,
                    },
                  },
                  {
                    name: "tesoreria",
                    list: "/tesoreria",
                    meta: {
                      label: "Tesorería",
                      icon: <DollarCircleOutlined />,
                    },
                  },
                  // --- AQUÍ ESTÁ EL NUEVO BOTÓN DE NÓMINA ---
                  {
                    name: "nomina",
                    list: "/nomina",
                    meta: {
                      label: "Pago Profesores",
                      icon: <CalculatorOutlined />,
                    },
                  },
                  // ------------------------------------------
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