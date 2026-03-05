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
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: isMobile ? "wrap" : "nowrap",
        width: "100%",
        gap: 8,
      }}
    >
      <Button
        onClick={onPreviousAction}
        disabled={quizPreguntaActual <= 0 || quizSaving || quizAnimando}
        style={isMobile ? { flex: "1 1 calc(50% - 4px)", minWidth: 0 } : undefined}
      >
        Anterior
      </Button>

      {esUltimaPregunta ? (
        <Button
          type="primary"
          onClick={onSubmitAction}
          loading={quizSaving}
          style={isMobile ? { flex: "1 1 calc(50% - 4px)", minWidth: 0 } : undefined}
        >
          Finalizar y enviar
        </Button>
      ) : (
        <Text
          type="secondary"
          style={{
            fontSize: isMobile ? 11 : 13,
            minWidth: 0,
            flex: isMobile ? "1 1 100%" : "0 1 auto",
            textAlign: isMobile ? "center" : "right",
            overflowWrap: "anywhere",
          }}
        >
          {isMobile ? "Selecciona →" : "Selecciona una respuesta para continuar →"}
        </Text>
      )}
    </div>
  );
};
