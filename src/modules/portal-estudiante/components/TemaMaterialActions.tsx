"use client";

import React from "react";
import { Button, Space, Tag } from "antd";
import { FilePdfOutlined, SafetyCertificateOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { getActividadColor, quizAprobado } from "@/modules/portal-estudiante/utils";

type TemaMaterialActionsProps = {
  temaId: string;
  temaNombre?: string;
  recursoPrincipalTema: any;
  tituloRecursoPrincipal: string;
  presentacionesTema?: Array<{ id: string; titulo: string; material: any }>;
  quizTema: any;
  notaQuizTema: number | null;
  notaActividadTema: number | null;
  materialIcon?: React.ReactNode;
  onWarnAction: (message: string) => void;
  onOpenMaterialAction: (material: any, title: string, temaId: string) => void;
  onOpenQuizAction: (quiz: any) => void;
};

export const TemaMaterialActions = ({
  temaId,
  temaNombre,
  recursoPrincipalTema,
  tituloRecursoPrincipal,
  presentacionesTema = [],
  quizTema,
  notaQuizTema,
  notaActividadTema,
  materialIcon,
  onWarnAction,
  onOpenMaterialAction,
  onOpenQuizAction,
}: TemaMaterialActionsProps) => {
  const mostrarEnlacePrincipal = presentacionesTema.length <= 1;
  const quizDisponible = Boolean(quizTema);
  const quizAprobadoTema = quizAprobado(notaQuizTema);

  return (
    <Space direction="vertical" size={6} style={{ width: "100%" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
          width: "100%",
        }}
      >
        <div
          className="tema-material-row"
          style={{
            alignItems: "stretch",
            borderRadius: 14,
            padding: 10,
            background: "linear-gradient(135deg, #fff1f7 0%, #ffffff 100%)",
            borderColor: "#f9a8d4",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, width: "100%" }}>
            <span
              aria-hidden="true"
              style={{
                width: 40,
                minWidth: 40,
                height: 40,
                borderRadius: 12,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#ffffff",
                boxShadow: "0 6px 14px rgba(190, 24, 93, 0.12)",
                fontSize: 22,
              }}
            >
              👩‍🏫
            </span>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#be185d", letterSpacing: 0.4, marginBottom: 2 }}>
                TEMA A ESTUDIAR
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", lineHeight: 1.3 }}>
                {temaNombre || "Tema"}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                Revísalo antes de presentar el quiz.
              </div>
            </div>
          </div>

          {mostrarEnlacePrincipal ? (
            <Button
              type="primary"
              icon={materialIcon || <FilePdfOutlined />}
              onClick={() => {
                if (!recursoPrincipalTema) {
                  onWarnAction("Este tema aún no tiene material didáctico disponible.");
                  return;
                }
                onOpenMaterialAction(recursoPrincipalTema, tituloRecursoPrincipal, temaId);
              }}
              style={{ width: "100%", borderRadius: 10, fontWeight: 700 }}
            >
              Ver clase
            </Button>
          ) : (
            <div style={{ fontSize: 12, color: "#6b7280" }}>Selecciona una de las presentaciones disponibles.</div>
          )}
        </div>

        <div
          style={{
            border: `1px solid ${quizDisponible ? "#bfdbfe" : "#e5e7eb"}`,
            borderRadius: 14,
            padding: 10,
            background: quizDisponible
              ? (quizAprobadoTema ? "linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)" : "linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)")
              : "linear-gradient(135deg, #f9fafb 0%, #ffffff 100%)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: quizDisponible ? "#1d4ed8" : "#6b7280", letterSpacing: 0.4, marginBottom: 2 }}>
              SIGUIENTE PASO
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", lineHeight: 1.3 }}>
              Quiz del tema
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              {quizDisponible ? "Cuando termines la clase, evalúa lo aprendido." : "Este tema aún no tiene quiz activo."}
            </div>
          </div>

          <Button
            size="middle"
            type={quizDisponible ? "primary" : "default"}
            icon={<SafetyCertificateOutlined />}
            disabled={!quizDisponible}
            onClick={() => {
              if (!quizTema) return;
              onOpenQuizAction(quizTema);
            }}
            style={{ width: "100%", borderRadius: 10, fontWeight: 700 }}
          >
            {quizDisponible ? "Presentar quiz" : "Quiz no disponible"}
          </Button>
        </div>
      </div>

      <Space wrap size={8}>
        {presentacionesTema.length > 1 ? (
          <Space wrap size={6}>
            {presentacionesTema.map((presentacion, index) => (
              <Button
                key={presentacion.id || `gamma-${index}`}
                size="small"
                type="default"
                icon={<ArrowRightOutlined />}
                style={{ borderRadius: 999, fontWeight: 600 }}
                onClick={() => onOpenMaterialAction(presentacion.material, presentacion.titulo, temaId)}
              >
                {String(presentacion.titulo || presentacion?.material?.nombre_archivo || temaNombre || "Material")}
              </Button>
            ))}
          </Space>
        ) : null}
        <Tag color={notaQuizTema == null ? "default" : quizAprobado(notaQuizTema) ? "green" : "red"}>
          {`Calificación quiz: ${notaQuizTema == null ? "-" : `${notaQuizTema}/5`}`}
        </Tag>
        <Tag color={getActividadColor(notaActividadTema)}>
          {`Calificación actividad: ${notaActividadTema == null ? "-" : `${Number(notaActividadTema).toFixed(1)}/5`}`}
        </Tag>
      </Space>
    </Space>
  );
};
