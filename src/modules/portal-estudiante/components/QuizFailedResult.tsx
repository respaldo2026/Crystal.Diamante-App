"use client";

import { Button, List, Space, Typography } from "antd";

const { Text } = Typography;

type QuizFailedResultProps = {
  isMobile: boolean;
  quizResultado: {
    calificacion: number;
    correctas: number;
    totalPreguntas: number;
    porcentaje: number;
    respuestasErradas: any[];
  };
  umbralNota: number;
  umbralPorcentaje: number;
  onCloseAction: () => void;
};

export const QuizFailedResult = ({
  isMobile,
  quizResultado,
  umbralNota,
  umbralPorcentaje,
  onCloseAction,
}: QuizFailedResultProps) => {
  return (
    <div style={{ padding: isMobile ? 16 : 28 }}>
      <Space direction="vertical" size={20} style={{ width: "100%", textAlign: "center" }}>
        <div
          style={{
            width: 130, height: 130, borderRadius: "50%",
            background: "linear-gradient(135deg, #ff4d4f 0%, #cf1322 100%)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            margin: "0 auto",
            boxShadow: "0 8px 32px rgba(255,77,79,0.4)",
          }}
        >
          <span style={{ color: "#fff", fontSize: 40, fontWeight: 800, lineHeight: 1 }}>
            {quizResultado.calificacion.toFixed(1)}
          </span>
          <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 14 }}>/5.0</span>
        </div>
        <div>
          <Text style={{ fontSize: 22, fontWeight: 700, display: "block" }}>
            Sigue intentando 💪
          </Text>
          <Text type="secondary" style={{ fontSize: 15 }}>
            {`${quizResultado.correctas} de ${quizResultado.totalPreguntas} correctas · ${quizResultado.porcentaje}%`}
          </Text>
          <br />
          <Text type="danger" style={{ fontSize: 13 }}>
            {`Necesitas mínimo ${umbralNota}/5 (${umbralPorcentaje}%) para aprobar y desbloquear la siguiente clase.`}
          </Text>
        </div>
        {quizResultado.respuestasErradas.length > 0 && (
          <div style={{ textAlign: "left", width: "100%" }}>
            <Text strong style={{ fontSize: 14 }}>
              {`Preguntas por mejorar (${quizResultado.respuestasErradas.length}):`}
            </Text>
            <List
              size="small"
              bordered
              style={{ marginTop: 8, maxHeight: 260, overflowY: "auto" }}
              dataSource={quizResultado.respuestasErradas}
              renderItem={(item: any) => (
                <List.Item>
                  <Space direction="vertical" size={2} style={{ width: "100%" }}>
                    <Text strong style={{ fontSize: 12 }}>{`Pregunta ${item.orden || "-"}`}</Text>
                    <Text style={{ fontSize: 13 }}>{item.pregunta}</Text>
                    <Text type="danger" style={{ fontSize: 12 }}>{`✗ Tu respuesta: ${item.respuestaMarcada}`}</Text>
                    <Text type="success" style={{ fontSize: 12 }}>{`✓ Correcta: ${item.respuestaCorrecta}`}</Text>
                  </Space>
                </List.Item>
              )}
            />
          </div>
        )}
        <Button type="primary" danger onClick={onCloseAction}>
          Entendido, volver a intentarlo
        </Button>
      </Space>
    </div>
  );
};
