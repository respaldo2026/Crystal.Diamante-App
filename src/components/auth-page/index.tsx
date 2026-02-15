"use client";
import type { AuthPageProps } from "@refinedev/core";
import { useLogin } from "@refinedev/core";
import { Alert, Button, Divider, Input, Form } from "antd";
import { GoogleOutlined, LockOutlined, MailOutlined, EyeOutlined, EyeInvisibleOutlined } from "@ant-design/icons";
import { supabaseBrowserClient } from "@utils/supabase/client";
import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export const AuthPage = (props: AuthPageProps) => {
  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [form] = Form.useForm();
  const { mutate: login, isPending } = useLogin();
  const searchParams = useSearchParams();
  const authError = searchParams.get("error");

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobile = windowWidth < 768;

  const handleGoogleLogin = async () => {
    const redirectTo = `${window.location.origin}/auth/callback`;
    await supabaseBrowserClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          prompt: "select_account",
        },
      },
    });
  };

  const handleLoginSubmit = async (values: { email: string; password: string }) => {
    setPasswordError(null);
    
    login(
      {
        email: values.email,
        password: values.password,
      },
      {
        onError: (error: any) => {
          if (error?.message?.includes("Invalid login credentials") || error?.message?.includes("incorrect")) {
            setPasswordError("Contraseña incorrecta. Por favor, verifica tu correo y cédula.");
          } else {
            setPasswordError(error?.message || "Error al iniciar sesión");
          }
        },
      }
    );
  };

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          width: "100%",
          background: "rgba(255,255,255,0.94)",
          padding: isMobile ? 18 : 24,
          borderRadius: 20,
          border: "1px solid rgba(255, 153, 204, 0.35)",
          boxShadow: "0 20px 36px rgba(140, 36, 97, 0.18)",
          backdropFilter: "blur(6px)",
        }}
      >
        <div style={{ marginBottom: isMobile ? 12 : 16 }}>
          <div style={{ color: "#8f295f", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Ingreso al sistema
          </div>
          <h2 style={{ margin: "4px 0 4px", fontSize: isMobile ? 20 : 24, lineHeight: 1.2, color: "#3c1d2e" }}>
            Inicia sesión
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: "#6a5a64" }}>
            Usa tu correo institucional y contraseña para acceder.
          </p>
        </div>

        <Form
          form={form}
          layout="vertical"
          size={isMobile ? "small" : "middle"}
          onFinish={handleLoginSubmit}
          requiredMark={false}
        >
          <Form.Item
            name="email"
            label={<span style={{ color: "#333", fontWeight: 500 }}>Correo electrónico</span>}
            rules={[
              { required: true, message: "El correo es requerido" },
              { type: "email", message: "Ingresa un correo válido" },
            ]}
            style={{ marginBottom: isMobile ? "12px" : "16px" }}
          >
            <Input
              placeholder="tu@correo.com"
              prefix={<MailOutlined style={{ color: "#999" }} />}
              disabled={isPending}
              style={{
                borderRadius: 10,
                borderColor: "#e7d4df",
                height: isMobile ? 36 : 40,
              }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            label={<span style={{ color: "#333", fontWeight: 500 }}>Contraseña</span>}
            rules={[
              { required: true, message: "La contraseña es requerida" },
            ]}
            style={{ marginBottom: isMobile ? "12px" : "16px" }}
          >
            <Input
              placeholder="Ingresa tu contraseña"
              type={showPassword ? "text" : "password"}
              prefix={<LockOutlined style={{ color: "#999" }} />}
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    color: "#999",
                    padding: "0 4px",
                  }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                </button>
              }
              disabled={isPending}
              style={{
                borderRadius: 10,
                borderColor: "#e7d4df",
                height: isMobile ? 36 : 40,
              }}
            />
          </Form.Item>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -6, marginBottom: 12 }}>
            <Link href="/forgot-password" style={{ fontSize: 12, fontWeight: 600, color: "#9b2a67" }}>
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          {authError === "email-no-registrado" && !passwordError && (
            <Alert
              message="Solo puedes iniciar sesion con el correo registrado en tu ficha de inscripcion."
              type="error"
              showIcon
              style={{
                marginBottom: isMobile ? "12px" : "16px",
                fontSize: isMobile ? "12px" : "13px",
                borderRadius: 8,
              }}
            />
          )}

          {authError === "cuenta-existente" && !passwordError && (
            <Alert
              message="Este correo ya existe con otro método de acceso. Usa tu método original o contacta soporte para vincular Google sin duplicados."
              type="warning"
              showIcon
              style={{
                marginBottom: isMobile ? "12px" : "16px",
                fontSize: isMobile ? "12px" : "13px",
                borderRadius: 8,
              }}
            />
          )}

          {passwordError && (
            <Alert
              message={passwordError}
              type="error"
              showIcon
              style={{
                marginBottom: isMobile ? "12px" : "16px",
                fontSize: isMobile ? "12px" : "13px",
                borderRadius: 8,
              }}
            />
          )}

          <Button
            htmlType="submit"
            type="primary"
            block
            loading={isPending}
            size={isMobile ? "small" : "middle"}
            style={{
              fontSize: isMobile ? "13px" : "14px",
              height: isMobile ? "38px" : "42px",
              background: "linear-gradient(135deg, #ff2aa1 0%, #d81b87 100%)",
              border: "none",
              borderRadius: 10,
              fontWeight: 700,
              color: "#ffffff",
              boxShadow: "0 8px 20px rgba(216, 27, 135, 0.35)",
            }}
          >
            {isPending ? "Iniciando sesión..." : "Iniciar sesión"}
          </Button>
        </Form>

        <Divider style={{ margin: isMobile ? "14px 0" : "18px 0", color: "#a07b90" }}>o</Divider>

        <Button
          block
          icon={<GoogleOutlined />}
          onClick={handleGoogleLogin}
          disabled={isPending}
          size={isMobile ? "small" : "middle"}
          style={{
            height: isMobile ? "38px" : "42px",
            borderRadius: 10,
            borderColor: "#e3d2dc",
            color: "#4c3441",
            fontWeight: 600,
          }}
        >
          Continuar con Google
        </Button>
      </div>

      {props.type === "login" && (
        <div style={{
          marginTop: isMobile ? "8px" : "12px",
          textAlign: "center",
          fontSize: isMobile ? "11px" : "12px",
          color: "#666",
          lineHeight: 1.5,
        }}>
          <p style={{ margin: 0 }}>
            ¿No tienes acceso? Comunícate con el personal de la Academia
          </p>
        </div>
      )}
    </div>
  );
};
