"use client";
import { AuthPage as AuthPageBase } from "@refinedev/antd";
import type { AuthPageProps } from "@refinedev/core";
import { Alert, Button, Divider, Space } from "antd";
import { GoogleOutlined } from "@ant-design/icons";
import { supabaseBrowserClient } from "@utils/supabase/client";

export const AuthPage = (props: AuthPageProps) => {
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
    <div>
      {props.type === "login" && (
        <div style={{ maxWidth: '400px', margin: '0 auto 20px' }}>
          <Alert
            message="Ingresa con tu correo"
            description="Usuario: tu correo electrónico | Contraseña: tu número de cédula"
            type="info"
            showIcon
            style={{ textAlign: 'left' }}
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
        }}
      />

      {props.type === "login" && (
        <div style={{ maxWidth: 400, margin: "16px auto 0", textAlign: "center" }}>
          <Divider plain>o continúa con</Divider>
          <Space direction="vertical" style={{ width: "100%" }}>
            <Button
              onClick={handleGoogleLogin}
              icon={<GoogleOutlined />}
              block
            >
              Ingresar con Google
            </Button>
          </Space>
        </div>
      )}
    </div>
  );
};
