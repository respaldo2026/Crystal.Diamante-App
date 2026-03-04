"use client";

import React from "react";
import Image from "next/image";
import { Button, Col, Row, Typography } from "antd";
import { StarFilled, WhatsAppOutlined } from "@ant-design/icons";

const { Text } = Typography;

type QuizApprovedResultProps = {
  isMobile: boolean;
  quizResultado: {
    calificacion: number;
    correctas: number;
    totalPreguntas: number;
    porcentaje: number;
    tituloQuiz?: string;
  };
  estudianteNombre?: string | null;
  logoAcademia?: string | null;
  logrocardRef: React.RefObject<HTMLDivElement | null>;
  onShareAction: (platform: "whatsapp" | "facebook" | "instagram") => void;
  onCloseAction: () => void;
};

export const QuizApprovedResult = ({
  isMobile,
  quizResultado,
  estudianteNombre,
  logoAcademia,
  logrocardRef,
  onShareAction,
  onCloseAction,
}: QuizApprovedResultProps) => {
  const firstName = estudianteNombre ? estudianteNombre.split(" ")[0] : "";
  const mensajeLogro = `🏆 ¡Acabo de aprobar con ${quizResultado.calificacion.toFixed(1)}/5.0 (${quizResultado.porcentaje}%)${quizResultado.tituloQuiz ? ` el quiz "${quizResultado.tituloQuiz}"` : ""} en Academia Crystal Diamante! 💪✨ Sigo superando mis metas. ¿Y tú? #AcademiaCrystalDiamante #Logro #Aprendizaje`;

  return (
    <div style={{ color: "#fff" }}>
      <div
        ref={logrocardRef}
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: 16,
          margin: "0 10px",
          paddingBottom: 20,
          background: "linear-gradient(160deg, rgba(32,7,64,0.96) 0%, rgba(49,12,98,0.96) 42%, rgba(11,39,102,0.96) 100%)",
          boxShadow: "0 12px 36px rgba(0,0,0,0.35)",
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          pointerEvents: "none", overflow: "hidden", borderRadius: 16,
        }}>
          {[...Array(12)].map((_, i) => (
            <StarFilled
              key={i}
              style={{
                position: "absolute",
                color: `rgba(255,215,0,${0.12 + (i % 4) * 0.07})`,
                fontSize: 10 + (i % 5) * 6,
                top: `${(i * 37) % 90}%`,
                left: `${(i * 53 + 5) % 95}%`,
                transform: `rotate(${i * 25}deg)`,
              }}
            />
          ))}
        </div>

        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          paddingTop: 28, paddingBottom: 12, position: "relative",
        }}>
          {logoAcademia ? (
            <Image
              src={logoAcademia}
              alt="Academia"
              width={180}
              height={52}
              unoptimized
              style={{ height: 52, maxWidth: 180, objectFit: "contain", marginBottom: 6, filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))" }}
            />
          ) : (
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, letterSpacing: 2, marginBottom: 6 }}>ACADEMIA CRYSTAL DIAMANTE</Text>
          )}
          <div style={{ width: 48, height: 2, background: "linear-gradient(90deg, transparent, #ffd700, transparent)" }} />
        </div>

        <div style={{ textAlign: "center", padding: "8px 20px 0" }}>
          <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 4 }}>🏆</div>
          <div style={{
            display: "inline-flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            width: 110, height: 110, borderRadius: "50%",
            background: "linear-gradient(135deg, #ffd700 0%, #ff9500 100%)",
            boxShadow: "0 0 40px rgba(255,215,0,0.55), 0 4px 20px rgba(0,0,0,0.4)",
            margin: "4px auto 10px",
          }}>
            <span style={{ color: "#1a0533", fontSize: 38, fontWeight: 900, lineHeight: 1 }}>
              {quizResultado.calificacion.toFixed(1)}
            </span>
            <span style={{ color: "rgba(26,5,51,0.75)", fontSize: 12, fontWeight: 600 }}>/5.0</span>
          </div>

          <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, marginBottom: 4, lineHeight: 1.2 }}>
            {`¡Lo lograste${firstName ? `, ${firstName}` : ""}! 🎉`}
          </div>
          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 14, marginBottom: 6, lineHeight: 1.45, wordBreak: "break-word", overflowWrap: "anywhere", padding: "0 4px" }}>
            {quizResultado.tituloQuiz && (
              <span>📚 <em>{quizResultado.tituloQuiz}</em></span>
            )}
          </div>
          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 1.45 }}>
            {quizResultado.correctas} de {quizResultado.totalPreguntas} correctas · {quizResultado.porcentaje}%
          </div>

          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
            <span style={{ fontSize: 11, color: "#1b073a", background: "#ffd700", borderRadius: 999, padding: "4px 10px", fontWeight: 800 }}>APROBADO</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.95)", background: "rgba(255,255,255,0.16)", borderRadius: 999, padding: "4px 10px", fontWeight: 700 }}>Meta cumplida</span>
          </div>
        </div>

        <div style={{
          margin: "16px 18px 0",
          padding: "14px 14px",
          borderRadius: 12,
          background: "linear-gradient(145deg, rgba(255,255,255,0.13), rgba(255,255,255,0.06))",
          border: "1px solid rgba(255,215,0,0.30)",
          backdropFilter: "blur(4px)",
        }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>
            ✨ Presume tu logro
          </div>
          <div style={{ color: "rgba(255,255,255,0.96)", fontSize: 13, lineHeight: 1.62, whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "anywhere" }}>
            {mensajeLogro}
          </div>
        </div>
      </div>

      <div style={{ padding: "14px 20px 8px" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 10, textAlign: "center", textTransform: "uppercase", letterSpacing: 1 }}>
          Comparte en
        </div>
        <Row gutter={[8, 8]} justify="center">
          <Col xs={24} sm={8}>
            <Button
              block
              icon={<WhatsAppOutlined />}
              size="large"
              style={{
                background: "#25D366", color: "#fff",
                border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13,
                height: 44,
                boxShadow: "0 3px 12px rgba(37,211,102,0.4)",
              }}
              onClick={() => onShareAction("whatsapp")}
            >
              WhatsApp
            </Button>
          </Col>
          <Col xs={24} sm={8}>
            <Button
              block
              size="large"
              style={{
                background: "#1877F2", color: "#fff",
                border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13,
                height: 44,
                boxShadow: "0 3px 12px rgba(24,119,242,0.4)",
              }}
              onClick={() => onShareAction("facebook")}
            >
              📘 Facebook
            </Button>
          </Col>
          <Col xs={24} sm={8}>
            <Button
              block
              size="large"
              style={{
                background: "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
                color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13,
                height: 44,
                boxShadow: "0 3px 12px rgba(220,39,67,0.4)",
              }}
              onClick={() => onShareAction("instagram")}
            >
              📸 Instagram
            </Button>
          </Col>
        </Row>
      </div>

      <div style={{ padding: "12px 16px 24px", textAlign: "center" }}>
        <Button
          block
          type="primary"
          size="large"
          style={{
            background: "linear-gradient(90deg, #ffd700, #ff9500)",
            border: "none", color: "#1a0533", fontWeight: 800,
            borderRadius: 10, fontSize: 14, height: 44,
            boxShadow: "0 4px 16px rgba(255,215,0,0.4)",
          }}
          onClick={onCloseAction}
        >
          🌟 ¡Ya presumí mi logro! Cerrar
        </Button>
      </div>
    </div>
  );
};
