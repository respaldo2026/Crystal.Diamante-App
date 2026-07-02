import React from "react";

type Props = {
  completadas: number;
  total: number;
};

export const CourseFinishTrack: React.FC<Props> = ({ completadas, total }) => {
  const totalVisual = Math.max(0, Math.min(total || 0, 20));
  const completadasVisual = Math.max(0, Math.min(completadas || 0, totalVisual));

  if (!totalVisual) return null;

  const faltantes = Math.max(total - completadas, 0);

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
        {Array.from({ length: totalVisual }).map((_, i) => {
          const done = i < completadasVisual;
          return (
            <span
              key={i}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: done ? "#d81b87" : "#e5e7eb",
                border: done ? "1px solid #be185d" : "1px solid #cbd5e1",
                display: "inline-block",
              }}
            />
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: "#6b7280" }}>
        {faltantes > 0 ? `Te faltan ${faltantes} clase(s) para completar el curso.` : "Curso completado. ¡Excelente trabajo!"}
      </div>
    </div>
  );
};
