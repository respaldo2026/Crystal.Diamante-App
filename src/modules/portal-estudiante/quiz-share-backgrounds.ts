const DEFAULT_QUIZ_SHARE_BG = "/quiz-card-bg.png";
const QUIZ_LOGROS_BASE_PATH = "/quiz-logros";
const QUIZ_BG_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "avif"] as const;

// Asigna aquí las rutas por quiz (id o título normalizado) a medida que lleguen las imágenes.
// Formato recomendado de archivos: /quiz-logros/quiz-XX.png
const QUIZ_BG_BY_ID: Record<string, string> = {
  // "101": "/quiz-logros/quiz-01.png",
};

const QUIZ_BG_BY_TITLE: Record<string, string> = {
  // "introduccion a manicure": "/quiz-logros/quiz-02.png",
};

function slugify(value?: string | null): string {
  return normalizeText(value).replace(/\s+/g, "-");
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function buildCandidatesByQuizId(quizId?: string | number | null): string[] {
  const rawId = String(quizId || "").trim();
  if (!rawId) return [];

  const numericOnly = rawId.replace(/\D/g, "");
  const variants = unique([
    rawId,
    numericOnly,
    numericOnly ? numericOnly.padStart(2, "0") : "",
  ]);

  const prefixes = ["quiz-", "", "fondo-quiz-", "clase-"];
  const candidates: string[] = [];

  variants.forEach((variant) => {
    prefixes.forEach((prefix) => {
      QUIZ_BG_EXTENSIONS.forEach((ext) => {
        candidates.push(`${QUIZ_LOGROS_BASE_PATH}/${prefix}${variant}.${ext}`);
      });
    });
  });

  return unique(candidates);
}

function extractClassNumberFromTitle(quizTitle?: string | null): string {
  const normalized = normalizeText(quizTitle);
  if (!normalized) return "";

  const classMatch = normalized.match(/(?:^|\s)clase\s*(\d{1,3})(?:\s|$)/);
  if (classMatch?.[1]) return classMatch[1];

  const leadingNumber = normalized.match(/^(\d{1,3})(?:\s|$)/);
  if (leadingNumber?.[1]) return leadingNumber[1];

  return "";
}

function buildCandidatesByClassNumber(classNumber?: string | null): string[] {
  const raw = String(classNumber || "").trim();
  if (!raw) return [];

  const numericOnly = raw.replace(/\D/g, "");
  if (!numericOnly) return [];

  const variants = unique([
    numericOnly,
    numericOnly.padStart(2, "0"),
  ]);
  const prefixes = ["clase-", "quiz-", "", "fondo-quiz-"];
  const candidates: string[] = [];

  variants.forEach((variant) => {
    prefixes.forEach((prefix) => {
      QUIZ_BG_EXTENSIONS.forEach((ext) => {
        candidates.push(`${QUIZ_LOGROS_BASE_PATH}/${prefix}${variant}.${ext}`);
      });
    });
  });

  return unique(candidates);
}

function buildCandidatesByQuizTitle(quizTitle?: string | null): string[] {
  const slug = slugify(quizTitle);
  if (!slug) return [];

  const variants = unique([
    slug,
    slug.replace(/-/g, "_"),
  ]);
  const prefixes = ["", "quiz-", "fondo-quiz-"];
  const candidates: string[] = [];

  variants.forEach((variant) => {
    prefixes.forEach((prefix) => {
      QUIZ_BG_EXTENSIONS.forEach((ext) => {
        candidates.push(`${QUIZ_LOGROS_BASE_PATH}/${prefix}${variant}.${ext}`);
      });
    });
  });

  return unique(candidates);
}

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
  quizClassNumber?: string | number | null;
}): string {
  return resolveQuizShareBackgroundCandidates(input)[0] || DEFAULT_QUIZ_SHARE_BG;
}

export function resolveQuizShareBackgroundCandidates(input: {
  quizId?: string | number | null;
  quizTitle?: string | null;
  quizClassNumber?: string | number | null;
}): string[] {
  const candidates: string[] = [];
  const quizId = String(input.quizId || "").trim();
  if (quizId && QUIZ_BG_BY_ID[quizId]) {
    candidates.push(QUIZ_BG_BY_ID[quizId]);
  }

  const titleKey = normalizeText(input.quizTitle);
  if (titleKey && QUIZ_BG_BY_TITLE[titleKey]) {
    candidates.push(QUIZ_BG_BY_TITLE[titleKey]);
  }

  const classNumberFromQuiz = String(input.quizClassNumber || "").trim();
  const classNumberFromTitle = extractClassNumberFromTitle(input.quizTitle);
  candidates.push(...buildCandidatesByClassNumber(classNumberFromQuiz));
  candidates.push(...buildCandidatesByClassNumber(classNumberFromTitle));
  candidates.push(...buildCandidatesByQuizTitle(input.quizTitle));
  candidates.push(...buildCandidatesByQuizId(input.quizId));
  candidates.push(DEFAULT_QUIZ_SHARE_BG);

  return unique(candidates);
}
