"use client";
import type { AuthPageProps } from "@refinedev/core";
import { useLogin } from "@refinedev/core";
import { Alert, Button, Divider, Input, Form } from "antd";
import { GoogleOutlined, LockOutlined, MailOutlined, EyeOutlined, EyeInvisibleOutlined } from "@ant-design/icons";
import { supabaseBrowserClient } from "@utils/supabase/client";
import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

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
          background: "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(255, 245, 250, 0.98))",
          padding: isMobile ? 16 : 20,
          borderRadius: 16,
          border: "1px solid rgba(200, 129, 65, 0.15)",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.08)",
        }}
      >
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
                borderRadius: 8,
                borderColor: "#ddd",
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
                borderRadius: 8,
                borderColor: "#ddd",
              }}
            />
          </Form.Item>

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
              height: isMobile ? "36px" : "40px",
              background: "#ff2aa1",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              color: "#ffffff",
            }}
          >
            {isPending ? "Iniciando sesión..." : "Iniciar sesión"}
          </Button>
        </Form>
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
