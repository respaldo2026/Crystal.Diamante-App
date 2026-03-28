"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Card,
  Row,
  Col,
  Button,
  Form,
  Select,
  Input,
  Table,
  Space,
  Tag,
  Typography,
  Divider,
  Statistic,
  Radio,
  InputNumber,
  Spin,
  Alert,
} from "antd";
import {
  DollarOutlined,
  PrinterOutlined,
  ShoppingCartOutlined,
  CheckCircleOutlined,
  CreditCardOutlined,
  BankOutlined,
  WalletOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { generarTicketPagoBlob, abrirTicketPagoDesdeBlob, imprimirTicketTermicoTM20II } from "@utils/pago-ticket";
import { abrirCajonConQzTray, imprimirTicketConQzTray, verificarQzTrayDisponible } from "@utils/qz-tray";
import { subirTicketPago } from "@utils/ticket-storage";
import { registrarIngresoDesdePago } from "@modules/finanzas/movimientos.service";
import { getDescuentoAplicado, getMontoProgramado, getSaldoPendiente, getTotalAbonado, getVisiblePaymentStatus } from "@utils/payment-balances";

const { Title, Text } = Typography;

type MetodoPago = "efectivo" | "transferencia" | "tarjeta" | "nequi" | "sistecredito" | "qr";

interface Estudiante {
  id: string;
  nombre_completo: string;
  telefono?: string;
  email?: string;
  notif_whatsapp?: boolean | null;
}

interface Matricula {
  id: string;
  curso_nombre: string;
  fecha_inicio?: string | null;
  numero_cuotas?: number | null;
  curso_numero_cuotas?: number | null;
  duracion?: string | number | null;
  programa_duracion?: string | number | null;
  precio_mensualidad?: number | null;
  programa_precio_mensualidad?: number | null;
  valor_mensual_plan?: number | null;
  modalidad_pago?: string | null;
  porcentaje_productos?: number | null;
}

interface Cuota {
  id: string;
  monto: number;
  monto_programado?: number | null;
  descuento_aplicado?: number | null;
  total_abonado?: number | null;
  saldo_pendiente?: number | null;
  motivo_descuento?: string | null;
  numero_cuota: number;
  fecha_vencimiento: string;
  periodo_pagado: string;
  estado: string;
  matricula_id?: string;
  es_virtual?: boolean;
  tipo_cuota?: string | null;
}

type PaymentAdjustmentRpcResult = {
  abono_id: string;
  pago_id: string;
  monto_abono: number;
  descuento_total: number;
  total_abonado: number;
  saldo_pendiente: number;
  monto_programado: number;
  monto_exigible: number;
  estado: string;
  matricula_id: string | null;
  estudiante_id: string | null;
};

const formatCurrency = (value?: number | null) => {
  if (!value) return "$0";
  return `$${Number(value).toLocaleString("es-CO")}`;
};

const parseDuracionMeses = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  const text = String(value ?? "").trim();
  if (!text) return 0;

  const match = text.match(/\d+/);
  return match ? Math.max(0, Number(match[0])) : 0;
};

const calcularFechaVencimientoCuota = (fechaInicio: string | null | undefined, numeroCuota: number) => {
  if (!fechaInicio || !numeroCuota || numeroCuota < 1) return "";
  const base = dayjs(fechaInicio);
  if (!base.isValid()) return "";
  // Cuota 1 vence el mismo día de inicio, cuota 2 un mes después, etc.
  return base.add(numeroCuota - 1, "month").format("YYYY-MM-DD");
};

// Función para generar número de factura secuencial (1000-9999)
const generarNumeroFactura = (): string => {
  const min = 1000;
  const max = 9999;
  const numero = Math.floor(Math.random() * (max - min + 1)) + min;
  return numero.toString();
};

const metodoPagoIcons: Record<MetodoPago, React.ReactNode> = {
  efectivo: <DollarOutlined />,
  transferencia: <BankOutlined />,
  tarjeta: <CreditCardOutlined />,
  nequi: <QrcodeOutlined />,
  sistecredito: <QrcodeOutlined />,
  qr: <QrcodeOutlined />,
};

const metodoPagoLabels: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  nequi: "Nequi",
  sistecredito: "Sistecredito",
  qr: "Código QR",
};

export default function CajaPage() {
  const { message: messageApi } = App.useApp();
  const [form] = Form.useForm();
  const montoARegistrar = Form.useWatch("monto_a_registrar", form);
  const descuentoAplicado = Form.useWatch("descuento_aplicado", form);

  const [loading, setLoading] = useState(false);
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([]);
  const [estudianteSeleccionado, setEstudianteSeleccionado] = useState<Estudiante | null>(null);
  const [matriculas, setMatriculas] = useState<Matricula[]>([]);
  const [cuotas, setCuotas] = useState<Cuota[]>([]);
  const [cuotasSeleccionadas, setCuotasSeleccionadas] = useState<string[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [configuracion, setConfiguracion] = useState<any>(null);
  const [valorEntregado, setValorEntregado] = useState<number | null>(null);
  const [mediosPago, setMediosPago] = useState<any[]>([]);
  const [qzTrayDisponible, setQzTrayDisponible] = useState(false);

  const totalAPagar = useMemo(
    () => {
      if (cuotasSeleccionadas.length === 1) {
        return Number(montoARegistrar || 0);
      }

      return cuotas
        .filter((c) => cuotasSeleccionadas.includes(c.id))
        .reduce((acc, c) => acc + getSaldoPendiente(c), 0);
    },
    [cuotas, cuotasSeleccionadas, montoARegistrar]
  );

  const cambio = useMemo(() => {
    if (!valorEntregado || valorEntregado < totalAPagar) return 0;
    return valorEntregado - totalAPagar;
  }, [valorEntregado, totalAPagar]);

  const cargarEstudiantes = useCallback(async () => {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("perfiles")
        .select("id, nombre_completo, telefono, email, notif_whatsapp")
        .eq("rol", "estudiante")
        .eq("activo", true)
        .order("nombre_completo");

      if (error) throw error;
      setEstudiantes(data || []);
    } catch (error) {
      console.error("Error cargando estudiantes:", error);
      messageApi.error("No se pudieron cargar los estudiantes");
    }
  }, [messageApi]);

  const cargarConfiguracion = useCallback(async () => {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("configuracion")
        .select("*")
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setConfiguracion(data);
      }
    } catch (error) {
      console.error("Error cargando configuración:", error);
    }
  }, []);

  const cargarMediosPago = useCallback(async () => {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("medios_pago")
        .select("*")
        .eq("activo", true)
        .order("orden", { ascending: true });

      if (!error && data) {
        setMediosPago(data);
      }
    } catch (error) {
      console.error("Error cargando métodos de pago:", error);
    }
  }, []);

  useEffect(() => {
    cargarEstudiantes();
    cargarConfiguracion();
    cargarMediosPago();
  }, [cargarEstudiantes, cargarConfiguracion, cargarMediosPago]);

  useEffect(() => {
    let activo = true;

    const validarQzTray = async () => {
      const disponible = await verificarQzTrayDisponible();
      if (activo) {
        setQzTrayDisponible(disponible);
      }
    };

    void validarQzTray();

    return () => {
      activo = false;
    };
  }, []);

  // Generar número de factura cuando se selecciona una cuota
  useEffect(() => {
    if (cuotasSeleccionadas.length > 0) {
      const numeroFactura = generarNumeroFactura();
      form.setFieldsValue({ referencia: `FAC-${numeroFactura}` });
    }
  }, [cuotasSeleccionadas, form]);

  useEffect(() => {
    if (cuotasSeleccionadas.length !== 1) {
      form.setFieldsValue({
        monto_a_registrar: undefined,
        descuento_aplicado: 0,
        motivo_descuento: undefined,
      });
      return;
    }

    const cuota = cuotas.find((item) => item.id === cuotasSeleccionadas[0]);
    if (!cuota) return;

    form.setFieldsValue({
      monto_a_registrar: getSaldoPendiente(cuota),
      descuento_aplicado: 0,
      motivo_descuento: undefined,
    });
  }, [cuotas, cuotasSeleccionadas, form]);

  useEffect(() => {
    if (cuotasSeleccionadas.length !== 1) return;

    const cuota = cuotas.find((item) => item.id === cuotasSeleccionadas[0]);
    if (!cuota) return;

    const saldo = getSaldoPendiente(cuota);
    const descuento = Number(descuentoAplicado || 0);
    const maxAbonoPermitido = Math.max(saldo - descuento, 0);
    const montoActual = Number(form.getFieldValue("monto_a_registrar") || 0);

    if (!Number.isFinite(montoActual) || montoActual > maxAbonoPermitido) {
      form.setFieldValue("monto_a_registrar", maxAbonoPermitido);
    }
  }, [cuotas, cuotasSeleccionadas, descuentoAplicado, form]);

  const handleEstudianteChange = useCallback(
    async (estudianteId: string) => {
      setLoading(true);
      try {
        const estudiante = estudiantes.find((e) => e.id === estudianteId);
        setEstudianteSeleccionado(estudiante || null);

        // Cargar matrículas del estudiante
        const { data: matriculasData, error: matriculasError } = await supabaseBrowserClient
          .from("matriculas")
          .select("id, fecha_inicio, valor_mensual_plan, modalidad_pago, porcentaje_productos, cursos ( nombre, numero_cuotas, duracion, precio_mensualidad, programas ( duracion, precio_mensualidad ) )")
          .eq("estudiante_id", estudianteId)
          .eq("estado", "activo");

        if (matriculasError) throw matriculasError;

        const matriculasFormat = (matriculasData || []).map((m: any) => ({
          id: m.id,
          curso_nombre: m.cursos?.nombre || "Sin nombre",
          fecha_inicio: m.fecha_inicio || null,
          curso_numero_cuotas: m.cursos?.numero_cuotas ?? null,
          duracion: m.cursos?.duracion ?? null,
          programa_duracion: m.cursos?.programas?.duracion ?? null,
          precio_mensualidad: m.cursos?.precio_mensualidad ?? null,
          programa_precio_mensualidad: m.cursos?.programas?.precio_mensualidad ?? null,
          valor_mensual_plan: m.valor_mensual_plan ?? null,
          modalidad_pago: m.modalidad_pago ?? null,
          porcentaje_productos: m.porcentaje_productos ?? null,
        }));

        setMatriculas(matriculasFormat);

        // Cargar cuotas pendientes
        const matriculaIds = matriculasFormat.map((m) => m.id);
        if (matriculaIds.length > 0) {
          const { data: planCuotasData, error: planCuotasError } = await supabaseBrowserClient
            .from("pagos")
            .select("matricula_id, numero_cuota")
            .in("matricula_id", matriculaIds);

          if (planCuotasError) throw planCuotasError;

          const resumenPlanPorMatricula = new Map<string, { maxNumero: number; tieneInscripcion: boolean }>();
          const cuotasRegistradasPorMatricula = new Map<string, Set<number>>();
          (planCuotasData || []).forEach((row: any) => {
            const matriculaId = String(row?.matricula_id || "");
            if (!matriculaId) return;

            const numero = Number(row?.numero_cuota);
            if (!Number.isFinite(numero)) return;

            const actual = resumenPlanPorMatricula.get(matriculaId) || { maxNumero: 0, tieneInscripcion: false };
            actual.maxNumero = Math.max(actual.maxNumero, numero);
            if (numero === 0) actual.tieneInscripcion = true;
            resumenPlanPorMatricula.set(matriculaId, actual);

            if (numero > 0) {
              const existentes = cuotasRegistradasPorMatricula.get(matriculaId) || new Set<number>();
              existentes.add(numero);
              cuotasRegistradasPorMatricula.set(matriculaId, existentes);
            }
          });

          const totalCuotasEsperadasPorMatricula = new Map<string, number>();
          matriculasFormat.forEach((m) => {
            const totalEsperado =
              parseDuracionMeses(m.programa_duracion) ||
              parseDuracionMeses(m.duracion) ||
              parseDuracionMeses(m.curso_numero_cuotas);

            if (totalEsperado > 0) {
              totalCuotasEsperadasPorMatricula.set(m.id, totalEsperado);
            }
          });

          const { data: cuotasData, error: cuotasError } = await supabaseBrowserClient
            .from("pagos")
            .select("id, monto, monto_programado, descuento_aplicado, total_abonado, saldo_pendiente, motivo_descuento, numero_cuota, fecha_vencimiento, periodo_pagado, estado, matricula_id, tipo_cuota")
            .in("matricula_id", matriculaIds)
            .order("fecha_vencimiento");

          if (cuotasError) throw cuotasError;

          const cuotasPagadasPorMatricula = new Map<string, Set<number>>();
          (cuotasData || []).forEach((cuota: any) => {
            const matriculaId = String(cuota?.matricula_id || "");
            const numero = Number(cuota?.numero_cuota);
            if (!matriculaId || !Number.isFinite(numero) || numero <= 0) return;

            const existentes = cuotasRegistradasPorMatricula.get(matriculaId) || new Set<number>();
            existentes.add(numero);
            cuotasRegistradasPorMatricula.set(matriculaId, existentes);

            const estadoNormalizado = String(cuota?.estado || "").trim().toLowerCase();
            if (estadoNormalizado === "pagado") {
              const actuales = cuotasPagadasPorMatricula.get(matriculaId) || new Set<number>();
              actuales.add(numero);
              cuotasPagadasPorMatricula.set(matriculaId, actuales);
            }
          });

          const cuotasFiltradas = (cuotasData || []).filter((cuota: any) => {
            const estadoNormalizado = String(cuota?.estado || "").trim().toLowerCase();
            return estadoNormalizado !== "cancelado";
          });

          const cuotasNormalizadas = cuotasFiltradas.map((cuota: any) => {
            const matriculaId = String(cuota?.matricula_id || "");
            const resumen = resumenPlanPorMatricula.get(matriculaId);
            const numero = Number(cuota?.numero_cuota);

            if (!resumen || !Number.isFinite(numero) || numero <= 0) {
              return cuota;
            }

            const totalCalculado = resumen.tieneInscripcion
              ? Math.max(1, resumen.maxNumero + 1)
              : Math.max(1, resumen.maxNumero);

            const totalEsperado = totalCuotasEsperadasPorMatricula.get(matriculaId) || 0;
            const total = Math.max(totalCalculado, totalEsperado, numero);

            const periodoActual = String(cuota?.periodo_pagado || "");
            const pareceEtiquetaCuota = /cuota/i.test(periodoActual) || !periodoActual;

            if (!pareceEtiquetaCuota) {
              return cuota;
            }

            return {
              ...cuota,
              periodo_pagado: `Cuota ${numero} de ${total}`,
            };
          });

          const cuotasNormalizadasDedupe = new Map<string, Cuota>();
          cuotasNormalizadas.forEach((cuota) => {
            const matriculaId = String(cuota?.matricula_id || "");
            const numero = Number(cuota?.numero_cuota || 0);
            const key = `${matriculaId}:${numero}`;
            const actual = cuotasNormalizadasDedupe.get(key);
            if (!actual) {
              cuotasNormalizadasDedupe.set(key, cuota);
              return;
            }

            const estadoActual = String(actual?.estado || "").trim().toLowerCase();
            const estadoNuevo = String(cuota?.estado || "").trim().toLowerCase();
            if (estadoActual === "pagado") {
              return;
            }

            if (estadoNuevo === "pagado") {
              cuotasNormalizadasDedupe.set(key, cuota);
              return;
            }

            if (estadoActual !== "vencido" && estadoNuevo === "vencido") {
              cuotasNormalizadasDedupe.set(key, cuota);
            }
          });

          const cuotasNormalizadasFinal = Array.from(cuotasNormalizadasDedupe.values());

          const cuotasPendientesRegistradas = new Map<string, Set<number>>();
          cuotasNormalizadasFinal.forEach((cuota) => {
            const matriculaId = String(cuota?.matricula_id || "");
            const numero = Number(cuota?.numero_cuota);
            if (!matriculaId || !Number.isFinite(numero) || numero <= 0) return;
            const existentes = cuotasPendientesRegistradas.get(matriculaId) || new Set<number>();
            existentes.add(numero);
            cuotasPendientesRegistradas.set(matriculaId, existentes);
          });

          const cuotasVirtuales: Cuota[] = [];
          matriculasFormat.forEach((matricula) => {
            const totalEsperado = totalCuotasEsperadasPorMatricula.get(matricula.id) || 0;
            if (totalEsperado <= 0) return;

            const cuotasRegistradas = cuotasRegistradasPorMatricula.get(matricula.id) || new Set<number>();
            const cuotasPendientesSet = cuotasPendientesRegistradas.get(matricula.id) || new Set<number>();
            const montoBase =
              Number(matricula.valor_mensual_plan || 0) ||
              Number(matricula.precio_mensualidad || 0) ||
              Number(matricula.programa_precio_mensualidad || 0) ||
              Number(
                cuotasNormalizadasFinal.find((q) => q.matricula_id === matricula.id && Number(q.numero_cuota) > 0)?.monto || 0
              );

            for (let i = 1; i <= totalEsperado; i += 1) {
              if (cuotasRegistradas.has(i) || cuotasPendientesSet.has(i)) continue;

              cuotasVirtuales.push({
                id: `virtual-${matricula.id}-${i}`,
                monto: montoBase,
                monto_programado: montoBase,
                descuento_aplicado: 0,
                total_abonado: 0,
                saldo_pendiente: montoBase,
                motivo_descuento: null,
                numero_cuota: i,
                fecha_vencimiento: calcularFechaVencimientoCuota(matricula.fecha_inicio, i),
                periodo_pagado: `Cuota ${i} de ${totalEsperado}`,
                estado: "pendiente",
                matricula_id: matricula.id,
                es_virtual: true,
              });
            }
          });

          const cuotasConVirtuales = [...cuotasNormalizadasFinal, ...cuotasVirtuales].sort((a, b) => {
            const fechaA = a.fecha_vencimiento ? dayjs(a.fecha_vencimiento) : null;
            const fechaB = b.fecha_vencimiento ? dayjs(b.fecha_vencimiento) : null;

            if (fechaA && fechaB && !fechaA.isSame(fechaB, "day")) {
              return fechaA.valueOf() - fechaB.valueOf();
            }
            if (fechaA && !fechaB) return -1;
            if (!fechaA && fechaB) return 1;

            return Number(a.numero_cuota || 0) - Number(b.numero_cuota || 0);
          });

          const cuotasDedupe = new Map<string, Cuota>();
          cuotasConVirtuales.forEach((cuota) => {
            const matriculaId = String(cuota?.matricula_id || "");
            const numero = Number(cuota?.numero_cuota || 0);
            const key = `${matriculaId}:${numero}`;
            const actual = cuotasDedupe.get(key);

            if (!actual) {
              cuotasDedupe.set(key, cuota);
              return;
            }

            const estadoActual = String(actual?.estado || "").trim().toLowerCase();
            const estadoNuevo = String(cuota?.estado || "").trim().toLowerCase();

            if (estadoActual === "pagado") {
              return;
            }

            if (estadoNuevo === "pagado") {
              cuotasDedupe.set(key, cuota);
              return;
            }

            if (actual.es_virtual && !cuota.es_virtual) {
              cuotasDedupe.set(key, cuota);
            }
          });

          setCuotas(Array.from(cuotasDedupe.values()));
        } else {
          setCuotas([]);
        }

        setCuotasSeleccionadas([]);
        form.setFieldsValue({ matricula_id: undefined });
      } catch (error) {
        console.error("Error cargando datos del estudiante:", error);
        messageApi.error("Error al cargar datos del estudiante");
      } finally {
        setLoading(false);
      }
    },
    [estudiantes, form, messageApi]
  );

  const handleRegistrarPago = useCallback(async () => {
    if (cuotasSeleccionadas.length === 0) {
      messageApi.warning("Debe seleccionar al menos una cuota");
      return;
    }

    try {
      await form.validateFields();
    } catch {
      messageApi.warning("Complete todos los campos requeridos");
      return;
    }

    const values = form.getFieldsValue();
    
    // Validar que metodo_pago esté definido
    if (!values.metodo_pago) {
      messageApi.warning("Seleccione un método de pago");
      return;
    }

    setProcesando(true);

    try {
      const cuotasAPagar = cuotas.filter((c) => cuotasSeleccionadas.includes(c.id));
      const pagosActualizados = [];
      const metodoPago = values.metodo_pago as MetodoPago;
      const referenciaPago = values.referencia || `FAC-${generarNumeroFactura()}`;
      const montoAbono = Number(values.monto_a_registrar || 0);
      const descuento = Number(values.descuento_aplicado || 0);
      const motivoDescuento = String(values.motivo_descuento || "").trim() || null;

      if (cuotasAPagar.length === 1) {
        const cuota = cuotasAPagar[0];
        if (!cuota) {
          messageApi.warning("No se encontró la cuota seleccionada");
          return;
        }
        const saldoActual = getSaldoPendiente(cuota);

        if ((Number.isNaN(montoAbono) || montoAbono < 0) || (Number.isNaN(descuento) || descuento < 0)) {
          messageApi.warning("El abono y el descuento deben ser valores válidos");
          return;
        }

        if (montoAbono <= 0 && descuento <= 0) {
          messageApi.warning("Debe registrar un abono o un descuento mayor a 0");
          return;
        }

        const maxAbonoPermitido = Math.max(saldoActual - descuento, 0);
        if (montoAbono > maxAbonoPermitido) {
          messageApi.warning("El abono no puede superar el saldo disponible después del descuento");
          return;
        }

        if (descuento > 0 && !motivoDescuento) {
          messageApi.warning("Indique el motivo del descuento");
          return;
        }

        let pagoBaseId = cuota.id;

        if (cuota.es_virtual) {
          const { data: pagoCreado, error: errorCrearPago } = await supabaseBrowserClient
            .from("pagos")
            .insert({
              estado: "pendiente",
              matricula_id: cuota.matricula_id || null,
              estudiante_id: estudianteSeleccionado?.id || null,
              monto: Number(cuota.monto || 0),
              monto_programado: Number(cuota.monto_programado || cuota.monto || 0),
              descuento_aplicado: 0,
              total_abonado: 0,
              saldo_pendiente: Number(cuota.monto || 0),
              numero_cuota: Number(cuota.numero_cuota || 0),
              fecha_vencimiento: cuota.fecha_vencimiento || null,
              periodo_pagado: cuota.periodo_pagado || `Cuota ${cuota.numero_cuota ?? ""}`.trim(),
              tipo_cuota: cuota.tipo_cuota || "mensual",
            })
            .select("id")
            .single();

          if (errorCrearPago) throw errorCrearPago;
          pagoBaseId = pagoCreado.id;
        }

        const { data: ajusteData, error: ajusteError } = await supabaseBrowserClient.rpc("registrar_abono_pago", {
          p_pago_id: pagoBaseId,
          p_monto_abono: montoAbono,
          p_descuento_aplicado: descuento,
          p_metodo_pago: metodoPago,
          p_referencia: referenciaPago,
          p_observaciones: values.observaciones || null,
          p_motivo_descuento: motivoDescuento,
          p_fecha_pago: dayjs().toISOString(),
          p_created_by: null,
        });

        if (ajusteError) throw ajusteError;

        const ajuste = (Array.isArray(ajusteData) ? ajusteData[0] : ajusteData) as PaymentAdjustmentRpcResult | null;
        if (!ajuste) {
          throw new Error("No se pudo confirmar el abono en caja");
        }

        const matriculaCuota = matriculas.find((m) => String(m.id) === String(cuota.matricula_id));
        const conceptoTicket = ajuste.saldo_pendiente > 0
          ? `Abono a ${cuota.periodo_pagado || `Cuota ${cuota.numero_cuota}`}`
          : `${cuota.periodo_pagado || `Cuota ${cuota.numero_cuota}`}`;
        const detalleOperacion = [
          descuento > 0 ? `Descuento aplicado: ${formatCurrency(descuento)}` : null,
          ajuste.saldo_pendiente > 0 ? `Saldo pendiente: ${formatCurrency(ajuste.saldo_pendiente)}` : "Cuota saldada",
        ].filter(Boolean).join(" · ");

        const { data: configActual } = await supabaseBrowserClient
          .from("configuracion")
          .select("*")
          .order("updated_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();

        const configTicket = configActual || configuracion;

        if (montoAbono > 0) {
          const printerName = String(configTicket?.impresora_pos || configTicket?.impresora_termica || "EPSON TM-T20II");
          const ticketData = {
            academia: {
              nombre: configTicket?.nombre_academia || "Academia Crystal Diamante",
              ruc: configTicket?.ruc || undefined,
              logoUrl: configTicket?.logo_url || undefined,
              telefono: configTicket?.telefono || "",
              direccion: configTicket?.direccion || "",
              email: configTicket?.email || "",
              ticketTitulo: configTicket?.ticket_titulo || "RECIBO DE PAGO",
              ticketNota: detalleOperacion || configTicket?.ticket_nota || "",
              ticketPie: configTicket?.ticket_pie || "Gracias por su pago",
              ticketCampos: configTicket?.ticket_campos || undefined,
            },
            estudiante: {
              nombre: estudianteSeleccionado?.nombre_completo || "",
              telefono: estudianteSeleccionado?.telefono || "",
            },
            pago: {
              monto: montoAbono,
              metodo: metodoPagoLabels[metodoPago],
              fecha: dayjs().format("DD/MM/YYYY HH:mm"),
              referencia: referenciaPago,
              concepto: `${conceptoTicket} - ${matriculaCuota?.curso_nombre || "Curso"}`,
              numeroCuota: cuota.numero_cuota,
              periodo: detalleOperacion || cuota.periodo_pagado,
              valorEntregado: valorEntregado || undefined,
              cambio: cambio || undefined,
            },
          };

          const impresoPorQz = await imprimirTicketConQzTray(ticketData, printerName);

          if (!impresoPorQz) {
            const placeholder = window.open("", "_blank");
            if (placeholder) {
              await imprimirTicketTermicoTM20II(ticketData, placeholder);
            } else {
              await imprimirTicketTermicoTM20II(ticketData);
            }
          }

          const blob = await generarTicketPagoBlob(ticketData);

          if (metodoPago === "efectivo") {
            const cajonAbiertoPorQz = await abrirCajonConQzTray(printerName);
            if (!cajonAbiertoPorQz) {
              abrirCajonRegistrador();
            }
          }

          try {
            const { publicUrl } = await subirTicketPago({
              blob,
              pagoId: ajuste.pago_id,
              estudianteId: estudianteSeleccionado?.id,
            });

            await supabaseBrowserClient
              .from("pagos_abonos")
              .update({ ticket_url: publicUrl } as any)
              .eq("id", ajuste.abono_id);

            if (ajuste.saldo_pendiente === 0) {
              await supabaseBrowserClient
                .from("pagos")
                .update({ ticket_url: publicUrl } as any)
                .eq("id", ajuste.pago_id);
            }

            await registrarIngresoDesdePago({
              fecha: dayjs().format("YYYY-MM-DD"),
              monto: montoAbono,
              concepto: `${conceptoTicket} - ${matriculaCuota?.curso_nombre || "Curso"}`,
              categoria: "inscripciones",
              metodo_pago: metodoPago,
              referencia: referenciaPago,
              descripcion: detalleOperacion || values.observaciones || null,
              estudiante_id: estudianteSeleccionado?.id || null,
              ticket_url: publicUrl,
              pago_id: ajuste.pago_id,
              pago_abono_id: ajuste.abono_id,
              created_by: null,
            });
          } catch (ticketError) {
            console.error("Error generando ticket de abono en caja:", ticketError);
          }
        }

        if (estudianteSeleccionado?.telefono && (estudianteSeleccionado?.notif_whatsapp ?? true) && montoAbono > 0) {
          try {
            const { enviarConfirmacionPago } = await import("@/services/whatsapp-messages-module");

            await enviarConfirmacionPago(estudianteSeleccionado.id, {
              nombre: estudianteSeleccionado.nombre_completo,
              telefono: estudianteSeleccionado.telefono,
              referenciaPago,
              monto: montoAbono,
              fechaPago: dayjs().format("DD/MM/YYYY"),
              concepto: conceptoTicket,
              nombreCurso: matriculaCuota?.curso_nombre || "Curso",
              fechaVigencia: dayjs().add(1, "month").format("DD/MM/YYYY"),
              fechaProximaClase: "Por confirmar",
            });
          } catch (whatsappError) {
            console.error("Error enviando confirmación de pago por WhatsApp desde Caja:", whatsappError);
          }
        }

        if (ajuste.saldo_pendiente === 0) {
          messageApi.success("Pago registrado y cuota saldada correctamente");
        } else if (montoAbono > 0) {
          messageApi.success(`Abono registrado. Saldo pendiente: ${formatCurrency(ajuste.saldo_pendiente)}`);
        } else {
          messageApi.success(`Descuento aplicado. Nuevo saldo: ${formatCurrency(ajuste.saldo_pendiente)}`);
        }

        form.resetFields();
        setCuotasSeleccionadas([]);
        setEstudianteSeleccionado(null);
        setMatriculas([]);
        setCuotas([]);
        setValorEntregado(null);
        return;
      }

      // Actualizar cada cuota seleccionada
      for (const cuota of cuotasAPagar) {
        const payloadPago = {
          estado: "pagado",
          metodo_pago: (values.metodo_pago as string).toLowerCase(),
          fecha_pago: dayjs().toISOString(),
          referencia: referenciaPago,
          estudiante_id: estudianteSeleccionado?.id || null,
          observaciones: values.observaciones || null,
        };

        const { data: pagoActualizado, error: updateError } = cuota.es_virtual
          ? await supabaseBrowserClient
              .from("pagos")
              .insert({
                ...payloadPago,
                matricula_id: cuota.matricula_id || null,
                monto: getSaldoPendiente(cuota),
                monto_programado: Number(cuota.monto_programado || cuota.monto || 0),
                descuento_aplicado: Number(cuota.descuento_aplicado || 0),
                total_abonado: getSaldoPendiente(cuota),
                saldo_pendiente: 0,
                numero_cuota: Number(cuota.numero_cuota || 0),
                fecha_vencimiento: cuota.fecha_vencimiento || null,
                periodo_pagado: cuota.periodo_pagado || `Cuota ${cuota.numero_cuota ?? ""}`.trim(),
              })
              .select()
              .single()
          : await supabaseBrowserClient
              .from("pagos")
              .update(payloadPago)
              .eq("id", cuota.id)
              .select()
              .single();

        if (updateError) throw updateError;
        pagosActualizados.push(pagoActualizado);

        // Registrar movimiento financiero
        try {
          await registrarIngresoDesdePago({
            fecha: dayjs().format("YYYY-MM-DD"),
            monto: pagoActualizado.monto,
            concepto: `Pago de ${cuota.periodo_pagado || `cuota ${cuota.numero_cuota}`}`,
            categoria: "inscripciones",
            metodo_pago: pagoActualizado.metodo_pago,
            referencia: pagoActualizado.referencia,
            descripcion: pagoActualizado.observaciones,
            estudiante_id: pagoActualizado.estudiante_id,
            ticket_url: null,
            pago_id: pagoActualizado.id,
            created_by: null,
          });
        } catch (movError) {
          console.error("Error registrando movimiento financiero:", movError);
        }
      }

      // Generar ticket
      const { data: configActual } = await supabaseBrowserClient
        .from("configuracion")
        .select("*")
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      const configTicket = configActual || configuracion;

      const ticketData = {
        academia: {
          nombre: configTicket?.nombre_academia || "Academia Crystal Diamante",
          ruc: configTicket?.ruc || undefined,
          logoUrl: configTicket?.logo_url || undefined,
          telefono: configTicket?.telefono || "",
          direccion: configTicket?.direccion || "",
          email: configTicket?.email || "",
          ticketTitulo: configTicket?.ticket_titulo || "RECIBO DE PAGO",
          ticketNota: configTicket?.ticket_nota || "",
          ticketPie: configTicket?.ticket_pie || "Gracias por su pago",
          ticketCampos: configTicket?.ticket_campos || undefined,
        },
        estudiante: {
          nombre: estudianteSeleccionado?.nombre_completo || "",
          telefono: estudianteSeleccionado?.telefono || "",
        },
        pago: {
          monto: totalAPagar,
          metodo: metodoPagoLabels[metodoPago],
          fecha: dayjs().format("DD/MM/YYYY HH:mm"),
          referencia: referenciaPago,
          concepto: cuotasAPagar.map((c) => c.periodo_pagado || `Cuota ${c.numero_cuota ?? ""}`.trim()).join(", "),
          numeroCuota: cuotasAPagar.length === 1 ? cuotasAPagar[0]?.numero_cuota : undefined,
          periodo: cuotasAPagar.map((c) => c.periodo_pagado).join(", "),
          valorEntregado: valorEntregado || undefined,
          cambio: cambio || undefined,
        },
      };

      const printerName = String(configTicket?.impresora_pos || configTicket?.impresora_termica || "EPSON TM-T20II");
      const impresoPorQz = await imprimirTicketConQzTray(ticketData, printerName);

      if (!impresoPorQz) {
        const placeholder = window.open("", "_blank");

        if (placeholder) {
          await imprimirTicketTermicoTM20II(ticketData, placeholder);
        } else {
          await imprimirTicketTermicoTM20II(ticketData);
        }
      }

      const blob = await generarTicketPagoBlob(ticketData);

      if (metodoPago === "efectivo") {
        const cajonAbiertoPorQz = await abrirCajonConQzTray(printerName);
        if (!cajonAbiertoPorQz) {
          abrirCajonRegistrador();
        }
      }

      // Subir ticket a storage y asociarlo a todos los pagos del lote
      if (pagosActualizados.length > 0) {
        try {
          const { publicUrl } = await subirTicketPago({
            blob,
            pagoId: pagosActualizados[0].id,
            estudianteId: estudianteSeleccionado?.id,
          });

          const pagoIds = pagosActualizados.map((p) => p.id);

          // Actualizar URL del ticket en todos los pagos del lote
          await supabaseBrowserClient
            .from("pagos")
            .update({ ticket_url: publicUrl })
            .in("id", pagoIds);

          // Actualizar URL del ticket en movimientos financieros asociados
          await supabaseBrowserClient
            .from("movimientos_financieros")
            .update({ ticket_url: publicUrl })
            .in("pago_id", pagoIds);
        } catch (storageError) {
          console.error("Error guardando ticket:", storageError);
        }
      }

      if (estudianteSeleccionado?.telefono && (estudianteSeleccionado?.notif_whatsapp ?? true)) {
        try {
          const { enviarConfirmacionPago } = await import("@/services/whatsapp-messages-module");

          const cursosPago = cuotasAPagar
            .map((cuota) => matriculas.find((m) => String(m.id) === String((cuota as any).matricula_id))?.curso_nombre)
            .filter(Boolean) as string[];
          const cursosUnicos = Array.from(new Set(cursosPago));

          const nombreCursoWhatsapp =
            cursosUnicos.length === 0
              ? "Curso"
              : cursosUnicos.length === 1
              ? (cursosUnicos[0] ?? "Curso")
              : "Varios cursos";

          const conceptoPago = cuotasAPagar
            .map((cuota) => cuota.periodo_pagado || `Cuota ${cuota.numero_cuota ?? ""}`.trim())
            .filter(Boolean)
            .join(", ");

          await enviarConfirmacionPago(estudianteSeleccionado.id, {
            nombre: estudianteSeleccionado.nombre_completo,
            telefono: estudianteSeleccionado.telefono,
            referenciaPago,
            monto: totalAPagar,
            fechaPago: dayjs().format("DD/MM/YYYY"),
            concepto: conceptoPago,
            nombreCurso: nombreCursoWhatsapp,
            fechaVigencia: dayjs().add(1, "month").format("DD/MM/YYYY"),
            fechaProximaClase: "Por confirmar",
          });
        } catch (whatsappError) {
          console.error("Error enviando confirmación de pago por WhatsApp desde Caja:", whatsappError);
        }
      }

      messageApi.success(`Pago registrado exitosamente. Total: ${formatCurrency(totalAPagar)}`);
      
      // Limpiar formulario y recargar datos
      form.resetFields();
      setCuotasSeleccionadas([]);
      setEstudianteSeleccionado(null);
      setMatriculas([]);
      setCuotas([]);
      setValorEntregado(null);
      
    } catch (error) {
      console.error("Error registrando pago:", error);
      messageApi.error("Error al registrar el pago");
    } finally {
      setProcesando(false);
    }
  }, [
    cuotasSeleccionadas,
    cuotas,
    form,
    messageApi,
    estudianteSeleccionado,
    totalAPagar,
    configuracion,
    matriculas,
    valorEntregado,
    cambio,
  ]);

  const abrirCajonRegistrador = () => {
    try {
      // Comando ESC/POS para abrir cajón: ESC p m t1 t2
      // ESC = 27, p = 112, m = 0 (pin 2), t1 = 50 (tiempo on en ms), t2 = 50 (tiempo off en ms)
      const comando = String.fromCharCode(27, 112, 0, 50, 50);
      
      // Crear un iframe oculto para enviar el comando a la impresora
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      document.body.appendChild(iframe);
      
      const iframeDoc = iframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(`<pre>${comando}</pre>`);
        iframeDoc.close();
        
        setTimeout(() => {
          iframe.contentWindow?.print();
          setTimeout(() => document.body.removeChild(iframe), 1000);
        }, 100);
      }
      
      console.log("Comando de apertura de cajón enviado");
    } catch (error) {
      console.error("Error abriendo cajón registrador:", error);
    }
  };

  const cuotasColumns = [
    {
      title: "Tipo",
      dataIndex: "tipo_cuota",
      key: "tipo_cuota",
      width: 110,
      render: (tipo: string | null, record: Cuota) => {
        const t = tipo || (record.es_virtual ? "mensual" : "mensual");
        if (t === "por_clase") return <Tag color="orange">Por Clase</Tag>;
        if (t === "inscripcion") return <Tag color="purple">Inscripción</Tag>;
        return <Tag color="blue">Mensual</Tag>;
      },
    },
    {
      title: "Cuota / Clase",
      dataIndex: "numero_cuota",
      key: "numero_cuota",
      render: (val: number, record: Cuota) => {
        if (record.tipo_cuota === "por_clase") {
          return <Text strong style={{ color: "#d46b08" }}>{`Clase #${val}`}</Text>;
        }
        return `#${val}`;
      },
    },
    {
      title: "Período / Descripción",
      dataIndex: "periodo_pagado",
      key: "periodo_pagado",
    },
    {
      title: "Monto",
      dataIndex: "monto",
      key: "monto",
      render: (_: number, record: Cuota) => formatCurrency(getSaldoPendiente(record)),
    },
    {
      title: "Vencimiento",
      dataIndex: "fecha_vencimiento",
      key: "fecha_vencimiento",
      render: (val: string) => (val ? dayjs(val).format("DD/MM/YYYY") : "-"),
    },
    {
      title: "Estado",
      dataIndex: "estado",
      key: "estado",
      render: (_estado: string, record: Cuota) => {
        const visibleStatus = getVisiblePaymentStatus(record);
        const esVencido = visibleStatus === "vencido";
        const esPagado = visibleStatus === "pagado";
        const esAbonoParcial = visibleStatus === "abono_parcial";

        return (
          <Tag color={esPagado ? "green" : esVencido ? "red" : esAbonoParcial ? "gold" : "orange"}>
            {esPagado ? "Pagado" : esVencido ? "Vencido" : esAbonoParcial ? "Abono parcial" : "Pendiente"}
          </Tag>
        );
      },
    },
  ];

  const rowSelection = {
    selectedRowKeys: cuotasSeleccionadas,
    onChange: (selectedKeys: React.Key[]) => {
      setCuotasSeleccionadas(selectedKeys as string[]);
    },
    getCheckboxProps: (record: Cuota) => {
      const estadoNormalizado = String(record?.estado || "").trim().toLowerCase();
      return {
        disabled: estadoNormalizado === "pagado" || estadoNormalizado === "cancelado",
      };
    },
  };

  return (
    <div style={{ padding: "24px", maxWidth: 1400, margin: "0 auto" }}>
      <Card
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          marginBottom: 24,
          border: "none",
        }}
      >
        <Space align="center" size="large">
          <ShoppingCartOutlined style={{ fontSize: 48, color: "#fff" }} />
          <div>
            <Title level={2} style={{ color: "#fff", margin: 0 }}>
              Caja - Punto de Venta
            </Title>
            <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 16 }}>
              Registro de pagos de estudiantes
            </Text>
          </div>
        </Space>
      </Card>

      <Row gutter={24}>
        <Col xs={24} lg={14}>
          <Card title="Información del Estudiante" style={{ marginBottom: 24 }}>
            <Form form={form} layout="vertical">
              <Form.Item
                name="estudiante_id"
                label="Estudiante"
                rules={[{ required: true, message: "Seleccione un estudiante" }]}
              >
                <Select
                  showSearch
                  placeholder="Buscar estudiante..."
                  optionFilterProp="children"
                  filterOption={(input, option) =>
                    (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
                  }
                  options={estudiantes.map((e) => ({ label: e.nombre_completo, value: e.id }))}
                  onChange={handleEstudianteChange}
                  size="large"
                />
              </Form.Item>

              {estudianteSeleccionado && (
                <Alert
                  message={`Estudiante: ${estudianteSeleccionado.nombre_completo}`}
                  description={
                    <div>
                      {estudianteSeleccionado.telefono && <div>Teléfono: {estudianteSeleccionado.telefono}</div>}
                      {estudianteSeleccionado.email && <div>Email: {estudianteSeleccionado.email}</div>}
                    </div>
                  }
                  type="info"
                  showIcon
                  style={{ marginBottom: 8 }}
                />
              )}
            </Form>
          </Card>

          {loading ? (
            <Card>
              <div style={{ textAlign: "center", padding: 40 }}>
                <Spin size="large" />
              </div>
            </Card>
          ) : (
            cuotas.length > 0 && (
              <Card title="Cuotas Pendientes" style={{ marginBottom: 24 }}>
                <Table
                  rowSelection={rowSelection}
                  columns={cuotasColumns}
                  dataSource={cuotas}
                  rowKey="id"
                  pagination={false}
                  size="small"
                />
              </Card>
            )
          )}
        </Col>

        <Col xs={24} lg={10}>
          <Card
            title="Resumen de Pago"
            style={{
              marginBottom: 24,
              position: "sticky",
              top: 24,
            }}
          >
            <Statistic
              title="Total a Pagar"
              value={totalAPagar}
              precision={0}
              prefix="$"
              valueStyle={{ color: "#3f8600", fontSize: 36, fontWeight: "bold" }}
              suffix="COP"
            />

            <Divider style={{ margin: "12px 0" }} />

            <Alert
              type={qzTrayDisponible ? "success" : "warning"}
              showIcon
              style={{ marginBottom: 16 }}
              message={qzTrayDisponible ? "Impresion directa Epson disponible" : "Impresion local no detectada"}
              description={
                qzTrayDisponible
                  ? "La caja intentara imprimir directo en la Epson TM-T20II y abrir el cajon en pagos en efectivo."
                  : "Si QZ Tray no esta instalado o no detecta la impresora, se usara el dialogo normal del navegador."
              }
            />

            <Form form={form} layout="vertical">
              {cuotasSeleccionadas.length === 1 && (() => {
                const cuotaSeleccionada = cuotas.find((item) => item.id === cuotasSeleccionadas[0]);
                if (!cuotaSeleccionada) return null;

                const saldoActual = getSaldoPendiente(cuotaSeleccionada);
                const descuentoActual = Number(descuentoAplicado || 0);
                const netoAPagar = Math.max(saldoActual - descuentoActual, 0);

                return (
                  <>
                    <Alert
                      type="info"
                      showIcon
                      style={{ marginBottom: 16 }}
                      message={cuotaSeleccionada.periodo_pagado || `Cuota ${cuotaSeleccionada.numero_cuota}`}
                      description={
                        <div>
                          <div>Valor programado: {formatCurrency(getMontoProgramado(cuotaSeleccionada))}</div>
                          <div>Abonado acumulado: {formatCurrency(getTotalAbonado(cuotaSeleccionada))}</div>
                          <div>Descuento acumulado: {formatCurrency(getDescuentoAplicado(cuotaSeleccionada))}</div>
                          <div>Saldo actual: {formatCurrency(saldoActual)}</div>
                          <div>Máximo abono permitido: {formatCurrency(netoAPagar)}</div>
                          <div><strong>Nuevo valor a pagar: {formatCurrency(netoAPagar)}</strong></div>
                        </div>
                      }
                    />

                    <Form.Item label="Descuento aplicado" name="descuento_aplicado">
                      <InputNumber<number>
                        placeholder="$0"
                        formatter={(value) => `$${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                        parser={(value) => Number(value?.replace(/\$/g, "").replace(/,/g, ""))}
                        size="large"
                        style={{ width: "100%" }}
                        min={0}
                        max={saldoActual}
                      />
                    </Form.Item>

                    <Form.Item label="Valor a registrar (neto)" name="monto_a_registrar">
                      <InputNumber<number>
                        placeholder="$0"
                        formatter={(value) => `$${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                        parser={(value) => Number(value?.replace(/\$/g, "").replace(/,/g, ""))}
                        size="large"
                        style={{ width: "100%" }}
                        min={0}
                        max={netoAPagar}
                      />
                    </Form.Item>

                    <Button
                      type="link"
                      size="small"
                      style={{ paddingLeft: 0, marginTop: -8, marginBottom: 8 }}
                      onClick={() => form.setFieldValue("monto_a_registrar", 0)}
                    >
                      Aplicar solo descuento (sin abono)
                    </Button>

                    <Form.Item name="motivo_descuento" label="Motivo del descuento">
                      <Input placeholder="Obligatorio si aplicas descuento" size="large" />
                    </Form.Item>
                  </>
                );
              })()}

              {cuotasSeleccionadas.length > 1 && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="Pago múltiple"
                  description="Para varias cuotas se cobra saldo completo. Si necesitas descuento, selecciona una sola cuota."
                />
              )}

              {/* Valor entregado y cambio - Al inicio para fácil acceso */}
              <Form.Item label="Valor entregado por el cliente">
                <InputNumber<number>
                  placeholder="$0"
                  formatter={(value) => `$${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                  parser={(value) => Number(value?.replace(/\$/g, "").replace(/,/g, ""))}
                  value={valorEntregado}
                  onChange={(value) => setValorEntregado(value)}
                  size="large"
                  style={{ width: "100%" }}
                  min={0}
                />
              </Form.Item>

              {valorEntregado && valorEntregado >= totalAPagar && (
                <div style={{ 
                  padding: "12px", 
                  backgroundColor: "#f0f5ff", 
                  borderRadius: "4px", 
                  marginBottom: "16px",
                  border: "1px solid #b3d9ff"
                }}>
                  <div style={{ marginBottom: "8px" }}>
                    <Text>Valor entregado: <strong>{formatCurrency(valorEntregado)}</strong></Text>
                  </div>
                  <div>
                    <Text style={{ color: "#3f8600", fontSize: "16px", fontWeight: "bold" }}>
                      Cambio: {formatCurrency(cambio)}
                    </Text>
                  </div>
                </div>
              )}

              <Divider style={{ margin: "12px 0" }} />

              <Form.Item
                name="metodo_pago"
                label="Método de Pago"
                rules={[{ required: true, message: "Seleccione método de pago" }]}
                initialValue={mediosPago[0]?.codigo || "efectivo"}
              >
                <Radio.Group buttonStyle="solid" style={{ width: "100%" }}>
                  <Row gutter={[6, 6]}>
                    {mediosPago.map((medio) => {
                      const codigoKey = medio.codigo as MetodoPago;
                      const icono = metodoPagoIcons[codigoKey] || <WalletOutlined />;
                      
                      return (
                        <Col key={medio.codigo} xs={12} sm={8} md={12}>
                          <Radio.Button
                            value={medio.codigo}
                            style={{ width: "100%", height: "auto", padding: "6px 8px", textAlign: "center" }}
                          >
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                              <span style={{ fontSize: 14 }}>{icono}</span>
                              <span style={{ fontSize: 11 }}>{medio.nombre}</span>
                            </div>
                          </Radio.Button>
                        </Col>
                      );
                    })}
                  </Row>
                </Radio.Group>
              </Form.Item>

              <Form.Item 
                name="referencia" 
                label="Comprobante / Factura"
                rules={[{ required: true, message: "Campo requerido" }]}
              >
                <Input 
                  placeholder="Generado automáticamente" 
                  size="large"
                  disabled
                />
              </Form.Item>

              <Form.Item name="observaciones" label="Observaciones">
                <Input.TextArea rows={2} placeholder="Notas adicionales..." />
              </Form.Item>

              <Divider />

              <Space direction="vertical" style={{ width: "100%" }} size="middle">
                <Button
                  type="primary"
                  size="large"
                  block
                  icon={<CheckCircleOutlined />}
                  onClick={handleRegistrarPago}
                  loading={procesando}
                  disabled={cuotasSeleccionadas.length === 0}
                  style={{
                    height: 56,
                    fontSize: 18,
                    fontWeight: "bold",
                  }}
                >
                  Registrar Pago
                </Button>

                <Button
                  size="large"
                  block
                  icon={<PrinterOutlined />}
                  disabled={cuotasSeleccionadas.length === 0}
                  onClick={async () => {
                    const values = form.getFieldsValue();
                    if (!estudianteSeleccionado || !values.metodo_pago) {
                      messageApi.warning("Complete la información para imprimir");
                      return;
                    }

                    const cuotasAPagar = cuotas.filter((c) => cuotasSeleccionadas.includes(c.id));
                    const metodoPago = values.metodo_pago as MetodoPago;

                    const { data: configActual } = await supabaseBrowserClient
                      .from("configuracion")
                      .select("*")
                      .order("updated_at", { ascending: false, nullsFirst: false })
                      .order("created_at", { ascending: false, nullsFirst: false })
                      .limit(1)
                      .maybeSingle();

                    const configTicket = configActual || configuracion;
                    
                    const ticketData = {
                      academia: {
                        nombre: configTicket?.nombre_academia || "Academia Crystal Diamante",
                        ruc: configTicket?.ruc || undefined,
                        logoUrl: configTicket?.logo_url || undefined,
                        telefono: configTicket?.telefono || "",
                        direccion: configTicket?.direccion || "",
                        email: configTicket?.email || "",
                        ticketTitulo: "PRE-RECIBO (NO VÁLIDO COMO COMPROBANTE)",
                        ticketNota: configTicket?.ticket_nota || "",
                        ticketPie: configTicket?.ticket_pie || "Gracias",
                        ticketCampos: configTicket?.ticket_campos || undefined,
                      },
                      estudiante: {
                        nombre: estudianteSeleccionado.nombre_completo,
                        telefono: estudianteSeleccionado.telefono || "",
                      },
                      pago: {
                        monto: totalAPagar,
                        metodo: metodoPagoLabels[metodoPago],
                        fecha: dayjs().format("DD/MM/YYYY HH:mm"),
                        referencia: values.referencia || `FAC-${generarNumeroFactura()}`,
                        concepto: cuotasAPagar.map((c) => c.periodo_pagado || `Cuota ${c.numero_cuota ?? ""}`.trim()).join(", "),
                        numeroCuota: cuotasAPagar.length === 1 ? cuotasAPagar[0]?.numero_cuota : undefined,
                        periodo: cuotasAPagar.map((c) => c.periodo_pagado).join(", "),
                        valorEntregado: valorEntregado || undefined,
                        cambio: cambio || undefined,
                      },
                    };

                    const blob = await generarTicketPagoBlob(ticketData);
                    const placeholder = window.open("", "_blank");
                    if (placeholder) {
                      abrirTicketPagoDesdeBlob(blob, placeholder);
                    } else {
                      abrirTicketPagoDesdeBlob(blob);
                    }
                  }}
                >
                  Vista Previa
                </Button>
              </Space>
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
