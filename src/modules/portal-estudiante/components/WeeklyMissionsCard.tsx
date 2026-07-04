import React from "react";
import { Card, Progress, Space, Tag, Typography } from "antd";
import { CheckCircleOutlined } from "@ant-design/icons";
import type { MisionSemanal } from "@/modules/portal-estudiante/hooks/useGamificationMetrics";

const { Text } = Typography;

type Props = {
  misiones: MisionSemanal[];
};

const getMissionEmoji = (missionId: string) => {
  switch (missionId) {
    case "asistencia-semanal":
      return "✅";
    case "quiz-semanal":
      return "🧠";
    case "racha-semanal":
      return "🔥";
    case "constancia-mensual":
      return "📷";
    default:
      return "⭐";
  }
};

const getMissionTagColor = (missionId: string): "blue" | "purple" | "green" | "orange" | "gold" => {
  switch (missionId) {
    case "asistencia-semanal":
      return "blue";
    case "quiz-semanal":
      return "purple";
    case "constancia-mensual":
      return "green";
    case "racha-semanal":
      return "orange";
    default:
      return "gold";
  }
};

const getMissionProgressColor = (missionId: string) => {
  switch (missionId) {
    case "asistencia-semanal":
      return "#1677ff";
    case "quiz-semanal":
      return "#722ed1";
    case "constancia-mensual":
      return "#16a34a";
    case "racha-semanal":
      return "#fa8c16";
    default:
      return "#d81b87";
  }
};

export const WeeklyMissionsCard: React.FC<Props> = ({ misiones }) => {
  return (
    <Card size="small" title="Misiones semanales" style={{ borderRadius: 14 }}>
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        {misiones.map((mision) => (
          <div
            key={mision.id}
            style={{
              border: "1px solid #f1f5f9",
              borderRadius: 10,
              padding: "10px 12px",
              background: mision.completada ? "#f0fdf4" : "#ffffff",
            }}
          >
            <Space style={{ width: "100%", justifyContent: "space-between" }} align="start">
              <div>
                <Text strong>{`${getMissionEmoji(String(mision.id || ""))} ${mision.titulo}`}</Text>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{mision.descripcion}</Text>
                </div>
              </div>
              <Tag color={mision.completada ? "green" : getMissionTagColor(String(mision.id || ""))}>
                +{mision.recompensaXp} XP
              </Tag>
            </Space>

            <Progress
              percent={mision.progresoPercent}
              size="small"
              showInfo={false}
              strokeColor={mision.completada ? "#16a34a" : getMissionProgressColor(String(mision.id || ""))}
              trailColor="#e5e7eb"
              style={{ marginTop: 8, marginBottom: 4 }}
            />

            <Space style={{ width: "100%", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12 }}>{mision.progresoLabel}</Text>
              {mision.completada ? <CheckCircleOutlined style={{ color: "#16a34a" }} /> : null}
            </Space>
          </div>
        ))}
      </Space>
    </Card>
  );
};
