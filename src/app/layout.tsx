"use client";

import React, { useState, useEffect } from "react";
import { Refine } from "@refinedev/core";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";
import { RefineThemes, ThemedLayout, ThemedTitle } from "@refinedev/antd";
import { ConfigProvider, App as AntdApp, Spin } from "antd";
import "@refinedev/antd/dist/reset.css";
import "@utils/suppress-warnings";

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
  CalendarOutlined,
  CustomerServiceOutlined,
  HomeOutlined,
  UsergroupAddOutlined,
  SolutionOutlined
} from "@ant-design/icons";

import routerProvider from "@refinedev/nextjs-router";

// PROVIDERS
import { dataProvider } from "../providers/data-provider"; 
import { authProvider } from "../providers/auth-provider/auth-provider.client";
import { QueryProvider } from "../providers/query-provider";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { useCurrentUser } from "@hooks/useCurrentUser"; 

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // --- CORRECCIÓN DEL ERROR DE HIDRATACIÓN ---
  // Estado para verificar si ya estamos en el navegador
  const [mounted, setMounted] = useState(false);
  const { user, loading: userLoading } = useCurrentUser();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Función para determinar qué recursos mostrar según el rol
  const getResourcesByRole = () => {
    const userRole = user?.rol;
    
    // Recursos para profesores: solo Mi Oficina
    if (userRole === "profesor") {
      return [
        {
          name: "mi-oficina",
          list: "/mi-oficina",
          meta: {
            label: "Mi Oficina",
            icon: <HomeOutlined />,
          },
        },
      ];
    }

    // Recursos para estudiantes: solo Mi Portal
    if (userRole === "estudiante") {
      return [
        {
          name: "portal-estudiante",
          list: "/portal-estudiante",
          meta: {
            label: "Mi Portal",
            icon: <BookOutlined />,
          },
        },
      ];
    }

    // Recursos completos para admin y administrativo (o null mientras carga)
    // Si userRole es null, admin o administrativo, mostrar todo
    return [
      {
        name: "dashboard",
        list: "/",
        meta: {
          label: "Dashboard",
          icon: <DashboardOutlined />,
        },
      },
      {
        name: "perfiles",
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
          icon: <SolutionOutlined />,
        },
      },
      {
        name: "programas",
        list: "/programas",
        meta: {
          label: "Programas",
          icon: <BookOutlined />,
        },
      },
      {
        name: "cursos",
        list: "/cursos",
        create: "/cursos/create",
        edit: "/cursos/edit/:id",
        show: "/cursos/show/:id",
        meta: {
          label: "Grupos",
          icon: <UsergroupAddOutlined />,
        },
      },
      {
        name: "leads",
        list: "/leads",
        meta: {
          label: "Leads",
          icon: <CustomerServiceOutlined />,
        },
      },
      {
        name: "planificador",
        list: "/planificador",
        meta: {
          label: "Planificador",
          icon: <CalendarOutlined />,
        },
      },
      {
        name: "matriculas",
        list: "/matriculas",
        create: "/matriculas/create",
        edit: "/matriculas/edit/:id",
        show: "/matriculas/show/:id",
        meta: {
          label: "Matrículas",
          icon: <FileTextOutlined />,
        },
      },
      {
        name: "pagos",
        list: "/pagos",
        create: "/pagos/create",
        edit: "/pagos/edit/:id",
        show: "/pagos/show/:id",
        meta: {
          label: "Pagos",
          icon: <DollarCircleOutlined />,
        },
      },
      {
        name: "nomina",
        list: "/nomina",
        create: "/nomina/create",
        meta: {
          label: "Nómina",
          icon: <CalculatorOutlined />,
        },
      },
      {
        name: "tesoreria",
        list: "/tesoreria",
        create: "/tesoreria/create",
        meta: {
          label: "Tesorería",
          icon: <DollarCircleOutlined />,
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
    ];
  };

  // Si no está montado (aún es servidor), mostramos un loader simple o nada.
  // Esto evita que el servidor genere IDs que luego choquen con el cliente.
  if (!mounted || userLoading) {
    return (
      <html lang="es">
        <body>
           <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
             Cargando...
           </div>
        </body>
      </html>
    );
  }
  // --------------------------------------------

  return (
    <html lang="es">
      <body>
        <QueryProvider>
          <RefineKbarProvider>
            <ConfigProvider 
            theme={{
              token: {
                colorPrimary: '#5B21B6', // Púrpura profesional más oscuro
                colorSuccess: '#059669', // Verde esmeralda
                colorWarning: '#D97706', // Ámbar
                colorError: '#DC2626', // Rojo más profesional
                colorInfo: '#0284C7', // Azul cyan profesional
                colorTextBase: '#1F2937', // Gris oscuro para texto
                colorBgBase: '#FFFFFF',
                borderRadius: 8,
                fontSize: 14,
              },
              components: {
                Button: {
                  controlHeight: 36,
                  fontWeight: 500,
                },
                Card: {
                  borderRadiusLG: 12,
                },
                Tag: {
                  borderRadiusSM: 6,
                },
                Table: {
                  headerBg: '#F9FAFB',
                  headerColor: '#374151',
                  rowHoverBg: '#F3F4F6',
                },
              },
            }}
          >
            <AntdApp>
              <Refine
                routerProvider={routerProvider}
                dataProvider={dataProvider}
                authProvider={authProvider}
                resources={getResourcesByRole()}
                options={{
                  syncWithLocation: true,
                  warnWhenUnsavedChanges: true,
                  redirect: {
                    afterLogout: "/login",
                  },
                }}
              >
                <ThemedLayout
                  initialSiderCollapsed={false}
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
        </QueryProvider>
      </body>
    </html>
  );
}