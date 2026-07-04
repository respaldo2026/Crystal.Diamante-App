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

  const StepNumber = ({ value }: { value: number }) => (
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

  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      <div
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 14,
          background: "#ffffff",
          padding: 12,
          width: "100%",
        }}
      >
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <Text strong style={{ fontSize: 14 }}>Ruta del tema: {temaNombre || "Tema"}</Text>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Sigue el orden para avanzar sin confusiones.
                </Text>
              </div>
            </div>
            <Tag color="default" style={{ marginInlineEnd: 0, borderRadius: 999 }}>
              XP del tema: {puntosGanados}/{puntosPosibles}
            </Tag>
          </div>

          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: 10,
              background: "#f8fafc",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <StepNumber value={1} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Text strong style={{ fontSize: 13 }}>Ver clase</Text>
                  <div><Text type="secondary" style={{ fontSize: 12 }}>Revisa el material antes de responder.</Text></div>
                  <div style={{ marginTop: 8 }}>
                    {mostrarEnlacePrincipal ? (
                      <Button
                        type="default"
                        icon={materialIcon || <FilePdfOutlined />}
                        onClick={() => {
                          if (!recursoPrincipalTema) {
                            onWarnAction("Este tema aún no tiene material didáctico disponible.");
                            return;
                          }
                          onOpenMaterialAction(recursoPrincipalTema, tituloRecursoPrincipal, temaId);
                        }}
                        style={{ borderRadius: 10, fontWeight: 600 }}
                      >
                        {quizPresentado ? "Repasar clase" : "Ver clase"}
                      </Button>
                    ) : (
                      <Space wrap size={6}>
                        {presentacionesTema.map((presentacion, index) => (
                          <Button
                            key={presentacion.id || `material-${index}`}
                            size="small"
                            type="default"
                            onClick={() => onOpenMaterialAction(presentacion.material, presentacion.titulo, temaId)}
                            style={{ borderRadius: 10 }}
                          >
                            {String(presentacion.titulo || presentacion?.material?.nombre_archivo || "Material")}
                          </Button>
                        ))}
                      </Space>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <StepNumber value={2} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Space size={8} wrap>
                    <Text strong style={{ fontSize: 13 }}>Presentar quiz</Text>
                    <Tag color={estadoQuizColor} style={{ marginInlineEnd: 0, borderRadius: 999 }}>{estadoQuizLabel}</Tag>
                    <Tag color="default" style={{ marginInlineEnd: 0, borderRadius: 999 }}>+30 XP</Tag>
                  </Space>
                  <div><Text type="secondary" style={{ fontSize: 12 }}>Responde el quiz para sumar puntos por aprendizaje.</Text></div>
                  <div style={{ marginTop: 8 }}>
                    <Button
                      type={quizDisponible && !quizPresentado ? "primary" : "default"}
                      icon={<SafetyCertificateOutlined />}
                      disabled={!quizDisponible}
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

              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <StepNumber value={3} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Space size={8} wrap>
                    <Text strong style={{ fontSize: 13 }}>Subir evidencia</Text>
                    <Tag color={evidenciaSubida ? "green" : "gold"} style={{ marginInlineEnd: 0, borderRadius: 999 }}>
                      {evidenciaSubida ? "Subida" : "Pendiente"}
                    </Tag>
                    <Tag color="default" style={{ marginInlineEnd: 0, borderRadius: 999 }}>+25 XP</Tag>
                  </Space>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Toma una foto con la camara del dispositivo y envíala.
                    </Text>
                  </div>

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
                      type={!evidenciaSubida ? "primary" : "default"}
                      icon={evidenciaSubida ? <CheckCircleOutlined /> : <CameraOutlined />}
                      loading={evidenciaUploading}
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
        </div>
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
