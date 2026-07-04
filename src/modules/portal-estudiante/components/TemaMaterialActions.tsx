"use client";

import React from "react";
import { Button, Space, Tag, Typography } from "antd";
import { FilePdfOutlined, SafetyCertificateOutlined, CheckCircleOutlined, CameraOutlined, EyeOutlined } from "@ant-design/icons";
import { quizAprobado } from "@/modules/portal-estudiante/utils";

const { Text } = Typography;

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
  const [materialRevisado, setMaterialRevisado] = React.useState(false);
  const [animReady, setAnimReady] = React.useState(false);
  const inputFileRef = React.useRef<HTMLInputElement | null>(null);
  const mostrarEnlacePrincipal = presentacionesTema.length <= 1;
  const quizDisponible = Boolean(quizTema);
  const quizPresentado = notaQuizTema != null;
  const quizAprobadoTema = quizAprobado(notaQuizTema);
  const evidenciaSubida = Boolean(evidenciaTema?.url_imagen);

  const puntosQuiz = quizPresentado && quizAprobadoTema ? 30 : 0;
  const puntosEvidencia = evidenciaSubida ? 25 : 0;
  const puntosGanados = puntosQuiz + puntosEvidencia;
  const puntosPosibles = 55;

  const estadoQuizLabel = !quizDisponible
    ? "Sin quiz"
    : quizPresentado
      ? (quizAprobadoTema ? "Aprobado" : "Presentado")
      : "Pendiente";

  const estadoQuizColor = !quizDisponible
    ? "default"
    : quizPresentado
      ? (quizAprobadoTema ? "green" : "blue")
      : "gold";

  const paso1Completo = materialRevisado || quizPresentado;
  const paso2Disponible = quizDisponible && paso1Completo;
  const paso3Disponible = quizPresentado;
  const progreso = (paso1Completo ? 1 : 0) + (quizPresentado ? 1 : 0) + (evidenciaSubida ? 1 : 0);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => setAnimReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const StepNumber = ({ value }: { value: number }) => {
    return (
      <span
        style={{
          width: 26,
          minWidth: 26,
          height: 26,
          borderRadius: 999,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#e2e8f0",
          color: "#0f172a",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {value}
      </span>
    );
  };

  const Pill = ({ text, done = false }: { text: string; done?: boolean }) => (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 10px",
        borderRadius: 999,
        border: `1px solid ${done ? "#86efac" : "#d1d5db"}`,
        background: done ? "#f0fdf4" : "#f8fafc",
        color: done ? "#166534" : "#475569",
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {text}
    </span>
  );

  const stepMotionStyle = (index: number, enabled: boolean) => ({
    opacity: animReady ? (enabled ? 1 : 0.72) : 0,
    transform: animReady ? "translateY(0px)" : "translateY(8px)",
    transition: `opacity 260ms ease ${index * 70}ms, transform 300ms ease ${index * 70}ms`,
    filter: enabled ? "none" : "saturate(0.75)",
  });

  const renderMaterialStep = () => {
    if (mostrarEnlacePrincipal) {
      return (
        <Button
          type="default"
          icon={materialIcon || <FilePdfOutlined />}
          onClick={() => {
            if (!recursoPrincipalTema) {
              onWarnAction("Este tema aún no tiene material didáctico disponible.");
              return;
            }
            setMaterialRevisado(true);
            onOpenMaterialAction(recursoPrincipalTema, tituloRecursoPrincipal, temaId);
          }}
          style={{ borderRadius: 10, fontWeight: 600 }}
        >
          {quizPresentado ? "Repasar clase" : "Ver clase"}
        </Button>
      );
    }

    return (
      <Space wrap size={6}>
        {presentacionesTema.map((presentacion, index) => (
          <Button
            key={presentacion.id || `material-${index}`}
            size="small"
            type="default"
            onClick={() => {
              setMaterialRevisado(true);
              onOpenMaterialAction(presentacion.material, presentacion.titulo, temaId);
            }}
            style={{ borderRadius: 10 }}
          >
            {String(presentacion.titulo || presentacion?.material?.nombre_archivo || "Material")}
          </Button>
        ))}
      </Space>
    );
  };

  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          background: "#ffffff",
          padding: 14,
          boxShadow: "0 10px 24px -22px rgba(15,23,42,0.35)",
          width: "100%",
        }}
      >
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <Text strong style={{ fontSize: 14 }}>Ruta del tema: {temaNombre || "Tema"}</Text>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Paso a paso para que sea fácil y claro.
                </Text>
              </div>
            </div>
            <Tag color="default" style={{ marginInlineEnd: 0, borderRadius: 999, borderColor: "#d1d5db", color: "#334155" }}>
              XP del tema: {puntosGanados}/{puntosPosibles}
            </Tag>
          </div>

          <div style={{ width: "100%", height: 8, borderRadius: 999, background: "#f1f5f9", overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.round((progreso / 3) * 100)}%`,
                height: "100%",
                background: "linear-gradient(90deg, #64748b 0%, #0f172a 100%)",
                transition: "width 220ms ease",
              }}
            />
          </div>

          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              padding: 12,
              background: "#fcfcfd",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, ...stepMotionStyle(0, true) }}>
                <StepNumber value={1} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Space size={8} wrap>
                    <Text strong style={{ fontSize: 13 }}>Ver clase</Text>
                    <Pill text={paso1Completo ? "Completado" : "Pendiente"} done={paso1Completo} />
                  </Space>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Revisa el material antes de responder.
                    </Text>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {renderMaterialStep()}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, ...stepMotionStyle(1, paso2Disponible || quizPresentado) }}>
                <StepNumber value={2} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Space size={8} wrap>
                    <Text strong style={{ fontSize: 13 }}>Presentar quiz</Text>
                    <Pill text={estadoQuizLabel} done={quizPresentado} />
                    <Pill text="+30 XP" done={quizAprobadoTema} />
                  </Space>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Responde el quiz para sumar puntos por aprendizaje.
                    </Text>
                  </div>
                  {!paso2Disponible && !quizPresentado ? (
                    <div>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Primero revisa la clase para habilitar este paso.
                      </Text>
                    </div>
                  ) : null}
                  <div style={{ marginTop: 8 }}>
                    <Button
                      type={paso2Disponible && !quizPresentado ? "primary" : "default"}
                      icon={<SafetyCertificateOutlined />}
                      disabled={!paso2Disponible && !quizPresentado}
                      onClick={() => {
                        if (!quizTema) return;
                        onOpenQuizAction(quizTema);
                      }}
                      style={{ borderRadius: 10, fontWeight: 600 }}
                    >
                      {!quizDisponible ? "Quiz no disponible" : quizPresentado ? "Ver quiz" : "Presentar quiz"}
                    </Button>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, ...stepMotionStyle(2, paso3Disponible || evidenciaSubida) }}>
                <StepNumber value={3} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Space size={8} wrap>
                    <Text strong style={{ fontSize: 13 }}>Subir evidencia</Text>
                    <Pill text={evidenciaSubida ? "Subida" : "Pendiente"} done={evidenciaSubida} />
                    <Pill text="+25 XP" done={evidenciaSubida} />
                  </Space>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Toma una foto con la camara del dispositivo y envíala.
                    </Text>
                  </div>
                  {!paso3Disponible ? (
                    <div>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Este paso se activa cuando ya hayas presentado el quiz.
                      </Text>
                    </div>
                  ) : null}

                  <input
                    ref={inputFileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      await onUploadEvidenceAction(temaId, temaNombre || "Tema", file);
                      event.currentTarget.value = "";
                    }}
                  />

                  <Space size={8} wrap style={{ marginTop: 8 }}>
                    <Button
                      type={!evidenciaSubida && paso3Disponible ? "primary" : "default"}
                      icon={evidenciaSubida ? <CheckCircleOutlined /> : <CameraOutlined />}
                      loading={evidenciaUploading}
                      disabled={!paso3Disponible}
                      onClick={() => inputFileRef.current?.click()}
                      style={{ borderRadius: 10, fontWeight: 600 }}
                    >
                      {evidenciaSubida ? "Tomar nueva foto" : "Tomar foto"}
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
            </div>
          </div>
        </Space>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Calificación quiz: {notaQuizTema == null ? "-" : `${notaQuizTema}/5`}
        </Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Calificación actividad: {notaActividadTema == null ? "-" : `${Number(notaActividadTema).toFixed(1)}/5`}
        </Text>
      </div>
    </Space>
  );
};
