import React from "react";
import { Card, Space, Tag, Typography } from "antd";
import type { LogroGamificacion } from "@/modules/portal-estudiante/hooks/useGamificationMetrics";

const { Text } = Typography;

type Props = {
  logros: LogroGamificacion[];
};

const getAchievementTone = (id: string) => {
  switch (id) {
    case "primera-clase":
    case "asistencia-elite":
      return { background: "#e8f1ff", border: "#91caff", text: "#1d4ed8" }; // azul
    case "quiz-master":
      return { background: "#f3e8ff", border: "#d8b4fe", text: "#7e22ce" }; // morado
    case "meta-final":
      return { background: "#dcfce7", border: "#86efac", text: "#166534" }; // verde
    case "cuatro-semanas":
    case "doce-semanas":
      return { background: "#ffedd5", border: "#fdba74", text: "#9a3412" }; // naranja
    default:
      return { background: "#f8fafc", border: "#cbd5e1", text: "#334155" };
  }
};

export const AchievementsStrip: React.FC<Props> = ({ logros }) => {
  return (
    <Card size="small" title="Logros" style={{ borderRadius: 14 }}>
      <Space wrap size={[8, 8]}>
        {logros.map((logro) => {
          const tone = getAchievementTone(String(logro.id || ""));
          return (
            <Tag
              key={logro.id}
              style={{
                background: logro.desbloqueado ? tone.background : "#f8fafc",
                borderColor: logro.desbloqueado ? tone.border : "#d9d9d9",
                color: logro.desbloqueado ? tone.text : "#64748b",
                padding: "6px 10px",
                borderRadius: 999,
                opacity: logro.desbloqueado ? 1 : 0.72,
                marginInlineEnd: 0,
              }}
            >
              <Space size={6}>
                <span>{logro.icono}</span>
                <span>{logro.titulo}</span>
              </Space>
            </Tag>
          );
        })}
      </Space>
      <div style={{ marginTop: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {logros.filter((l) => l.desbloqueado).length}/{logros.length} logros desbloqueados.
        </Text>
      </div>
    </Card>
  );
};
