import dayjs from "dayjs";

type NumericLike = number | string | null | undefined;

export type PaymentBalanceLike = {
  monto?: NumericLike;
  monto_programado?: NumericLike;
  descuento_aplicado?: NumericLike;
  total_abonado?: NumericLike;
  saldo_pendiente?: NumericLike;
  estado?: string | null;
  fecha_vencimiento?: string | null;
};

const toNumber = (value: NumericLike): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getMontoProgramado = (payment: PaymentBalanceLike): number => {
  const programado = toNumber(payment?.monto_programado);
  if (programado > 0) return programado;

  const saldo = toNumber(payment?.saldo_pendiente);
  const abonado = toNumber(payment?.total_abonado);
  const monto = toNumber(payment?.monto);
  const descuento = toNumber(payment?.descuento_aplicado);
  const inferido = monto + abonado + descuento;
  return inferido > 0 ? inferido : monto;
};

export const getDescuentoAplicado = (payment: PaymentBalanceLike): number => toNumber(payment?.descuento_aplicado);

export const getMontoExigible = (payment: PaymentBalanceLike): number => {
  const exigible = getMontoProgramado(payment) - getDescuentoAplicado(payment);
  return exigible > 0 ? exigible : 0;
};

export const getTotalAbonado = (payment: PaymentBalanceLike): number => {
  const abonado = toNumber(payment?.total_abonado);
  if (abonado > 0) return abonado;

  const estado = String(payment?.estado || "").toLowerCase();
  if (estado === "pagado") {
    return getMontoExigible(payment) || toNumber(payment?.monto);
  }

  return 0;
};

export const getSaldoPendiente = (payment: PaymentBalanceLike): number => {
  const saldo = toNumber(payment?.saldo_pendiente);
  if (saldo > 0) return saldo;

  const estado = String(payment?.estado || "").toLowerCase();
  if (estado === "pagado") return 0;

  const monto = toNumber(payment?.monto);
  if (monto > 0) return monto;

  const inferido = getMontoExigible(payment) - getTotalAbonado(payment);
  return inferido > 0 ? inferido : 0;
};

export const isPartialPayment = (payment: PaymentBalanceLike): boolean => {
  return getTotalAbonado(payment) > 0 && getSaldoPendiente(payment) > 0;
};

export const isPaymentOverdue = (payment: PaymentBalanceLike): boolean => {
  if (String(payment?.estado || "").toLowerCase() === "pagado") return false;
  return Boolean(payment?.fecha_vencimiento && dayjs(payment.fecha_vencimiento).isBefore(dayjs(), "day"));
};

export const getVisiblePaymentStatus = (payment: PaymentBalanceLike): "pagado" | "abono_parcial" | "vencido" | "pendiente" => {
  const estado = String(payment?.estado || "").toLowerCase();
  if (estado === "pagado") return "pagado";
  if (isPartialPayment(payment)) return isPaymentOverdue(payment) ? "vencido" : "abono_parcial";
  if (estado === "vencido" || isPaymentOverdue(payment)) return "vencido";
  return "pendiente";
};