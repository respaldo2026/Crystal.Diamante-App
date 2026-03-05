"use client";

import React from "react";
import { Button, Space, Tag } from "antd";
import { FilePdfOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
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

  return (
    <Space direction="vertical" size={6} style={{ width: "100%" }}>
      <Space
        size={8}
        wrap
        className="tema-material-row"
        style={{ justifyContent: "space-between" }}
      >
        {mostrarEnlacePrincipal ? (
          <Button
            type="link"
            size="small"
            icon={materialIcon || <FilePdfOutlined />}
            onClick={() => {
              if (!recursoPrincipalTema) {
                onWarnAction("Este tema aún no tiene material didáctico disponible.");
                return;
              }
              onOpenMaterialAction(recursoPrincipalTema, tituloRecursoPrincipal, temaId);
            }}
            style={{ paddingInline: 0 }}
          >
            {temaNombre || "Tema"}
          </Button>
        ) : (
          <span />
        )}

        <Space size={4} className="tema-acciones-row">
          <Button
            size="small"
            type={quizTema ? "primary" : "default"}
            ghost
            icon={<SafetyCertificateOutlined />}
            disabled={!quizTema}
            onClick={() => {
              if (!quizTema) return;
              onOpenQuizAction(quizTema);
            }}
          >
            Quiz
          </Button>
        </Space>
      </Space>

      <Space wrap size={8}>
        {presentacionesTema.length > 1 ? (
          <Space wrap size={6}>
            {presentacionesTema.map((presentacion, index) => (
              <Button
                key={presentacion.id || `gamma-${index}`}
                size="small"
                type="link"
                style={{ paddingInline: 0 }}
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
