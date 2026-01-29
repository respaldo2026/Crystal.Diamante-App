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
          }
        }}
      />

      {props.type === "login" && (
        <div style={{
          marginTop: isMobile ? "12px" : "14px",
          textAlign: "center"
        }}>
          <Divider plain style={{
            margin: isMobile ? "10px 0" : "12px 0",
            fontSize: isMobile ? "12px" : "13px"
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
