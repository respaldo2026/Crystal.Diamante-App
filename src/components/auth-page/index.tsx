"use client";
import { AuthPage as AuthPageBase } from "@refinedev/antd";
import type { AuthPageProps } from "@refinedev/core";
import { Alert } from "antd";

export const AuthPage = (props: AuthPageProps) => {
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
    </div>
  );
};
