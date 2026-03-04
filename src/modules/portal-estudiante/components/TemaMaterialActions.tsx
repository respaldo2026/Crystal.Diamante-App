"use client";

import React from "react";
import { Button, Space, Tag } from "antd";
import { DownloadOutlined, FilePdfOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { getActividadColor, quizAprobado } from "@/modules/portal-estudiante/utils";

type TemaMaterialActionsProps = {
  temaId: string;
  temaNombre?: string;
  recursoPrincipalTema: any;
  tituloRecursoPrincipal: string;
  quizTema: any;
  recursosTema: any[];
  notaQuizTema: number | null;
  notaActividadTema: number | null;
  materialIcon?: React.ReactNode;
  onWarnAction: (message: string) => void;
  onOpenMaterialAction: (material: any, title: string, temaId: string) => void;
  onDownloadMaterialAction: (material: any, title: string, recursosTema: any[]) => void;
  onOpenQuizAction: (quiz: any) => void;
};

export const TemaMaterialActions = ({
  temaId,
  temaNombre,
  recursoPrincipalTema,
  tituloRecursoPrincipal,
  quizTema,
  recursosTema,
  notaQuizTema,
  notaActividadTema,
  materialIcon,
  onWarnAction,
  onOpenMaterialAction,
  onDownloadMaterialAction,
  onOpenQuizAction,
}: TemaMaterialActionsProps) => {
  return (
    <Space direction="vertical" size={6} style={{ width: "100%" }}>
      <Space
        size={8}
        wrap
        className="tema-material-row"
        style={{ justifyContent: "space-between" }}
      >
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

        <Space size={4} className="tema-acciones-row">
          <Button
            size="small"
            type="default"
            icon={<DownloadOutlined />}
            onClick={() => {
              if (!recursoPrincipalTema) {
                onWarnAction("Este tema aún no tiene recurso para descargar.");
                return;
              }
              onDownloadMaterialAction(recursoPrincipalTema, tituloRecursoPrincipal, recursosTema);
            }}
          />

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
