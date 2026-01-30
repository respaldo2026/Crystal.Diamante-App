"use client";
import { AuthPage as AuthPageBase } from "@refinedev/antd";
import type { AuthPageProps } from "@refinedev/core";
import { Alert, Button, Divider, Space } from "antd";
import { GoogleOutlined, LockOutlined, MailOutlined } from "@ant-design/icons";
import { supabaseBrowserClient } from "@utils/supabase/client";
import React, { useState, useEffect } from "react";

export const AuthPage = (props: AuthPageProps) => {
  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);

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

  return (
    <div style={{ width: "100%" }}>
      {props.type === "login" && (
        <div style={{
          marginBottom: isMobile ? "12px" : "14px",
          display: "none", // Hidden - info shown in landing
        }}>
          <Alert
            message="Ingresa con tu correo"
            description="Usuario: tu correo | Contraseña: tu cédula"
            type="info"
            showIcon
            style={{ textAlign: 'left', fontSize: isMobile ? "12px" : "13px" }}
          />
        </div>
      )}
      <AuthPageBase
        {...props}
        title={null}
        renderContent={(content) => (
          <div
            style={{
              width: "100%",
              background: "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255, 230, 243, 0.95))",
              padding: isMobile ? 10 : 14,
              borderRadius: 12,
              border: "1px solid rgba(255, 42, 161, 0.25)",
              boxShadow: "0 12px 30px rgba(255, 42, 161, 0.25)",
            }}
          >
            {content}
          </div>
        )}
        contentProps={{
          styles: {
            body: {
              padding: 0,
            },
          },
        }}
        formProps={{
          initialValues: {
            email: "",
            password: "",
          },
          layout: "vertical",
          size: isMobile ? "small" : "middle",
        }}
        wrapperProps={{
          style: {
            maxWidth: "100%",
            margin: 0,
          }
        }}
      />

      {props.type === "login" && (
        <div style={{
          marginTop: isMobile ? "4px" : "6px",
          textAlign: "center"
        }}>
          <Divider plain style={{
            margin: isMobile ? "4px 0" : "6px 0",
            fontSize: isMobile ? "11px" : "12px"
          }}>
            o accede con
          </Divider>
          <Button
            onClick={handleGoogleLogin}
            icon={<GoogleOutlined />}
            block
            size={isMobile ? "small" : "middle"}
            style={{
              fontSize: isMobile ? "12px" : "14px",
              height: isMobile ? "32px" : "40px",
            }}
          >
            {isMobile ? "Google" : "Continuar con Google"}
          </Button>
        </div>
      )}
    </div>
  );
};
