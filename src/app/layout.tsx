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

// Definición de TODOS los recursos posibles del panel administrativo
const allResources = [
  {
    key: "dashboard",
    name: "dashboard",
    list: "/",
    meta: {
      label: "Dashboard",
      icon: <DashboardOutlined />,
    },
  },
  {
    key: "estudiantes",
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
    key: "profesores",
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
    key: "cursos",
    name: "programas",
    list: "/programas",
    meta: {
      label: "Programas",
      icon: <BookOutlined />,
    },
  },
  {
    key: "cursos",
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
    key: "leads",
    name: "leads",
    list: "/leads",
    meta: {
      label: "Leads",
      icon: <CustomerServiceOutlined />,
    },
  },
  {
    key: "planificador",
    name: "planificador",
    list: "/planificador",
    meta: {
      label: "Planificador",
      icon: <CalendarOutlined />,
    },
  },
  {
    key: "matriculas",
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
    key: "nomina",
    name: "nomina",
    list: "/nomina",
    create: "/nomina/create",
    meta: {
      label: "Nómina",
      icon: <CalculatorOutlined />,
    },
  },
  {
    key: "tesoreria",
    name: "tesoreria",
    list: "/tesoreria",
    create: "/tesoreria/create",
    meta: {
      label: "Tesorería",
      icon: <DollarCircleOutlined />,
    },
  },
  {
    key: "configuracion",
    name: "configuracion",
    list: "/configuracion",
    meta: {
      label: "Configuración",
      icon: <SettingOutlined />,
    },
  },
];

import routerProvider from "@refinedev/nextjs-router";

// PROVIDERS
import { dataProvider } from "../providers/data-provider"; 
import { authProvider } from "../providers/auth-provider/auth-provider.client";
import { QueryProvider } from "../providers/query-provider";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { useCurrentUser } from "@hooks/useCurrentUser"; 
import { RolesPermissionsProvider, useRolesPermissions } from "@contexts/roles-permissions-context";

const AppContent = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: userLoading } = useCurrentUser();
  const { permisos, loading: permisosLoading } = useRolesPermissions();

  // Función para determinar qué recursos mostrar según el rol
  const getResourcesByRole = () => {
    // Si aún está cargando, retornar array vacío temporalmente
    if (userLoading) {
      return [];
    }

    // Si no hay usuario, retornar array vacío
    if (!user) {
      return [];
    }

    const userRole = user.rol;
    
    // Recursos para ADMINISTRADORES y DIRECTORES: Dashboard completo + todos los módulos
    if (userRole === 'admin' || userRole === 'director') {
      return allResources; // Incluye el Dashboard como primer elemento
    }

    // Recursos para PROFESORES: solo Mi Oficina (sin dashboard)
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

    // Recursos para ESTUDIANTES: solo Mi Portal (sin dashboard)
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

    // Para ADMINISTRATIVOS: filtrar según la tabla de permisos
    // (incluye dashboard si tienen permisos)
    if (permisosLoading) {
      return allResources; // Mostrar todo mientras carga permisos
    }
    
    const userPermisos = permisos[userRole || ''] || {};
    
    return allResources.filter(resource => {
      // Dashboard siempre visible para administrativos
      if (!resource.key || resource.key === 'dashboard') return true;
      
      // Verificar si tiene permiso true en el objeto de permisos
      return userPermisos[resource.key] === true;
    });
  };

  // Mostrar spinner mientras carga el usuario
  if (userLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        gap: '16px'
      }}>
        <Spin size="large" />
        <div style={{ color: '#666', fontSize: '14px' }}>Cargando...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        gap: '16px'
      }}>
        <Spin size="large" />
        <div style={{ color: '#666', fontSize: '14px' }}>Verificando sesión...</div>
      </div>
    );
  }

  const resources = getResourcesByRole();

  return (
    <RefineKbarProvider>
      <ConfigProvider 
        theme={{
          token: {
            colorPrimary: '#5B21B6',
            colorSuccess: '#059669',
            colorWarning: '#D97706',
            colorError: '#DC2626',
            colorInfo: '#0284C7',
            colorTextBase: '#1F2937',
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
            resources={resources}
            options={{
              syncWithLocation: true,
              warnWhenUnsavedChanges: true,
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
  );
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <html lang="es">
        <body>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '100vh' 
          }}>
            <Spin size="large" />
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="es">
      <body>
        <QueryProvider>
          <RolesPermissionsProvider>
            <AppContent>{children}</AppContent>
          </RolesPermissionsProvider>
        </QueryProvider>
      </body>
    </html>
  );
}