export type ModalidadPago = "POR_CLASE" | "MENSUAL_100";

export type MaterialCoverage = "NINGUNO" | "MENSUAL_100";

export type PaymentPlan = {
  modalidad: ModalidadPago;
  label: string;
  descripcion: string;
  montoMensual: number;
  montoPorClase: number;
  porcentajeProductos: number;
};

export type ProgramaPaymentConfig = {
  precio_por_clase?: number | null;
  precio_mensual_70?: number | null;
  precio_mensual_100?: number | null;
  precio_mensualidad?: number | null;
};

export const PLANES_PAGO: Record<ModalidadPago, PaymentPlan> = {
  POR_CLASE: {
    modalidad: "POR_CLASE",
    label: "Por clase",
    descripcion: "$40.000 por clase asistida",
    montoMensual: 0,
    montoPorClase: 40000,
    porcentajeProductos: 0,
  },
  MENSUAL_100: {
    modalidad: "MENSUAL_100",
    label: "Mensual 100% productos",
    descripcion: "$300.000 mensuales",
    montoMensual: 300000,
    montoPorClase: 0,
    porcentajeProductos: 100,
  },
};

export const MODALIDAD_PAGO_DEFAULT: ModalidadPago = "MENSUAL_100";

export function normalizeModalidadPago(value?: string | null): ModalidadPago {
  const normalized = String(value || "").toUpperCase().trim();
  if (normalized === "POR_CLASE") return "POR_CLASE";
  if (normalized === "MENSUAL_100") return "MENSUAL_100";
  return MODALIDAD_PAGO_DEFAULT;
}

export function getPaymentPlan(value?: string | null): PaymentPlan {
  return PLANES_PAGO[normalizeModalidadPago(value)];
}

export function resolvePaymentPlanAmounts(
  modalidadInput?: string | null,
  programaConfig?: ProgramaPaymentConfig | null,
): { montoMensual: number; montoPorClase: number; porcentajeProductos: number } {
  const modalidad = normalizeModalidadPago(modalidadInput);
  const fallback = getPaymentPlan(modalidad);
  const cfg = programaConfig || {};

  if (modalidad === "POR_CLASE") {
    return {
      montoMensual: 0,
      montoPorClase: Number(cfg.precio_por_clase ?? fallback.montoPorClase ?? 0),
      porcentajeProductos: 0,
    };
  }

  return {
    montoMensual: Number(
      cfg.precio_mensual_100 ?? cfg.precio_mensualidad ?? fallback.montoMensual ?? 0,
    ),
    montoPorClase: 0,
    porcentajeProductos: 100,
  };
}

export function getMontoMensualByPlan(value?: string | null): number {
  return getPaymentPlan(value).montoMensual;
}

export function getMontoPorClaseByPlan(value?: string | null): number {
  return getPaymentPlan(value).montoPorClase;
}

export function normalizeMaterialCoverage(
  value?: string | null,
  includedKit?: boolean | null,
): MaterialCoverage {
  const normalized = String(value || "").toUpperCase().trim();
  if (normalized === "MENSUAL_100") return "MENSUAL_100";
  if (normalized === "MENSUAL_70") return "MENSUAL_100";
  if (normalized === "NINGUNO") return "NINGUNO";
  return includedKit ? "MENSUAL_100" : "NINGUNO";
}

type MaterialCoverageRuleDisplay = {
  coverage: MaterialCoverage;
  color: "default" | "green";
  label: string;
  shortLabel: string;
  description: string;
};

export function getMaterialCoverageRuleDisplay(
  value?: string | null,
  includedKit?: boolean | null,
): MaterialCoverageRuleDisplay {
  const coverage = normalizeMaterialCoverage(value, includedKit);

  if (coverage === "MENSUAL_100") {
    return {
      coverage,
      color: "green",
      label: "Exclusivo de Mensual 100",
      shortLabel: "Plan 100",
      description: "Este material solo se incluye en el plan Mensual 100.",
    };
  }

  return {
    coverage,
    color: "default",
    label: "No incluido",
    shortLabel: "No incluido",
    description: "Este material no está incluido en ningún plan y debes llevarlo por tu cuenta.",
  };
}

type MaterialCoverageDisplayInput = {
  modalidadPago?: string | null;
  porcentajeProductos?: number | null;
  coberturaMaterial?: string | null;
  incluidoKit?: boolean | null;
};

type MaterialCoverageDisplay = {
  coverage: MaterialCoverage;
  status: "included" | "upgrade_required" | "not_included";
  color: "green" | "gold" | "default";
  label: string;
  shortLabel: string;
  description: string;
  isIncluded: boolean;
};

function resolvePlanMaterialRank(modalidadPago?: string | null, porcentajeProductos?: number | null): 0 | 70 | 100 {
  const porcentaje = Number(porcentajeProductos ?? 0);
  if (porcentaje === 100) return 100;
  if (porcentaje >= 70) return 100;

  const modalidad = normalizeModalidadPago(modalidadPago);
  if (modalidad === "MENSUAL_100") return 100;
  return 0;
}

function resolveCoverageRank(coverage: MaterialCoverage): 0 | 70 | 100 {
  if (coverage === "MENSUAL_100") return 100;
  return 0;
}

export function getMaterialCoverageDisplay(
  input: MaterialCoverageDisplayInput,
): MaterialCoverageDisplay {
  const coverage = normalizeMaterialCoverage(input.coberturaMaterial, input.incluidoKit);
  const planRank = resolvePlanMaterialRank(input.modalidadPago, input.porcentajeProductos);
  const coverageRank = resolveCoverageRank(coverage);

  if (coverageRank === 0) {
    return {
      coverage,
      status: "not_included",
      color: "default",
      label: "No incluido",
      shortLabel: "No incluido",
      description: "Este material no está incluido en tu plan. Debes llevarlo por tu cuenta.",
      isIncluded: false,
    };
  }

  if (planRank >= coverageRank) {
    return {
      coverage,
      status: "included",
      color: "green",
      label: "Incluido en tu plan",
      shortLabel: "Incluido",
      description: "Este material está cubierto por tu plan actual.",
      isIncluded: true,
    };
  }

  if (coverage === "MENSUAL_100") {
    return {
      coverage,
      status: "upgrade_required",
      color: "gold",
      label: "Requiere Plan 100",
      shortLabel: "Solo Plan 100",
      description: "Para recibir este material debes tener el plan Mensual 100.",
      isIncluded: false,
    };
  }

  return {
    coverage,
    status: "upgrade_required",
    color: "gold",
    label: "Requiere plan mensual",
    shortLabel: "Plan mensual",
    description: "Este material está incluido en la mensualidad con materiales completos.",
    isIncluded: false,
  };
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function inferMensualModalidadByMonto(montoMensual: number): ModalidadPago | null {
  if (!isFinitePositiveNumber(montoMensual)) return null;
  return "MENSUAL_100";
}

type PaymentPlanDisplayInput = {
  modalidadPago?: string | null;
  valorMensualPlan?: number | null;
  montoPorClase?: number | null;
  porcentajeProductos?: number | null;
};

type PaymentPlanDisplay = {
  modalidad: ModalidadPago;
  color: "orange" | "green";
  label: string;
  detail: string;
  montoMensual: number;
  montoPorClase: number;
};

export function getPaymentPlanDisplay(input: PaymentPlanDisplayInput): PaymentPlanDisplay {
  const modalidadBase = normalizeModalidadPago(input.modalidadPago);

  if (modalidadBase === "POR_CLASE") {
    const plan = PLANES_PAGO.POR_CLASE;
    const montoPorClase = Number(input.montoPorClase ?? plan.montoPorClase ?? 0);
    return {
      modalidad: "POR_CLASE",
      color: "orange",
      label: plan.label,
      detail: `$${montoPorClase.toLocaleString()} c/u`,
      montoMensual: 0,
      montoPorClase,
    };
  }

  const montoMensualRaw = Number(input.valorMensualPlan ?? 0);
  const montoMensual = isFinitePositiveNumber(montoMensualRaw)
    ? montoMensualRaw
    : getPaymentPlan(modalidadBase).montoMensual;

  const porcentaje = Number(input.porcentajeProductos ?? 0);
  let modalidadFinal: ModalidadPago = modalidadBase;

  if (porcentaje >= 70) modalidadFinal = "MENSUAL_100";
  else {
    const modalidadInferida = inferMensualModalidadByMonto(montoMensual);
    if (modalidadInferida && modalidadInferida !== "POR_CLASE") {
      modalidadFinal = modalidadInferida;
    }
  }

  const plan = getPaymentPlan(modalidadFinal);

  return {
    modalidad: modalidadFinal,
    color: "green",
    label: plan.label,
    detail: `$${montoMensual.toLocaleString()}/mes`,
    montoMensual,
    montoPorClase: 0,
  };
}
