const DEFAULT_QUIZ_SHARE_BG = "/quiz-card-bg.png";

// Asigna aquí las rutas por quiz (id o título normalizado) a medida que lleguen las imágenes.
// Formato recomendado de archivos: /quiz-logros/quiz-XX.png
const QUIZ_BG_BY_ID: Record<string, string> = {
  // "101": "/quiz-logros/quiz-01.png",
};

const QUIZ_BG_BY_TITLE: Record<string, string> = {
  // "introduccion a manicure": "/quiz-logros/quiz-02.png",
};

function normalizeText(value?: string | null): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveQuizShareBackground(input: {
  quizId?: string | number | null;
  quizTitle?: string | null;
}): string {
  const quizId = String(input.quizId || "").trim();
  if (quizId && QUIZ_BG_BY_ID[quizId]) {
    return QUIZ_BG_BY_ID[quizId];
  }

  const titleKey = normalizeText(input.quizTitle);
  if (titleKey && QUIZ_BG_BY_TITLE[titleKey]) {
    return QUIZ_BG_BY_TITLE[titleKey];
  }

  return DEFAULT_QUIZ_SHARE_BG;
}
