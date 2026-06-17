const AUTOMATION_PATTERNS = [
  /^\s*\[sistema\]/i,
  /\balerta de abastecimiento\b/i,
  /\bresumen abastecimiento\b/i,
  /\bfollow[-\s]?up automatico\b/i,
  /\brecordatorio de pago\b/i,
  /\bliquidacion de profesores\b/i,
  /\bclave alerta\b/i,
  /\bmeta message id\b/i,
  /\benvio usado\b/i,
  /\bmodo\s+no[-\s]?groups\b/i,
];

export function normalizeAiGuardText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function shouldSkipGeminiRequest(...values: Array<unknown>): boolean {
  const text = normalizeAiGuardText(values.filter(Boolean).join(" \n"));
  if (!text) return false;

  return AUTOMATION_PATTERNS.some((pattern) => pattern.test(text));
}