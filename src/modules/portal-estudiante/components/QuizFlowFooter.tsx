"use client";

import { Button, Typography } from "antd";

const { Text } = Typography;

type QuizFlowFooterProps = {
  totalPreguntas: number;
  quizPreguntaActual: number;
  quizSaving: boolean;
  quizAnimando: boolean;
  isMobile: boolean;
  onPreviousAction: () => void;
  onSubmitAction: () => void;
};

export const QuizFlowFooter = ({
  totalPreguntas,
  quizPreguntaActual,
  quizSaving,
  quizAnimando,
  isMobile,
  onPreviousAction,
  onSubmitAction,
}: QuizFlowFooterProps) => {
  const esUltimaPregunta = quizPreguntaActual >= Math.max(0, totalPreguntas - 1);

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", gap: 8 }}>
      <Button
        onClick={onPreviousAction}
        disabled={quizPreguntaActual <= 0 || quizSaving || quizAnimando}
      >
        Anterior
      </Button>

      {esUltimaPregunta ? (
        <Button type="primary" onClick={onSubmitAction} loading={quizSaving}>
          Finalizar y enviar
        </Button>
      ) : (
        <Text type="secondary" style={{ fontSize: isMobile ? 11 : 13 }}>
          {isMobile ? "Selecciona →" : "Selecciona una respuesta para continuar →"}
        </Text>
      )}
    </div>
  );
};
