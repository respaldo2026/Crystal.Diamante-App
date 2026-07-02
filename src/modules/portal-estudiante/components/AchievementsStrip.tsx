import React from "react";
import { Card, Space, Tag, Typography } from "antd";
import type { LogroGamificacion } from "@/modules/portal-estudiante/hooks/useGamificationMetrics";

const { Text } = Typography;

type Props = {
  logros: LogroGamificacion[];
};

export const AchievementsStrip: React.FC<Props> = ({ logros }) => {
  return (
    <Card size="small" title="Logros" style={{ borderRadius: 14 }}>
      <Space wrap size={[8, 8]}>
        {logros.map((logro) => (
          <Tag
            key={logro.id}
            color={logro.desbloqueado ? "green" : "default"}
            style={{
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
        ))}
      </Space>
      <div style={{ marginTop: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {logros.filter((l) => l.desbloqueado).length}/{logros.length} logros desbloqueados.
        </Text>
      </div>
    </Card>
  );
};
