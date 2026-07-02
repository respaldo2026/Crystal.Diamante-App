import React from "react";
import { Card, Progress, Space, Tag, Typography } from "antd";
import { CheckCircleOutlined } from "@ant-design/icons";
import type { MisionSemanal } from "@/modules/portal-estudiante/hooks/useGamificationMetrics";

const { Text } = Typography;

type Props = {
  misiones: MisionSemanal[];
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
                <Text strong>{mision.titulo}</Text>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{mision.descripcion}</Text>
                </div>
              </div>
              <Tag color={mision.completada ? "green" : "blue"}>
                +{mision.recompensaXp} XP
              </Tag>
            </Space>

            <Progress
              percent={mision.progresoPercent}
              size="small"
              showInfo={false}
              strokeColor={mision.completada ? "#16a34a" : "#d81b87"}
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
