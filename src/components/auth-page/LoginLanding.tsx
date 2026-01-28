import type { ReactNode } from "react";

const HIGHLIGHT_CARDS = [
  {
    title: "Artista en Uñas",
    description:
      "Esculpido, decoración 3D y tendencias internacionales para resaltar cada detalle.",
    image:
      "https://images.unsplash.com/photo-1522337958684-6b9259756a14?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Maquillaje Profesional",
    description:
      "Técnicas HD, social y editorial con productos de alta gama y práctica guiada.",
    image:
      "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Barbería & Estilismo",
    description:
      "Fades impecables, afeitado clásico y estilismo masculino de alto nivel.",
    image:
      "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Miradas Perfectas",
    description:
      "Extensión pelo a pelo, lifting, laminado y diseño de cejas para una mirada impactante.",
    image:
      "https://images.unsplash.com/photo-1519414442781-fbd745c5b497?auto=format&fit=crop&w=1200&q=80",
  },
];

export function LoginLanding({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 0% 0%, rgba(232, 121, 249, 0.18), transparent 45%), radial-gradient(circle at 100% 0%, rgba(96, 165, 250, 0.18), transparent 45%), #0f172a",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 20% 80%, rgba(94, 234, 212, 0.18), transparent 40%)",
          filter: "blur(0px)",
          pointerEvents: "none",
        }}
        aria-hidden
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "48px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: "48px",
            width: "100%",
            maxWidth: "1180px",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            alignItems: "center",
          }}
        >
          <section style={{ color: "#e2e8f0" }}>
            <span
              style={{
                display: "inline-flex",
                padding: "6px 14px",
                borderRadius: "999px",
                background: "rgba(148, 163, 184, 0.12)",
                color: "#bae6fd",
                fontSize: "0.85rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 600,
                marginBottom: "18px",
              }}
            >
              Bienvenidos
            </span>
            <h1
              style={{
                fontSize: "clamp(2.5rem, 3vw, 3.4rem)",
                lineHeight: 1.05,
                fontWeight: 700,
                marginBottom: "18px",
                color: "#f8fafc",
                maxWidth: "28ch",
              }}
            >
              Academia de Belleza Crystal Diamante
            </h1>
            <p
              style={{
                fontSize: "1.05rem",
                lineHeight: 1.7,
                color: "#cbd5f5",
                maxWidth: "56ch",
              }}
            >
              Potenciamos tu talento en estética profesional con programas certificados en: Uñas, maquillaje, barbería, cejas y pestañas. Mantente al día con tu progreso académico y los recursos exclusivos de la academia.
            </p>

            <div
              style={{
                marginTop: "32px",
                display: "grid",
                gap: "16px",
              }}
            >
              {HIGHLIGHT_CARDS.map((card) => (
                <article
                  key={card.title}
                  style={{
                    position: "relative",
                    borderRadius: "18px",
                    overflow: "hidden",
                    minHeight: "120px",
                    backgroundImage: `linear-gradient(135deg, rgba(15, 23, 42, 0.7), rgba(30, 41, 59, 0.75)), url(${card.image})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    border: "1px solid rgba(148, 163, 184, 0.25)",
                    boxShadow: "0 18px 35px rgba(15, 23, 42, 0.35)",
                    padding: "22px",
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600, color: "#f8fafc" }}>
                    {card.title}
                  </h3>
                  <p
                    style={{
                      marginTop: "8px",
                      marginBottom: 0,
                      color: "#e2e8f0",
                      fontSize: "0.95rem",
                      lineHeight: 1.6,
                    }}
                  >
                    {card.description}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <div
            style={{
              backdropFilter: "blur(12px)",
              padding: "32px",
              borderRadius: "28px",
              background: "rgba(15, 23, 42, 0.55)",
              border: "1px solid rgba(148, 163, 184, 0.22)",
              boxShadow: "0 30px 50px rgba(15, 23, 42, 0.45)",
            }}
          >
            <div
              style={{
                background: "#ffffff",
                borderRadius: "22px",
                padding: "32px",
                boxShadow: "0 20px 45px rgba(15, 23, 42, 0.18)",
              }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
