"use client";

import { Card, Skeleton, Space, Spin, Typography } from "antd";

const { Text } = Typography;

export default function Loading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "#f7f8fb",
      }}
    >
      <Card
        style={{
          width: "100%",
          maxWidth: 520,
          borderRadius: 14,
        }}
        styles={{ body: { padding: 20 } }}
      >
        <Space direction="vertical" size={14} style={{ width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Spin size="small" />
            <Text type="secondary">Cargando vista...</Text>
          </div>
          <Skeleton active title={{ width: "45%" }} paragraph={{ rows: 1 }} />
          <Skeleton.Button active block style={{ height: 40 }} />
          <Skeleton active title={false} paragraph={{ rows: 5 }} />
        </Space>
      </Card>
    </div>
  );
}
