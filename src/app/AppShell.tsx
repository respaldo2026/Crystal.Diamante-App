"use client";

import React, { useMemo, useCallback, useEffect, useState } from "react";
import {
  Refine,
  useLogout,
  useMenu,
  useTranslate,
  useIsExistAuthentication,
  useLink,
  useWarnAboutChange,
  type TreeMenuItem,
} from "@refinedev/core";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";
import {
  ThemedLayout,
  ThemedTitle,
  useThemedLayoutContext,
  type RefineThemedLayoutHeaderProps,
  type RefineLayoutThemedTitleProps,
} from "@refinedev/antd";
import {
  ConfigProvider,
  App as AntdApp,
  Layout,
  Menu,
  Drawer,
  Button,
  Grid,
  theme,
  Dropdown,
} from "antd";
import type { MenuProps } from "antd";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  DashboardOutlined,
  UserOutlined,
  BookOutlined,
  FileTextOutlined,
  DollarCircleOutlined,
  SettingOutlined,
  CalculatorOutlined,
  CalendarOutlined,
  CustomerServiceOutlined,
  HomeOutlined,
  UsergroupAddOutlined,
  SolutionOutlined,
  LogoutOutlined,
  UnorderedListOutlined,
  BarsOutlined,
  LeftOutlined,
  RightOutlined,
  NotificationOutlined,
  ShoppingCartOutlined,
  WhatsAppOutlined,
} from "@ant-design/icons";
import routerProvider from "@refinedev/nextjs-router";
import { dataProvider } from "@/providers/data-provider";
import { authProvider } from "@/providers/auth-provider/auth-provider.client";
import { QueryProvider } from "@/providers/query-provider";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { RolesPermissionsProvider, useRolesPermissions } from "@/contexts/roles-permissions-context";
import { ColorModeContextProvider } from "@/contexts/color-mode";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { GlobalLoadingScreen } from "@/components/GlobalLoadingScreen";

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
    key: "marketing-center",
    name: "marketing-center",
    list: "/marketing-center",
    meta: {
      label: "Marketing Center",
      icon: <NotificationOutlined />,
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
    key: "catalogo",
    name: "catalogo",
    list: "/catalogo",
    meta: {
      label: "Catálogo cursos",
      icon: <BarsOutlined />,
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
    key: "caja",
    name: "caja",
    list: "/caja",
    meta: {
      label: "Caja / POS",
      icon: <ShoppingCartOutlined />,
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
    key: "rentabilidad",
    name: "rentabilidad",
    list: "/rentabilidad",
    meta: {
      label: "Análisis de Rentabilidad",
      icon: <CalculatorOutlined />,
    },
  },
  {
    key: "conversaciones",
    name: "conversaciones",
    list: "/conversaciones",
    meta: {
      label: "Conversaciones IA",
      icon: <UnorderedListOutlined />,
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

const DEFAULT_BRANDING_LOGO = "/branding/logo-default.png";

const normalizeWhatsappPhone = (value?: string | null): string | null => {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const matchWa = text.match(/wa\.me\/(\d+)/i);
  const base = matchWa?.[1] || text;
  let digits = base.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) digits = `57${digits}`;
  return digits;
};

const LOGOUT_MENU_KEY = "__logout";

type CustomSiderProps = {
  Title?: React.FC<RefineLayoutThemedTitleProps>;
  meta?: Record<string, unknown>;
  fixed?: boolean;
  activeItemDisabled?: boolean;
  siderItemsAreCollapsed?: boolean;
};

type MenuClickEvent = Parameters<NonNullable<MenuProps["onClick"]>>[0];


const CustomSider: React.FC<CustomSiderProps> = ({
  Title: TitleFromProps,
  meta,
  fixed,
  activeItemDisabled = false,
  siderItemsAreCollapsed = true,
}) => {
  const { token } = theme.useToken();
  const {
    siderCollapsed,
    setSiderCollapsed,
    mobileSiderOpen,
    setMobileSiderOpen,
  } = useThemedLayoutContext();

  const breakpoint = Grid.useBreakpoint();
  const isMobile = typeof breakpoint.lg === "undefined" ? false : !breakpoint.lg;

  const direction = React.useContext(ConfigProvider.ConfigContext)?.direction;
  const isExistAuthentication = useIsExistAuthentication();
  const { mutate: mutateLogout } = useLogout();
  const { warnWhen, setWarnWhen } = useWarnAboutChange();
  const translate = useTranslate();
  const Link = useLink();
  const { menuItems, selectedKey, defaultOpenKeys } = useMenu({ meta });

  const RenderToTitle = TitleFromProps ?? ThemedTitle;

  const handleLogout = useCallback(() => {
    if (warnWhen) {
      const confirmLeave = window.confirm(
        translate(
          "warnWhenUnsavedChanges",
          "Are you sure you want to leave? You have unsaved changes.",
        ),
      );

      if (!confirmLeave) {
        return;
      }

      setWarnWhen(false);
    }

    mutateLogout();
  }, [mutateLogout, setWarnWhen, translate, warnWhen]);

  const buildMenuItems = useCallback(
    (tree: TreeMenuItem[]): MenuProps["items"] => {
      return tree
        .map((item) => {
          const { key, name, children, meta: itemMeta, list } = item;
          const parentName = itemMeta?.parent;
          const labelText = item.label ?? itemMeta?.label ?? name;
          const iconNode = itemMeta?.icon;
          const hasChildren = children.length > 0;
          const childItems = hasChildren ? buildMenuItems(children) : undefined;
          const isSelected = key === selectedKey;
          const disabled = activeItemDisabled && isSelected;
          const route = list;
          const isRoute = !(parentName !== undefined && children.length === 0);

          if (hasChildren) {
            if (!childItems || childItems.length === 0) {
              return null;
            }

            return {
              key,
              icon: iconNode ?? <UnorderedListOutlined />,
              label: labelText,
              children: childItems,
            } satisfies NonNullable<MenuProps["items"]>[number];
          }

          const labelNode = disabled || !route ? (
            <span>{labelText}</span>
          ) : (
            <Link
              to={route ?? ""}
              style={{
                display: "inline-block",
                width: "100%",
              }}
            >
              {labelText}
            </Link>
          );

          return {
            key,
            icon: iconNode ?? (isRoute ? <UnorderedListOutlined /> : undefined),
            label: labelNode,
            disabled,
          } satisfies NonNullable<MenuProps["items"]>[number];
        })
        .filter(Boolean) as MenuProps["items"];
    },
    [Link, activeItemDisabled, selectedKey],
  );

  const menuStructure = useMemo(() => {
    const baseItems = buildMenuItems(menuItems) ?? [];

    if (!isExistAuthentication) {
      return baseItems;
    }

    return [
      ...baseItems,
      { type: "divider" as const },
      {
        key: LOGOUT_MENU_KEY,
        icon: <LogoutOutlined />,
        label: translate("buttons.logout", "Logout"),
      },
    ] as MenuProps["items"];
  }, [buildMenuItems, isExistAuthentication, menuItems, translate]);

  const defaultExpandMenuItems = useMemo(() => {
    if (siderItemsAreCollapsed) {
      return [] as string[];
    }

    return menuItems.map(({ key }) => key);
  }, [menuItems, siderItemsAreCollapsed]);

  const onMenuClick = useCallback(
    (info: MenuClickEvent) => {
      if (String(info.key) === LOGOUT_MENU_KEY) {
        handleLogout();
        return;
      }

      setMobileSiderOpen(false);
    },
    [handleLogout, setMobileSiderOpen],
  );

  const renderMenu = () => (
    <Menu
      items={menuStructure}
      selectedKeys={selectedKey ? [selectedKey] : []}
      defaultOpenKeys={[...defaultOpenKeys, ...defaultExpandMenuItems]}
      mode="inline"
      style={{
        paddingTop: "8px",
        border: "none",
        overflow: "auto",
        height: "calc(100% - 80px)",
      }}
      onClick={onMenuClick}
    />
  );

  const renderClosingIcons = () => {
    const iconProps = { style: { color: token.colorPrimary } };
    const OpenIcon = direction === "rtl" ? RightOutlined : LeftOutlined;
    const CollapsedIcon = direction === "rtl" ? LeftOutlined : RightOutlined;
    const IconComponent = siderCollapsed ? CollapsedIcon : OpenIcon;

    return <IconComponent {...iconProps} />;
  };

  const drawerSider = (
    <>
      <Drawer
        open={mobileSiderOpen}
        onClose={() => setMobileSiderOpen(false)}
        placement={direction === "rtl" ? "right" : "left"}
        closable={false}
        width={160}
        styles={{
          body: {
            padding: 0,
          },
        }}
        maskClosable
      >
        <Layout>
          <Layout.Sider
            style={{
              height: "100vh",
              backgroundColor: token.colorBgContainer,
              borderRight: `1px solid ${token.colorBgElevated}`,
            }}
          >
            <div
              style={{
                width: "200px",
                padding: "12px 16px",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "80px",
                backgroundColor: token.colorBgElevated,
              }}
            >
              <RenderToTitle collapsed={false} />
            </div>
            {renderMenu()}
          </Layout.Sider>
        </Layout>
      </Drawer>
      <Button
        style={{
          position: "fixed",
          top: 16,
          left: 16,
          zIndex: 1000,
        }}
        size="large"
        onClick={() => setMobileSiderOpen(true)}
        icon={<BarsOutlined />}
      />
    </>
  );

  if (isMobile) {
    return drawerSider;
  }

  const siderStyles: React.CSSProperties = {
    backgroundColor: token.colorBgContainer,
    borderRight: `1px solid ${token.colorBgElevated}`,
  };

  if (fixed) {
    siderStyles.position = "fixed";
    siderStyles.top = 0;
    siderStyles.height = "100vh";
    siderStyles.zIndex = 999;
  }

  return (
    <>
      {fixed && (
        <div
          style={{
            width: siderCollapsed ? "80px" : "200px",
            transition: "all 0.2s",
          }}
        />
      )}
      <Layout.Sider
        style={siderStyles}
        collapsible
        collapsed={siderCollapsed}
        onCollapse={(collapsed, type) => {
          if (type === "clickTrigger") {
            setSiderCollapsed(collapsed);
          }
        }}
        collapsedWidth={80}
        breakpoint="lg"
        trigger={
          <Button
            type="text"
            style={{
              borderRadius: 0,
              height: "100%",
              width: "100%",
              backgroundColor: token.colorBgElevated,
            }}
          >
            {renderClosingIcons()}
          </Button>
        }
      >
        <div
          style={{
            width: siderCollapsed ? "80px" : "200px",
            padding: siderCollapsed ? "12px" : "12px 16px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "80px",
            backgroundColor: token.colorBgElevated,
            fontSize: "14px",
            transition: "all 0.2s ease",
          }}
        >
          <RenderToTitle collapsed={siderCollapsed} />
        </div>
        {renderMenu()}
      </Layout.Sider>
    </>
  );
};

const FullScreenLoader: React.FC<{ logoUrl?: string | null; subtitle?: string }> = ({
  logoUrl,
  subtitle,
}) => <GlobalLoadingScreen logoUrl={logoUrl} subtitle={subtitle} />;

type PortalHeaderProps = RefineThemedLayoutHeaderProps & {
  pathname?: string | null;
  brandingLogo?: string | null;
  whatsappAgente?: string | null;
  whatsappAcademia?: string | null;
};

const PortalTopHeader: React.FC<PortalHeaderProps> = ({
  pathname,
  brandingLogo,
  whatsappAgente,
  whatsappAcademia,
}) => {
  const {
    siderCollapsed,
    setSiderCollapsed,
    setMobileSiderOpen,
  } = useThemedLayoutContext();
  const breakpoint = Grid.useBreakpoint();
  const isMobile = typeof breakpoint.lg === "undefined" ? false : !breakpoint.lg;
  const isVerySmall = typeof breakpoint.sm === "undefined" ? false : !breakpoint.sm;
  const [logoLoadError, setLogoLoadError] = useState(false);

  const isStudentPortal = Boolean(pathname?.startsWith("/portal-estudiante"));
  const displayLogo = logoLoadError ? DEFAULT_BRANDING_LOGO : (brandingLogo || DEFAULT_BRANDING_LOGO);

  useEffect(() => {
    setLogoLoadError(false);
  }, [brandingLogo]);

  const openWhatsapp = useCallback((phone: string | null, text: string) => {
    if (!phone) return;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }, []);

  const whatsappItems: MenuProps["items"] = useMemo(
    () => [
      {
        key: "agente",
        label: "Hablar con Agente",
        disabled: !whatsappAgente,
      },
      {
        key: "academia",
        label: "Hablar con Academia",
        disabled: !whatsappAcademia,
      },
    ],
    [whatsappAgente, whatsappAcademia]
  );

  if (!isStudentPortal) return null;

  return (
    <>
      <Layout.Header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1000,
          height: isVerySmall ? 52 : 56,
          lineHeight: isVerySmall ? "52px" : "56px",
          padding: isVerySmall ? "0 10px" : "0 12px",
          background: "#fff",
          borderBottom: "1px solid #f0f0f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Button
          type="text"
          shape="circle"
          size="middle"
          icon={<BarsOutlined />}
          onClick={() => {
            if (isMobile) {
              setMobileSiderOpen(true);
            } else {
              setSiderCollapsed(!siderCollapsed);
            }
          }}
          aria-label="Abrir menú"
        />

        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <Image
            src={displayLogo}
            alt="Academia Crystal Diamante"
            width={isVerySmall ? 138 : 165}
            height={isVerySmall ? 36 : 44}
            unoptimized
            onError={() => setLogoLoadError(true)}
            style={{
              maxHeight: isVerySmall ? 36 : 44,
              maxWidth: isVerySmall ? 138 : 165,
              width: "auto",
              height: "auto",
              objectFit: "contain",
              display: "block",
            }}
          />
        </div>

        <Dropdown
          trigger={["click"]}
          menu={{
            items: whatsappItems,
            onClick: ({ key }) => {
              const messageText = "Hola, soy estudiante del portal y necesito apoyo.";
              if (key === "agente") {
                openWhatsapp(whatsappAgente || null, messageText);
                return;
              }
              openWhatsapp(whatsappAcademia || null, messageText);
            },
          }}
        >
          <Button
            type="text"
            icon={<WhatsAppOutlined style={{ color: "#25d366" }} />}
            style={{
              border: "1px solid #d9f7e2",
              borderRadius: isVerySmall ? 8 : 10,
              color: "#059669",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: isVerySmall ? 32 : 34,
              minWidth: isVerySmall ? 32 : 34,
              paddingInline: isVerySmall ? 8 : 10,
            }}
          />
        </Dropdown>
      </Layout.Header>
      <style jsx global>{`
        .ant-layout-sider-zero-width-trigger,
        .ant-layout-sider-trigger {
          display: none !important;
        }
      `}</style>
    </>
  );
};

const AppInner = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: userLoading } = useCurrentUser();
  const { permisos, loading: permisosLoading } = useRolesPermissions();
  const pathname = usePathname();
  const [brandingName, setBrandingName] = useState("Crystal App");
  const [brandingLogo, setBrandingLogo] = useState<string | null>(DEFAULT_BRANDING_LOGO);
  const [whatsappAgente, setWhatsappAgente] = useState<string | null>(null);
  const [whatsappAcademia, setWhatsappAcademia] = useState<string | null>("573012038582");
  const [showUserLoader, setShowUserLoader] = useState(false);

  useEffect(() => {
    if (!userLoading) {
      setShowUserLoader(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setShowUserLoader(true);
    }, 180);

    return () => clearTimeout(timeoutId);
  }, [userLoading]);

  const themeConfig = useMemo(
    () => ({
      algorithm: theme.defaultAlgorithm,
      token: {
        colorPrimary: "#d81b87",
        colorSuccess: "#059669",
        colorWarning: "#D97706",
        colorError: "#DC2626",
        colorInfo: "#0284C7",
        colorTextBase: "#1F2937",
        colorText: "#1F2937",
        colorTextSecondary: "#374151",
        colorTextTertiary: "#4B5563",
        colorBgBase: "#F6F8FB",
        colorBgContainer: "#F0F3F8",
        colorBgElevated: "#FFFFFF",
        colorBgLayout: "#e1e6ee",
        colorBorder: "#c9d1de",
        colorBorderSecondary: "#d4dbe6",
        colorFillSecondary: "#e3e8f1",
        colorPrimaryBg: "#f8dbe9",
        controlOutline: "#d81b87",
        borderRadius: 8,
        fontSize: 14,
        // Compact global paddings
        paddingLG: 16,
        paddingMD: 12,
        paddingSM: 8,
        paddingXS: 4,
      },
      components: {
        Button: {
          controlHeight: 36,
          paddingInline: 12,
          fontWeight: 700,
        },
        Card: {
          borderRadiusLG: 12,
          padding: 14,
          paddingSM: 12,
          paddingLG: 16,
          bodyPadding: 14,
        },
        Tag: {
          borderRadiusSM: 6,
        },
        Table: {
          headerBg: "#F9FAFB",
          headerColor: "#374151",
          rowHoverBg: "#E9EEF6",
          borderColor: "#E5E7EB",
          headerPadding: 10,
          cellPaddingBlock: 8,
          cellPaddingInline: 10,
        },
        Layout: {
          bodyBg: "#e1e6ee",
          headerBg: "#FFFFFF",
          headerPadding: "0 16px",
        },
        Menu: {
          itemHeight: 38,
          itemPaddingInline: 12,
          itemMarginInline: 4,
        },
        Input: {},
        Select: {},
        Modal: {
          contentBg: "#FFFFFF",
          headerBg: "#FFFFFF",
          colorBgMask: "rgba(15, 23, 42, 0.55)",
          borderRadiusLG: 14,
          paddingMD: 18,
        },
        Drawer: {
          colorBgElevated: "#FFFFFF",
          colorBgMask: "rgba(15, 23, 42, 0.55)",
        },
      },
    }),
    [],
  );

  const i18nProvider = useMemo(() => {
    const messages: Record<string, string> = {
      "pages.login.title": "Accede a tu cuenta",
      "pages.login.subtitle": "Plataforma Académica",
      "pages.login.signin": "Iniciar sesión",
      "pages.login.buttons.submit": "Entrar",
      "pages.login.buttons.forgotPassword": "¿Olvidaste tu contraseña?",
      "pages.login.buttons.remember": "Recordar sesión",
      "pages.login.fields.email": "Correo electrónico",
      "pages.login.fields.password": "Contraseña",
      "pages.login.fields.remember": "Recordarme",
      "pages.login.divider": "o",
      "pages.login.buttons.noAccount": "¿No tienes cuenta?",
      "pages.login.buttons.register": "Crear cuenta",
      "pages.login.buttons.haveAccount": "¿Ya tienes cuenta?",
    };

    return {
      translate: (key: string, defaultValue?: string) =>
        messages[key] ?? defaultValue ?? key,
      changeLocale: async () => {},
      getLocale: () => "es",
    };
  }, []);

  const normalizedRole = useMemo(() => {
    const rawRole = (user as any)?.rol ?? (user as any)?.role ?? "";
    const normalized = typeof rawRole === "string" ? rawRole.toLowerCase() : "";
    return normalized;
  }, [user]);

  const isAuthRoute = useMemo(() => {
    if (!pathname) return false;
    return (
      pathname.startsWith("/login") ||
      pathname.startsWith("/register") ||
      pathname.startsWith("/auth")
    );
  }, [pathname]);

  const roleNeedsPermissions = normalizedRole.length > 0 &&
    !["admin", "director", "profesor", "estudiante"].includes(normalizedRole);
  const isStudentPortalRoute = Boolean(pathname?.startsWith("/portal-estudiante"));
  const isStudentContext = normalizedRole === "estudiante" || isStudentPortalRoute;

  const shouldUseLayout = !isAuthRoute && Boolean(user);

  const router = useRouter();

  useEffect(() => {
    const cargarBranding = async () => {
      let data: any = null;

      const primary = await supabaseBrowserClient
        .from("configuracion")
        .select("nombre_academia, logo_url, whatsapp, telefono")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (primary.error) {
        const fallback = await supabaseBrowserClient
          .from("configuracion")
          .select("*")
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fallback.error) {
          setBrandingLogo(DEFAULT_BRANDING_LOGO);
          setWhatsappAgente(null);
          setWhatsappAcademia("573012038582");
          return;
        }

        data = fallback.data;
      } else {
        data = primary.data;
      }

      if (data?.nombre_academia) setBrandingName(data.nombre_academia);
      setBrandingLogo((data as any)?.logo_url || DEFAULT_BRANDING_LOGO);

      const agente = normalizeWhatsappPhone((data as any)?.whatsapp_agente || (data as any)?.whatsapp || null);
      const academia = normalizeWhatsappPhone(
        (data as any)?.whatsapp_admisiones || (data as any)?.telefono || (data as any)?.whatsapp || "573012038582"
      );

      setWhatsappAgente(agente);
      setWhatsappAcademia(academia);
    };

    cargarBranding();
  }, []);

  React.useEffect(() => {
    if (!userLoading && !user && !isAuthRoute) {
      router.replace("/login");
    }
  }, [user, userLoading, isAuthRoute, router]);

  const resources = useMemo(() => {
    if (userLoading || !user) {
      return [];
    }

    if (normalizedRole === "admin" || normalizedRole === "director") {
      return allResources;
    }

    if (normalizedRole === "profesor") {
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

    if (normalizedRole === "estudiante") {
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

    if (normalizedRole === "administrativo") {
      if (permisosLoading) {
        return [];
      }

      const userPermisos = permisos[normalizedRole] || {};
      const filteredResources = allResources.filter((resource) => {
        if (!resource.key) return false;
        if (resource.key === "dashboard") {
          return userPermisos.dashboard === true;
        }
        return userPermisos[resource.key] === true;
      });

      // Agregar dashboard de secretaria al inicio
      return [
        {
          name: "dashboard-secretaria",
          list: "/dashboard/secretaria",
          meta: {
            label: "Dashboard",
            icon: <DashboardOutlined />,
          },
        },
        ...filteredResources.filter(r => r.key !== "dashboard"),
      ];
    }

    if (permisosLoading) {
      return [];
    }

    const userPermisos = permisos[normalizedRole] || {};

    return allResources.filter((resource) => {
      if (!resource.key) return false;

      if (resource.key === "dashboard") {
        return userPermisos.dashboard === true;
      }

      return userPermisos[resource.key] === true;
    });
  }, [user, userLoading, normalizedRole, permisosLoading, permisos]);

  const shouldShowGlobalLoader = !isStudentContext && (showUserLoader || (roleNeedsPermissions && permisosLoading));

  if (shouldShowGlobalLoader) {
    return (
      <FullScreenLoader
        subtitle={userLoading ? "Validando sesión..." : "Cargando aplicación..."}
      />
    );
  }

  return (
    <RefineKbarProvider>
      <ConfigProvider
        theme={themeConfig}
      >
        <AntdApp>
          <Refine
            routerProvider={routerProvider}
            dataProvider={dataProvider}
            authProvider={authProvider}
            i18nProvider={i18nProvider}
            resources={resources}
            options={{
              syncWithLocation: true,
              warnWhenUnsavedChanges: true,
            }}
          >
            {!shouldUseLayout ? (
              <div style={{ minHeight: "100vh" }}>
                {children}
              </div>
            ) : (
              <ThemedLayout
                initialSiderCollapsed={false}
                Sider={CustomSider}
                Header={(headerProps) => (
                  <PortalTopHeader
                    {...headerProps}
                    pathname={pathname}
                    brandingLogo={brandingLogo}
                    whatsappAgente={whatsappAgente}
                    whatsappAcademia={whatsappAcademia}
                  />
                )}
                Title={({ collapsed }) => (
                  <ThemedTitle
                    collapsed={collapsed}
                    text=""
                    icon={
                      brandingLogo ? (
                        <Image
                          src={brandingLogo}
                          alt={brandingName}
                          width={45}
                          height={45}
                          unoptimized
                          style={{
                            width: collapsed ? 36 : 45,
                            height: collapsed ? 36 : 45,
                            objectFit: "contain",
                            borderRadius: 4,
                            transition: "all 0.2s ease",
                          }}
                        />
                      ) : (
                        <BookOutlined style={{ fontSize: collapsed ? 28 : 34 }} />
                      )
                    }
                  />
                )}
              >
                {children}
              </ThemedLayout>
            )}
            <RefineKbar />
          </Refine>
        </AntdApp>
      </ConfigProvider>
    </RefineKbarProvider>
  );
};

export const AppShell = ({ children }: { children: React.ReactNode }) => (
  <QueryProvider>
    <RolesPermissionsProvider>
      <ColorModeContextProvider defaultMode="light">
        <AppInner>{children}</AppInner>
      </ColorModeContextProvider>
    </RolesPermissionsProvider>
  </QueryProvider>
);
