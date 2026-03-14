export type ModalidadPago = "POR_CLASE" | "MENSUAL_70" | "MENSUAL_100";

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
  MENSUAL_70: {
    modalidad: "MENSUAL_70",
    label: "Mensual 70% productos",
    descripcion: "$260.000 mensuales",
    montoMensual: 260000,
    montoPorClase: 0,
    porcentajeProductos: 70,
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

export const MODALIDAD_PAGO_DEFAULT: ModalidadPago = "MENSUAL_70";

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

  if (modalidad === "MENSUAL_100") {
    return {
      montoMensual: Number(
        cfg.precio_mensual_100 ?? cfg.precio_mensualidad ?? fallback.montoMensual ?? 0,
      ),
      montoPorClase: 0,
      porcentajeProductos: 100,
    };
  }

  return {
    montoMensual: Number(
      cfg.precio_mensual_70 ?? cfg.precio_mensualidad ?? fallback.montoMensual ?? 0,
    ),
    montoPorClase: 0,
    porcentajeProductos: 70,
  };
}

export function getMontoMensualByPlan(value?: string | null): number {
  return getPaymentPlan(value).montoMensual;
}

export function getMontoPorClaseByPlan(value?: string | null): number {
  return getPaymentPlan(value).montoPorClase;
}
