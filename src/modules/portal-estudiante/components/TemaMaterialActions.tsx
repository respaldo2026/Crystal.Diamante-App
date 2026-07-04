"use client";

import React from "react";
import { Button, Space, Tag } from "antd";
import { FilePdfOutlined, SafetyCertificateOutlined, ArrowRightOutlined, CheckCircleOutlined, CameraOutlined, EyeOutlined } from "@ant-design/icons";
import { quizAprobado } from "@/modules/portal-estudiante/utils";

type TemaMaterialActionsProps = {
  temaId: string;
  temaNombre?: string;
  recursoPrincipalTema: any;
  tituloRecursoPrincipal: string;
  presentacionesTema?: Array<{ id: string; titulo: string; material: any }>;
  quizTema: any;
  notaQuizTema: number | null;
  notaActividadTema: number | null;
  evidenciaTema?: any;
  evidenciaUploading?: boolean;
  materialIcon?: React.ReactNode;
  onWarnAction: (message: string) => void;
  onOpenMaterialAction: (material: any, title: string, temaId: string) => void;
  onOpenQuizAction: (quiz: any) => void;
  onUploadEvidenceAction: (temaId: string, temaNombre: string, file: File) => Promise<void>;
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
  evidenciaTema,
  evidenciaUploading = false,
  materialIcon,
  onWarnAction,
  onOpenMaterialAction,
  onOpenQuizAction,
  onUploadEvidenceAction,
}: TemaMaterialActionsProps) => {
  const inputFileRef = React.useRef<HTMLInputElement | null>(null);
  const mostrarEnlacePrincipal = presentacionesTema.length <= 1;
  const quizDisponible = Boolean(quizTema);
  const quizPresentado = notaQuizTema != null;
  const quizAprobadoTema = quizAprobado(notaQuizTema);
  const colorActividadTag = notaActividadTema == null ? "default" : "blue";
  const colorEstadoQuiz = !quizDisponible
    ? "#6b7280"
    : quizPresentado
      ? (quizAprobadoTema ? "#15803d" : "#475569")
      : "#1d4ed8";

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
            border: "1px solid #e5e7eb",
            background: "linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)",
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
                color: "#475569",
                boxShadow: "0 4px 10px rgba(15, 23, 42, 0.08)",
                fontSize: 22,
              }}
            >
              👩‍🏫
            </span>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", letterSpacing: 0.4, marginBottom: 2 }}>
                MATERIAL DEL TEMA
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", lineHeight: 1.3 }}>
                {temaNombre || "Tema"}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                {quizPresentado ? "Puedes repasar la clase cuando lo necesites." : "Revísalo antes de presentar el quiz."}
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
              {quizPresentado ? "Repasar clase" : "Ver clase"}
            </Button>
          ) : (
            <div style={{ fontSize: 12, color: "#6b7280" }}>Selecciona una de las presentaciones disponibles.</div>
          )}
        </div>

        {quizPresentado ? (
          <div
            style={{
              border: `1px solid ${quizAprobadoTema ? "#bbf7d0" : "#d1d5db"}`,
              borderRadius: 14,
              padding: 10,
              background: quizAprobadoTema
                ? "linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)"
                : "linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, width: "100%" }}>
              <span
                aria-hidden="true"
                style={{
                  width: 36,
                  minWidth: 36,
                  height: 36,
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#ffffff",
                  color: colorEstadoQuiz,
                  boxShadow: "0 4px 10px rgba(15, 23, 42, 0.08)",
                  fontSize: 18,
                }}
              >
                <CheckCircleOutlined />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: colorEstadoQuiz, letterSpacing: 0.4, marginBottom: 2 }}>
                  QUIZ PRESENTADO
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", lineHeight: 1.3 }}>
                  Quiz del tema
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                  {quizAprobadoTema ? "Ya quedó aprobado." : "Ya fue presentado. Puedes revisarlo de nuevo si lo necesitas."}
                </div>
              </div>
            </div>

            <Button
              size="small"
              type="default"
              icon={<SafetyCertificateOutlined />}
              onClick={() => {
                if (!quizTema) return;
                onOpenQuizAction(quizTema);
              }}
              style={{ width: "100%", borderRadius: 10, fontWeight: 700, borderColor: quizAprobadoTema ? "#86efac" : undefined }}
            >
              Ver quiz presentado
            </Button>
          </div>
        ) : (
          <div
            style={{
              border: `1px solid ${quizDisponible ? "#bfdbfe" : "#e5e7eb"}`,
              borderRadius: 14,
              padding: 10,
              background: quizDisponible
                ? "linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)"
                : "linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: colorEstadoQuiz, letterSpacing: 0.4, marginBottom: 2 }}>
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
        )}

        <div
          style={{
            border: `1px solid ${evidenciaTema ? "#bbf7d0" : "#e5e7eb"}`,
            borderRadius: 14,
            padding: 10,
            background: evidenciaTema
              ? "linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)"
              : "linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#166534", letterSpacing: 0.4, marginBottom: 2 }}>
              EVIDENCIA DE TAREA
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", lineHeight: 1.3 }}>
              Subir foto de trabajo
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              1 foto por tarea. Al subirla ganas +25 XP semanal.
            </div>
          </div>

          <input
            ref={inputFileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              await onUploadEvidenceAction(temaId, temaNombre || "Tema", file);
              event.currentTarget.value = "";
            }}
          />

          <Space size={8} wrap>
            <Button
              type="primary"
              icon={<CameraOutlined />}
              loading={evidenciaUploading}
              onClick={() => inputFileRef.current?.click()}
              style={{ borderRadius: 10, fontWeight: 700 }}
            >
              {evidenciaTema ? "Reemplazar evidencia" : "Subir evidencia"}
            </Button>

            {evidenciaTema?.url_imagen ? (
              <Button
                icon={<EyeOutlined />}
                onClick={() => window.open(String(evidenciaTema.url_imagen), "_blank", "noopener,noreferrer")}
                style={{ borderRadius: 10, fontWeight: 600 }}
              >
                Ver evidencia
              </Button>
            ) : null}
          </Space>
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
        <Tag color={colorActividadTag}>
          {`Calificación actividad: ${notaActividadTema == null ? "-" : `${Number(notaActividadTema).toFixed(1)}/5`}`}
        </Tag>
      </Space>
    </Space>
  );
};
