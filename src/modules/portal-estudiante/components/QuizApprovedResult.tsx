"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button, Col, Row } from "antd";
import { WhatsAppOutlined } from "@ant-design/icons";
import {
  resolveQuizShareBackground,
  resolveQuizShareBackgroundCandidates,
} from "@/modules/portal-estudiante/quiz-share-backgrounds";

type QuizApprovedResultProps = {
  isMobile: boolean;
  quizResultado: {
    calificacion: number;
    correctas: number;
    totalPreguntas: number;
    porcentaje: number;
    tituloQuiz?: string;
    claseNumero?: number | string | null;
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
  const normalizedQuizTitle = String(quizResultado.tituloQuiz || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  const isBioseguridadBasica = normalizedQuizTitle.includes("bioseguridad basica");
  const bgCandidates = useMemo(() => resolveQuizShareBackgroundCandidates({
    quizId: (quizResultado as any)?.quizId,
    quizTitle: quizResultado.tituloQuiz,
    quizClassNumber: quizResultado.claseNumero,
  }), [quizResultado]);
  const [bgImageUrl, setBgImageUrl] = useState<string>(() => resolveQuizShareBackground({
    quizId: (quizResultado as any)?.quizId,
    quizTitle: quizResultado.tituloQuiz,
    quizClassNumber: quizResultado.claseNumero,
  }));

  useEffect(() => {
    let isCancelled = false;

    const checkImage = (url: string): Promise<boolean> =>
      new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = url;
      });

    const pickBackground = async () => {
      for (const candidate of bgCandidates) {
        // Toma el primer asset realmente disponible para evitar fondos rotos.
        const exists = await checkImage(candidate);
        if (exists) {
          if (!isCancelled) setBgImageUrl(candidate);
          return;
        }
      }

      if (!isCancelled) setBgImageUrl(resolveQuizShareBackground({
        quizId: (quizResultado as any)?.quizId,
        quizTitle: quizResultado.tituloQuiz,
        quizClassNumber: quizResultado.claseNumero,
      }));
    };

    void pickBackground();

    return () => {
      isCancelled = true;
    };
  }, [bgCandidates, quizResultado]);

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
          backgroundImage: `url('${bgImageUrl}')`,
          backgroundSize: "cover",
          backgroundPosition: "center top",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          padding: "22px 20px 24px",
          boxSizing: "border-box",
        }}
      >
        {/* Capa semitransparente para legibilidad del texto */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: 20,
          background: isBioseguridadBasica
            ? "linear-gradient(to bottom, transparent 54%, rgba(8,4,24,0.72) 75%, rgba(8,4,24,0.94) 100%)"
            : "linear-gradient(to bottom, transparent 58%, rgba(10,5,30,0.62) 78%, rgba(10,5,30,0.9) 100%)",
          pointerEvents: "none",
        }} />

        {/* ── Contenido dinámico ── */}
        <div style={{ width: "100%", height: "100%", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", gap: 12 }}>

          {/* Bloque superior en zona iluminada */}
          <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingTop: "30%" }}>

            {/* Nota en círculo dorado */}
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              width: 112, height: 112, borderRadius: "50%",
              background: "linear-gradient(135deg, #ffd700 0%, #ff8c00 100%)",
              boxShadow: "0 0 48px rgba(255,215,0,0.7), 0 6px 28px rgba(0,0,0,0.5)",
            }}>
              <span style={{ color: "#1a0533", fontSize: 42, fontWeight: 900, lineHeight: 1 }}>
                {quizResultado.calificacion.toFixed(1)}
              </span>
              <span style={{ color: "rgba(26,5,51,0.65)", fontSize: 13, fontWeight: 700 }}>/5.0</span>
            </div>

            {/* Nombre + Quiz */}
            <div style={{ textAlign: "center", width: "100%", padding: "0 4px" }}>
              <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.25, marginBottom: 6, textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}>
                {`¡Lo lograste${firstName ? `, ${firstName}` : ""}! 🎉`}
              </div>
              {quizResultado.tituloQuiz && (
                  <div style={{
                    color: "#ffe58f",
                    fontSize: 13,
                    fontWeight: 800,
                    textShadow: "0 2px 10px rgba(0,0,0,0.9)",
                    background: "rgba(15, 8, 35, 0.42)",
                    border: "1px solid rgba(255,229,143,0.35)",
                    borderRadius: 10,
                    padding: "5px 10px",
                    wordBreak: "break-word",
                    overflowWrap: "anywhere",
                  }}>
                  📚 <em>{quizResultado.tituloQuiz}</em>
                </div>
              )}
            </div>
          </div>

          {/* Bloque inferior */}
          <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: "auto" }}>
            {/* Porcentaje + stats */}
            <div style={{
              width: "100%", padding: "12px 16px 10px", borderRadius: 14,
              background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,215,0,0.30)",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 38, fontWeight: 900, color: "#ffd700", lineHeight: 1 }}>
                {quizResultado.porcentaje}%
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3, letterSpacing: 1.2, textTransform: "uppercase" }}>
                {quizResultado.correctas} de {quizResultado.totalPreguntas} correctas
              </div>
            </div>

            {/* Badges */}
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <span style={{ fontSize: 11, color: "#1b073a", background: "#ffd700", borderRadius: 999, padding: "4px 14px", fontWeight: 900, letterSpacing: 0.5 }}>
                ✓ APROBADO
              </span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.9)", background: "rgba(255,255,255,0.15)", borderRadius: 999, padding: "4px 14px", fontWeight: 700 }}>
                🎯 Meta cumplida
              </span>
            </div>

            {/* Hashtags */}
            <div style={{ textAlign: "center" }}>
              <div style={{ color: "rgba(255,215,0,0.4)", fontSize: 10.5, letterSpacing: 0.3, lineHeight: 1.8 }}>
                #AcademiaCrystalDiamante · #Logro · #Aprendizaje
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Botones compartir ── */}
      <div style={{ padding: "10px 16px 6px" }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", marginBottom: 8, textAlign: "center", textTransform: "uppercase", letterSpacing: 1.2 }}>
          Comparte en
        </div>
        <Row gutter={[6, 6]} justify="center">
          <Col xs={24} sm={8}>
            <Button
              block
              icon={<WhatsAppOutlined />}
              size="middle"
              style={{
                background: "#25D366", color: "#fff",
                border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12,
                height: 36, boxShadow: "0 2px 8px rgba(37,211,102,0.4)",
              }}
              onClick={() => onShareAction("whatsapp")}
            >
              WhatsApp
            </Button>
          </Col>
          <Col xs={24} sm={8}>
            <Button
              block
              size="middle"
              style={{
                background: "#1877F2", color: "#fff",
                border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12,
                height: 36, boxShadow: "0 2px 8px rgba(24,119,242,0.4)",
              }}
              onClick={() => onShareAction("facebook")}
            >
              📘 Facebook
            </Button>
          </Col>
          <Col xs={24} sm={8}>
            <Button
              block
              size="middle"
              style={{
                background: "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
                color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12,
                height: 36, boxShadow: "0 2px 8px rgba(220,39,67,0.4)",
              }}
              onClick={() => onShareAction("instagram")}
            >
              📸 Instagram
            </Button>
          </Col>
        </Row>
      </div>

      <div style={{ padding: "8px 16px 20px", textAlign: "center" }}>
        <Button
          block
          type="primary"
          size="middle"
          style={{
            background: "linear-gradient(90deg, #ffd700, #ff9500)",
            border: "none", color: "#1a0533", fontWeight: 800,
            borderRadius: 8, fontSize: 13, height: 38,
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
