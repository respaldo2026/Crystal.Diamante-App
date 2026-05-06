export const UMBRAL_APROBACION_QUIZ_PORCENTAJE = 76;
export const UMBRAL_APROBACION_QUIZ_NOTA = 3.8;

export const quizAprobado = (calificacion: number | null | undefined) =>
  Number(calificacion || 0) >= UMBRAL_APROBACION_QUIZ_NOTA;

export const getActividadColor = (nota?: number | null): string => {
  const value = Number(nota);
  if (!Number.isFinite(value)) return "default";
  if (value >= 4) return "green";
  if (value >= 3) return "gold";
  return "red";
};

export const normalizarTexto = (valor?: string | null) =>
  String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const parseTemaTituloMaterial = (titulo?: string | null) => {
  const raw = String(titulo || "").trim();
  const patrones = [
    /^\s*tema\s*[:\-]\s*(.+?)\s+[—–]\s+(.+)$/i,
    /^\s*\[\s*tema\s*[:\-]\s*(.+?)\s*\]\s*[—–]\s*(.+)$/i,
    /^\s*tema\s*[:\-]\s*(.+?)\s+-\s+(.+)$/i,
    /^\s*\[\s*tema\s*[:\-]\s*(.+?)\s*\]\s*:\s*(.+)$/i,
  ];

  for (const patron of patrones) {
    const match = raw.match(patron);
    if (!match) continue;
    return {
      tema: String(match[1] || "").trim(),
      tituloLimpio: String(match[2] || raw).trim(),
    };
  }

  return {
    tema: "",
    tituloLimpio: raw,
  };
};

export const extractClassNumber = (value?: string | null): number | null => {
  const text = String(value || "");
  const patterns = [
    /clase\s*#?\s*(\d{1,3})/i,
    /\b(\d{1,3})\b\s*$/,
    /^\s*(\d{1,3})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
};

export const normalizarTemaComparacion = (valor?: string | null) =>
  normalizarTexto(valor).replace(/^\d+\s*/, "").trim();

export const limpiarTituloMaterial = (titulo?: string | null) => {
  const raw = String(titulo || "").trim();
  if (!raw) return "";

  const sinPrefijoTema = raw.replace(/^\s*tema\s*[:\-]\s*/i, "").trim();
  return sinPrefijoTema || raw;
};

export const getMaterialCanonicalTitle = (material: any, temaReferencia?: string | null) => {
  const parsed = parseTemaTituloMaterial(material?.titulo);
  const tituloLimpio = limpiarTituloMaterial(parsed?.tituloLimpio || material?.titulo || "");

  const temaRefNorm = normalizarTemaComparacion(temaReferencia || parsed?.tema || "");
  const tituloNorm = normalizarTemaComparacion(tituloLimpio);

  if (temaRefNorm && tituloNorm === temaRefNorm) {
    return temaReferencia || parsed?.tema || tituloLimpio;
  }

  return tituloLimpio;
};

export const getMaterialCanonicalKey = (material: any, temaReferencia?: string | null) => {
  const parsed = parseTemaTituloMaterial(material?.titulo);
  const temaKey = normalizarTemaComparacion(parsed?.tema || temaReferencia || "");
  const tituloKey = normalizarTexto(getMaterialCanonicalTitle(material, temaReferencia));
  const tipoKey = normalizarTexto(material?.tipo_material || "");
  const urlKey = normalizarTexto(String(material?.url_archivo || "").replace(/^https?:\/\//i, ""));
  return String(`${material?.programa_id || ""}-${material?.pensum_id || ""}-${temaKey}-${tituloKey}-${tipoKey}-${urlKey}`);
};
