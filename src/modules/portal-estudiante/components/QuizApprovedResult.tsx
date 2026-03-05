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
      {/* ── TARJETA ── formato 9:16 para WhatsApp Estado e Instagram Stories */}
      <div
        ref={logrocardRef}
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: 20,
          margin: "0 auto",
          width: "100%",
          maxWidth: 340,
          aspectRatio: "9 / 16",
          background: "linear-gradient(170deg, #1a0533 0%, #2d0a5c 40%, #0d1f6e 75%, #0a1a4a 100%)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          border: "1px solid rgba(255,255,255,0.10)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "32px 24px 26px",
        }}
      >
        {/* ── Fondo decorativo ── */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {[...Array(18)].map((_, i) => (
            <StarFilled
              key={i}
              style={{
                position: "absolute",
                color: `rgba(255,215,0,${0.06 + (i % 5) * 0.05})`,
                fontSize: 7 + (i % 6) * 6,
                top: `${(i * 31) % 96}%`,
                left: `${(i * 59 + 7) % 95}%`,
                transform: `rotate(${i * 20}deg)`,
              }}
            />
          ))}
          {/* Halo central dorado */}
          <div style={{
            position: "absolute",
            width: 300, height: 300, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,215,0,0.07) 0%, transparent 70%)",
            top: "28%", left: "50%", transform: "translateX(-50%)",
          }} />
          {/* Círculo decorativo inferior */}
          <div style={{
            position: "absolute",
            width: 220, height: 220, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(100,60,255,0.10) 0%, transparent 70%)",
            bottom: "8%", right: "-15%",
          }} />
        </div>

        {/* ── SECCIÓN 1: Logo ── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, position: "relative", width: "100%" }}>
          {logoAcademia ? (
            <Image
              src={logoAcademia}
              alt="Academia"
              width={160}
              height={48}
              unoptimized
              style={{ height: 48, maxWidth: 160, objectFit: "contain", filter: "drop-shadow(0 2px 10px rgba(0,0,0,0.6))" }}
            />
          ) : (
            <Text style={{ color: "rgba(255,255,255,0.88)", fontSize: 12, letterSpacing: 2.5, fontWeight: 800 }}>ACADEMIA CRYSTAL DIAMANTE</Text>
          )}
          <div style={{ width: 56, height: 1.5, background: "linear-gradient(90deg, transparent, #ffd700, transparent)" }} />
        </div>

        {/* ── SECCIÓN 2: Trofeo + Nota ── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, position: "relative" }}>
          <div style={{ fontSize: 60, lineHeight: 1, filter: "drop-shadow(0 0 24px rgba(255,200,0,0.65))" }}>🏆</div>
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            width: 128, height: 128, borderRadius: "50%",
            background: "linear-gradient(135deg, #ffd700 0%, #ff8c00 100%)",
            boxShadow: "0 0 52px rgba(255,215,0,0.65), 0 6px 28px rgba(0,0,0,0.45)",
          }}>
            <span style={{ color: "#1a0533", fontSize: 46, fontWeight: 900, lineHeight: 1 }}>
              {quizResultado.calificacion.toFixed(1)}
            </span>
            <span style={{ color: "rgba(26,5,51,0.65)", fontSize: 13, fontWeight: 700 }}>/5.0</span>
          </div>
        </div>

        {/* ── SECCIÓN 3: Nombre + Quiz ── */}
        <div style={{ textAlign: "center", position: "relative", width: "100%", padding: "0 4px" }}>
          <div style={{ fontSize: 21, fontWeight: 900, marginBottom: 8, lineHeight: 1.25, textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
            {`¡Lo lograste${firstName ? `, ${firstName}` : ""}! 🎉`}
          </div>
          {quizResultado.tituloQuiz && (
            <div style={{
              color: "rgba(255,215,0,0.9)", fontSize: 13, fontWeight: 600, marginBottom: 6,
              wordBreak: "break-word", overflowWrap: "anywhere",
            }}>
              📚 <em>{quizResultado.tituloQuiz}</em>
            </div>
          )}
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
            {quizResultado.correctas} de {quizResultado.totalPreguntas} preguntas correctas
          </div>
        </div>

        {/* ── SECCIÓN 4: Porcentaje + Badges ── */}
        <div style={{ width: "100%", position: "relative" }}>
          <div style={{
            padding: "14px 16px 10px",
            borderRadius: 16,
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,215,0,0.28)",
            textAlign: "center",
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#ffd700", lineHeight: 1 }}>
              {quizResultado.porcentaje}%
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 4, letterSpacing: 1.5, textTransform: "uppercase" }}>
              Porcentaje de aprobación
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <span style={{ fontSize: 11, color: "#1b073a", background: "#ffd700", borderRadius: 999, padding: "4px 14px", fontWeight: 900, letterSpacing: 0.5 }}>
              ✓ APROBADO
            </span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.9)", background: "rgba(255,255,255,0.14)", borderRadius: 999, padding: "4px 14px", fontWeight: 700 }}>
              🎯 Meta cumplida
            </span>
          </div>
        </div>

        {/* ── SECCIÓN 5: Hashtags + Pie ── */}
        <div style={{ textAlign: "center", position: "relative", width: "100%" }}>
          <div style={{ color: "rgba(255,215,0,0.35)", fontSize: 11, letterSpacing: 0.3, lineHeight: 1.9 }}>
            #AcademiaCrystalDiamante · #Logro · #Aprendizaje
          </div>
          <div style={{ color: "rgba(255,255,255,0.18)", fontSize: 10, marginTop: 4, letterSpacing: 1 }}>
            crystaldiamante.com
          </div>
        </div>
      </div>

      {/* ── Indicador de formato ── */}
      <div style={{ textAlign: "center", margin: "8px 0 2px", fontSize: 10.5, color: "rgba(255,255,255,0.30)", letterSpacing: 0.3 }}>
        📐 Formato 9:16 · ideal para WhatsApp Estado e Instagram Stories
      </div>

      {/* ── Botones compartir ── */}
      <div style={{ padding: "12px 20px 8px" }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", marginBottom: 10, textAlign: "center", textTransform: "uppercase", letterSpacing: 1.2 }}>
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
                height: 44, boxShadow: "0 3px 12px rgba(37,211,102,0.4)",
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
                height: 44, boxShadow: "0 3px 12px rgba(24,119,242,0.4)",
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
                height: 44, boxShadow: "0 3px 12px rgba(220,39,67,0.4)",
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
