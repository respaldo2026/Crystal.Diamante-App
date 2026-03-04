"use client";

import React from "react";
import { Card, Col, Progress, Radio, Row, Space, Tag, Typography } from "antd";
import { normalizarTexto } from "@/modules/portal-estudiante/utils";

const { Text } = Typography;

type QuizQuestionFlowProps = {
  quizPreguntas: any[];
  quizRespuestas: Record<string, string>;
  quizPreguntaActual: number;
  quizAnimando: boolean;
  setQuizRespuestasAction: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setQuizPreguntaActualAction: React.Dispatch<React.SetStateAction<number>>;
  setQuizAnimandoAction: React.Dispatch<React.SetStateAction<boolean>>;
};

const getIndicadorVisualPreguntaQuiz = (pregunta?: string | null) => {
  const texto = normalizarTexto(pregunta);

  const reglas = [
    {
      regex: /(hepatitis|vih|vph|virus|bacteria|hongo|microorganismo|infeccion|onicomicosis|pseudomonas)/,
      emoji: "🦠",
      etiqueta: "Riesgo biológico",
      color: "red",
    },
    {
      regex: /(autoclave|estufa|esteriliz|desinfeccion|detergente|glutaraldehido|amonio|poe)/,
      emoji: "🧪",
      etiqueta: "Esterilización",
      color: "purple",
    },
    {
      regex: /(anatomia|mano|una|uña|falange|tendon|hiponiquio|lecho|matriz|placa ungueal)/,
      emoji: "🖐️",
      etiqueta: "Anatomía ungueal",
      color: "blue",
    },
    {
      regex: /(residuo|bolsa roja|bolsa negra|guardian|cortopunzante|desechar|descartar)/,
      emoji: "♻️",
      etiqueta: "Gestión de residuos",
      color: "green",
    },
    {
      regex: /(accidente biologico|sangre|riesgo|protocolo|supuracion|enrojecimiento|dolor)/,
      emoji: "⚠️",
      etiqueta: "Protocolo de seguridad",
      color: "orange",
    },
  ];

  const regla = reglas.find((item) => item.regex.test(texto));
  return regla || {
    emoji: "📘",
    etiqueta: "Bioseguridad",
    color: "geekblue",
  };
};

export const QuizQuestionFlow = ({
  quizPreguntas,
  quizRespuestas,
  quizPreguntaActual,
  quizAnimando,
  setQuizRespuestasAction,
  setQuizPreguntaActualAction,
  setQuizAnimandoAction,
}: QuizQuestionFlowProps) => {
  const preguntasPorBloque = 5;
  const totalPreguntas = quizPreguntas?.length || 0;
  const totalBloques = Math.max(1, Math.ceil(totalPreguntas / preguntasPorBloque));
  const quizBloqueActual = Math.floor(quizPreguntaActual / preguntasPorBloque) + 1;
  const inicioBloque = (quizBloqueActual - 1) * preguntasPorBloque;
  const finBloque = Math.min(inicioBloque + preguntasPorBloque, totalPreguntas);
  const preguntaActual = quizPreguntas[quizPreguntaActual];
  const respondidas = (quizPreguntas || []).filter((p: any) => Boolean(quizRespuestas[String(p.id)])).length;
  const progreso = totalPreguntas > 0 ? Math.round((respondidas / totalPreguntas) * 100) : 0;

  return (
    <Space direction="vertical" size={14} style={{ width: "100%" }}>
      <Card size="small">
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <Row justify="space-between" align="middle">
            <Col>
              <Text strong>{`Bloque ${quizBloqueActual} de ${totalBloques}`}</Text>
            </Col>
            <Col>
              <Tag>{`${respondidas}/${totalPreguntas} respondidas`}</Tag>
            </Col>
          </Row>
          <Row justify="space-between" align="middle">
            <Col>
              <Text type="secondary">{`Pregunta ${quizPreguntaActual + 1} de ${totalPreguntas}`}</Text>
            </Col>
            <Col>
              <Text type="secondary">{`Rango bloque: ${inicioBloque + 1}-${finBloque}`}</Text>
            </Col>
          </Row>
          <Progress percent={progreso} size="small" />
        </Space>
      </Card>

      {preguntaActual ? (
        <Card
          key={String(preguntaActual.id)}
          className={`quiz-question-transition ${quizAnimando ? "is-leaving" : ""}`}
          size="small"
          title={`Pregunta ${quizPreguntaActual + 1}`}
          bodyStyle={{ paddingTop: 12 }}
        >
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            {(() => {
              const indicador = getIndicadorVisualPreguntaQuiz(preguntaActual.pregunta);
              return <Tag color={indicador.color}>{`${indicador.emoji} ${indicador.etiqueta}`}</Tag>;
            })()}

            <Card
              size="small"
              title={<Text strong>Pregunta</Text>}
              bodyStyle={{ paddingTop: 10, paddingBottom: 10 }}
            >
              <Text strong style={{ fontSize: 15, lineHeight: 1.45 }}>
                {preguntaActual.pregunta}
              </Text>
            </Card>

            <Space direction="vertical" size={6} style={{ width: "100%" }}>
              <Text strong>Opciones de respuesta</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Selecciona una opción para continuar.
              </Text>
            </Space>

            <Radio.Group
              value={quizRespuestas[String(preguntaActual.id)]}
              onChange={(event) => {
                const value = String(event?.target?.value || "");
                if (!value) return;

                setQuizRespuestasAction((prev) => ({
                  ...prev,
                  [String(preguntaActual.id)]: value,
                }));

                const totalPreguntasLocal = quizPreguntas?.length || 0;
                const esUltima = quizPreguntaActual >= Math.max(0, totalPreguntasLocal - 1);

                if (!esUltima && !quizAnimando) {
                  setQuizAnimandoAction(true);
                  window.setTimeout(() => {
                    setQuizPreguntaActualAction((prev) => Math.min(totalPreguntasLocal - 1, prev + 1));
                    setQuizAnimandoAction(false);
                  }, 180);
                }
              }}
              style={{ width: "100%" }}
            >
              {(() => {
                const opcionSeleccionada = quizRespuestas[String(preguntaActual.id)] || "";
                const opciones = [
                  { value: "A", label: `A) ${preguntaActual.opcion_a}` },
                  { value: "B", label: `B) ${preguntaActual.opcion_b}` },
                  { value: "C", label: `C) ${preguntaActual.opcion_c}` },
                  { value: "D", label: `D) ${preguntaActual.opcion_d}` },
                ];

                return (
                  <Space direction="vertical" size={8} style={{ width: "100%" }}>
                    {opciones.map((opcion) => {
                      const activa = opcionSeleccionada === opcion.value;
                      return (
                        <label
                          key={opcion.value}
                          className={`quiz-option-card ${activa ? "is-active" : ""}`}
                        >
                          <Radio value={opcion.value} style={{ whiteSpace: "normal", lineHeight: 1.35 }}>
                            {opcion.label}
                          </Radio>
                        </label>
                      );
                    })}
                  </Space>
                );
              })()}
            </Radio.Group>
          </Space>
        </Card>
      ) : null}
    </Space>
  );
};
