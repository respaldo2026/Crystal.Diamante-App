import React from "react";
import { Card, Progress, Space, Tag, Typography } from "antd";
import { RocketOutlined } from "@ant-design/icons";

const { Text } = Typography;

type Props = {
  nivel: number;
  xpSemanal: number;
  totalXp: number;
  xpNivelActual: number;
  xpPorNivel: number;
  misionSiguienteTitulo?: string | null;
};

export const GamificationHeader: React.FC<Props> = ({
  nivel,
  xpSemanal,
  totalXp,
  xpNivelActual,
  xpPorNivel,
  misionSiguienteTitulo,
}) => {
  const XP_OBJETIVO_CURSO = 1000;
  const percentCurso = Math.min(100, Math.round((totalXp / XP_OBJETIVO_CURSO) * 100));
  const percent = Math.min(100, Math.round((xpNivelActual / Math.max(xpPorNivel, 1)) * 100));

  return (
    <Card
      size="small"
      style={{
        borderRadius: 14,
        border: "1px solid #f3d0e6",
        background: "linear-gradient(135deg, #fff0f7 0%, #fff7fb 100%)",
      }}
    >
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        <Space align="center" wrap>
          <Tag color="magenta" icon={<RocketOutlined />}>Nivel {nivel}</Tag>
          <Text style={{ fontSize: 14, color: "#be185d", fontWeight: 600 }}>XP semanal: {xpSemanal}</Text>
          <Text strong style={{ fontSize: 15 }}>XP total: {`${totalXp}/${XP_OBJETIVO_CURSO}`}</Text>
        </Space>

        <Space wrap size={6}>
          <Tag color="blue">✅ Asistencia</Tag>
          <Tag color="purple">🧠 Quiz</Tag>
          <Tag color="green">📷 Tarea</Tag>
        </Space>

        <div>
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>
              Progreso del curso
            </Text>
            <Text style={{ fontSize: 12, color: "#be185d", fontWeight: 600 }}>
              {`${totalXp}/${XP_OBJETIVO_CURSO} XP`}
            </Text>
          </Space>
          <Progress
            percent={percentCurso}
            showInfo={false}
            strokeColor="#16a34a"
            trailColor="#dbeafe"
            style={{ marginTop: 4 }}
          />
        </div>

        <Progress
          percent={percent}
          showInfo={false}
          strokeColor="#d81b87"
          trailColor="#f3d0e6"
        />

        <Space style={{ width: "100%", justifyContent: "space-between" }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {xpNivelActual}/{xpPorNivel} XP del nivel actual
          </Text>
          <Text style={{ fontSize: 12, color: "#be185d", fontWeight: 600 }}>
            {misionSiguienteTitulo ? `Siguiente misión: ${misionSiguienteTitulo}` : "Todas las misiones completadas"}
          </Text>
        </Space>
      </Space>
    </Card>
  );
};
