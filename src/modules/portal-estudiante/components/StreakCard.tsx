import React from "react";
import { Card, Col, Row, Statistic } from "antd";
import { FireOutlined, TrophyOutlined } from "@ant-design/icons";

type Props = {
  rachaActual: number;
  mejorRacha: number;
  asistenciaPromedio: number;
};

export const StreakCard: React.FC<Props> = ({ rachaActual, mejorRacha, asistenciaPromedio }) => {
  return (
    <Card size="small" title="Constancia" style={{ borderRadius: 14 }}>
      <Row gutter={10}>
        <Col span={8}>
          <Statistic title="Racha" value={rachaActual} suffix="sem" prefix={<FireOutlined style={{ color: "#f97316" }} />} />
        </Col>
        <Col span={8}>
          <Statistic title="Mejor" value={mejorRacha} suffix="sem" prefix={<TrophyOutlined style={{ color: "#eab308" }} />} />
        </Col>
        <Col span={8}>
          <Statistic title="Asistencia" value={asistenciaPromedio} suffix="%" />
        </Col>
      </Row>
    </Card>
  );
};
