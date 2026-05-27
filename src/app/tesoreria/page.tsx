
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { List } from "@refinedev/antd";
import {
    Alert,
    Button,
    Card,
    Col,
    DatePicker,
    Divider,
    Drawer,
    Form,
    Input,
    InputNumber,
    Progress,
    Row,
    Select,
    Space,
    Spin,
    Statistic,
    Table,
    Tag,
    Tooltip,
    Typography,
    Popconfirm,
    message,
    Grid,
    Dropdown,
} from "antd";
import {
    BarChartOutlined,
    BankOutlined,
    CalendarOutlined,
    DeleteOutlined,
    DollarCircleOutlined,
    FallOutlined,
    FileAddOutlined,
    FilterOutlined,
    ReloadOutlined,
    RiseOutlined,
    SaveOutlined,
    SearchOutlined,
    EllipsisOutlined,
    PrinterOutlined,
    TrophyOutlined,
    WarningOutlined,
    WhatsAppOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useCurrentUser } from "@hooks/useCurrentUser";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { enviarWhatsapp } from "@utils/whatsapp";
import { abrirTicketPagoDesdeBlob, generarTicketPagoBlob } from "@utils/pago-ticket";
import { subirTicketPago } from "@utils/ticket-storage";
import {
    listarMovimientos,
    crearMovimiento,
    eliminarMovimiento,
    sincronizarIngresosDesdePagos,
    type MovimientoFinanciero,
} from "@modules/finanzas/movimientos.service";
import { MOVIMIENTO_CATEGORIAS, MOVIMIENTO_TIPO, MOVIMIENTO_TIPO_COLOR, MOVIMIENTO_TIPO_LABEL } from "@constants/movimientos";
import { normalizeModalidadPago } from "@/types/payment-plans";

const { useBreakpoint } = Grid;

const { Text } = Typography;
const { RangePicker } = DatePicker;

const formatoCOP = (valor: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(valor);

const getPeriodoPagoLegible = (pago: {
    periodo_pagado?: string | null;
    numero_cuota?: number | null;
    tipo_cuota?: string | null;
    matriculas?: { modalidad_pago?: string | null } | null;
}) => {
    const periodoActual = String(pago?.periodo_pagado || "").trim();
    const numeroCuota = Number(pago?.numero_cuota || 0);
    const tipoCuota = String(pago?.tipo_cuota || "").toLowerCase().trim();
    const modalidadPago = normalizeModalidadPago(pago?.matriculas?.modalidad_pago);
    const esRegistroHistoricoPorClase =
        modalidadPago !== "POR_CLASE" &&
        (tipoCuota === "por_clase" || /^clase\s*#?\s*\d+/i.test(periodoActual));

    if (numeroCuota === 0) {
        return periodoActual || "Inscripción";
    }

    if (modalidadPago === "POR_CLASE") {
        return `Clase #${numeroCuota}`;
    }

    if (esRegistroHistoricoPorClase) {
        return "Pago previo por clase";
    }

    return periodoActual || `Cuota ${numeroCuota}`.trim();
};

export default function TesoreriaPage() {
    const screens = useBreakpoint();
    const isMobile = !screens.md;
    const isTablet = screens.md && !screens.lg;
    const { user } = useCurrentUser();
    const [movimientos, setMovimientos] = useState<MovimientoFinanciero[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busqueda, setBusqueda] = useState("");
    const [filtroRango, setFiltroRango] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
    const [filtroMes, setFiltroMes] = useState<dayjs.Dayjs | null>(null);
    const [filtroPeriodo, setFiltroPeriodo] = useState<string | null>(null);
    const [filtroTipo, setFiltroTipo] = useState<string | null>(null);
    const [filtroCategoria, setFiltroCategoria] = useState<string | null>(null);
    const [filtroMetodo, setFiltroMetodo] = useState<string | null>(null);
    const [filtroConciliado, setFiltroConciliado] = useState<string | null>(null);
    const [drawerVisible, setDrawerVisible] = useState(false);
    const [registrando, setRegistrando] = useState(false);
    const [ejecutandoLiquidacion, setEjecutandoLiquidacion] = useState(false);
    const [periodoAnalisis, setPeriodoAnalisis] = useState<string>("mes_actual");
    const [form] = Form.useForm();

    const role = (user?.rol || "").toLowerCase();
    const puedeEjecutarLiquidacion =
        role === "admin" ||
        role === "director" ||
        role === "administrador" ||
        role === "tesoreria" ||
        role === "tesorero" ||
        role === "contador" ||
        role === "finanzas" ||
        role.includes("admin");

    const generarTicketsFaltantes = useCallback(async () => {
        const { data: configAcademia } = await supabaseBrowserClient
            .from("configuracion")
            .select("nombre_academia, ruc, logo_url, telefono, direccion, email, ticket_titulo, ticket_nota, ticket_pie, ticket_campos")
            .order("updated_at", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();

        const { data: pagosSinTicket, error: errPagosSinTicket } = await supabaseBrowserClient
            .from("pagos")
            .select("id, fecha_pago, monto, metodo_pago, referencia, periodo_pagado, numero_cuota, tipo_cuota, estudiante_id, matricula_id, ticket_url, matriculas!pagos_matricula_id_fkey(estudiante_id, modalidad_pago, cursos(nombre))")
            .eq("estado", "pagado")
            .or("ticket_url.is.null,ticket_url.eq.")
            .not("fecha_pago", "is", null)
            .order("fecha_pago", { ascending: false })
            .limit(300);

        if (errPagosSinTicket) throw errPagosSinTicket;

        const pagos = (pagosSinTicket || []) as any[];
        if (pagos.length === 0) return 0;

        const estudianteIds = Array.from(
            new Set(
                pagos
                    .map((p) => p?.estudiante_id || p?.matriculas?.estudiante_id)
                    .filter(Boolean)
            )
        );

        const perfilesMap = new Map<string, any>();
        if (estudianteIds.length > 0) {
            const { data: perfilesData } = await supabaseBrowserClient
                .from("perfiles")
                .select("id, nombre_completo, identificacion, telefono")
                .in("id", estudianteIds);

            (perfilesData || []).forEach((perfil: any) => perfilesMap.set(String(perfil.id), perfil));
        }

        let generados = 0;

        for (const pago of pagos) {
            try {
                const estudianteId = String(pago?.estudiante_id || pago?.matriculas?.estudiante_id || "");
                const perfil = perfilesMap.get(estudianteId);
                const cursoNombre = pago?.matriculas?.cursos?.nombre || "Curso";
                const periodoLegible = getPeriodoPagoLegible(pago as any);

                const ticketData = {
                    academia: {
                        nombre: configAcademia?.nombre_academia || "Academia Crystal Diamante",
                        ruc: configAcademia?.ruc || undefined,
                        logoUrl: configAcademia?.logo_url || undefined,
                        telefono: configAcademia?.telefono || undefined,
                        direccion: configAcademia?.direccion || undefined,
                        email: configAcademia?.email || undefined,
                        ticketTitulo: configAcademia?.ticket_titulo || undefined,
                        ticketNota: configAcademia?.ticket_nota || undefined,
                        ticketPie: configAcademia?.ticket_pie || undefined,
                        ticketCampos: configAcademia?.ticket_campos || undefined,
                    },
                    estudiante: {
                        nombre: perfil?.nombre_completo || "Estudiante",
                        identificacion: perfil?.identificacion || undefined,
                        telefono: perfil?.telefono || undefined,
                    },
                    pago: {
                        referencia: pago?.referencia || pago?.id,
                        metodo: pago?.metodo_pago || "efectivo",
                        monto: Number(pago?.monto || 0),
                        fecha: dayjs(pago?.fecha_pago).format("DD/MM/YYYY"),
                        concepto: `${periodoLegible} - ${cursoNombre}`,
                        periodo: periodoLegible,
                        numeroCuota: typeof pago?.numero_cuota === "number" ? pago.numero_cuota : undefined,
                    },
                    curso: {
                        nombre: cursoNombre,
                    },
                } as const;

                const blob = await generarTicketPagoBlob(ticketData);
                const { publicUrl } = await subirTicketPago({
                    blob,
                    pagoId: String(pago.id),
                    estudianteId: estudianteId || undefined,
                });

                await supabaseBrowserClient
                    .from("pagos")
                    .update({ ticket_url: publicUrl })
                    .eq("id", pago.id);

                await supabaseBrowserClient
                    .from("movimientos_financieros")
                    .update({ ticket_url: publicUrl })
                    .eq("pago_id", pago.id);

                generados += 1;
            } catch (ticketErr) {
                console.error("Error generando ticket histórico:", pago?.id, ticketErr);
            }
        }

        return generados;
    }, []);

    const cargarMovimientos = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const role = (user?.rol || "").toLowerCase();
            const puedeVerTodo =
                role === "admin" ||
                role === "director" ||
                role === "administrador" ||
                role === "administrativo" ||
                role === "secretaria" ||
                role === "tesoreria" ||
                role === "tesorero" ||
                role === "caja" ||
                role === "cajero" ||
                role === "contador" ||
                role === "finanzas" ||
                role.includes("admin");

            try {
                await sincronizarIngresosDesdePagos(user?.id || null);
            } catch (syncError) {
                console.warn("No se pudo sincronizar ingresos desde pagos al cargar tesorería", syncError);
            }

            try {
                const totalGenerados = await generarTicketsFaltantes();
                if (totalGenerados > 0) {
                    message.success(`Se generaron ${totalGenerados} tickets PDF faltantes.`);
                }
            } catch (ticketBackfillError) {
                console.warn("No se pudieron generar algunos tickets históricos", ticketBackfillError);
            }

            const data = await listarMovimientos({}, { userId: user?.id || null, esAdmin: puedeVerTodo });
            setMovimientos(data);
        } catch (err: any) {
            console.error("Error cargando movimientos", err);
            setError(err.message ?? "No se pudieron cargar los movimientos");
        } finally {
            setLoading(false);
        }
    }, [generarTicketsFaltantes, user?.id, user?.rol]);

    useEffect(() => {
        void cargarMovimientos();
    }, [cargarMovimientos]);

    const metodosDisponibles = useMemo(() => {
        const set = new Set<string>();
        movimientos.forEach((mov) => {
            if (mov.metodo_pago) set.add(mov.metodo_pago);
        });
        return Array.from(set).sort();
    }, [movimientos]);

    const categoriasDisponibles = useMemo(() => {
        const set = new Set<string>();
        movimientos.forEach((mov) => {
            if (mov.categoria) set.add(mov.categoria);
        });
        return Array.from(set).sort();
    }, [movimientos]);

    const movimientosFiltrados = useMemo(() => {
        return movimientos.filter((mov) => {
            const matchTexto = (() => {
                if (!busqueda) return true;
                const term = busqueda.toLowerCase();
                return [
                    mov.concepto,
                    mov.categoria ?? "",
                    mov.metodo_pago ?? "",
                    mov.referencia ?? "",
                    mov.descripcion ?? "",
                    mov.perfiles?.nombre_completo ?? "",
                    mov.proveedores?.nombre_completo ?? "",
                ]
                    .join(" ")
                    .toLowerCase()
                    .includes(term);
            })();

            if (!matchTexto) return false;

            if (filtroTipo && mov.tipo !== filtroTipo) return false;

            if (filtroCategoria && (mov.categoria ?? "") !== filtroCategoria) return false;

            if (filtroMetodo && (mov.metodo_pago ?? "") !== filtroMetodo) return false;

            if (filtroConciliado) {
                const valor = filtroConciliado === "conciliado";
                if (mov.conciliado !== valor) return false;
            }

            const fechaMov = dayjs(mov.fecha);

            if (filtroRango && filtroRango[0] && filtroRango[1]) {
                const inicio = filtroRango[0];
                const fin = filtroRango[1];
                if (!fechaMov.isBetween(inicio, fin.add(1, "day"), "day", "[)")) {
                    return false;
                }
            } else if (filtroMes) {
                if (!fechaMov.isSame(filtroMes, "month")) {
                    return false;
                }
            } else if (filtroPeriodo) {
                const hoy = dayjs();
                let inicio: dayjs.Dayjs | null = null;
                let fin: dayjs.Dayjs | null = null;

                if (filtroPeriodo === "hoy") {
                    inicio = hoy.startOf("day");
                    fin = hoy.endOf("day");
                } else if (filtroPeriodo === "semana_actual") {
                    inicio = hoy.startOf("week");
                    fin = hoy.endOf("week");
                } else if (filtroPeriodo === "mes_actual") {
                    inicio = hoy.startOf("month");
                    fin = hoy.endOf("month");
                } else if (filtroPeriodo === "mes_anterior") {
                    const mesAnterior = hoy.subtract(1, "month");
                    inicio = mesAnterior.startOf("month");
                    fin = mesAnterior.endOf("month");
                } else if (filtroPeriodo === "anio_actual") {
                    inicio = hoy.startOf("year");
                    fin = hoy.endOf("year");
                }

                if (inicio && fin && !fechaMov.isBetween(inicio, fin.add(1, "day"), "day", "[)")) {
                    return false;
                }
            }

            return true;
        });
    }, [busqueda, filtroCategoria, filtroConciliado, filtroMes, filtroMetodo, filtroPeriodo, filtroRango, filtroTipo, movimientos]);

    const totalIngresos = useMemo(
        () => movimientosFiltrados.filter((m) => m.tipo === MOVIMIENTO_TIPO.INGRESO).reduce((acc, mov) => acc + Number(mov.monto || 0), 0),
        [movimientosFiltrados]
    );

    const totalEgresos = useMemo(
        () => movimientosFiltrados.filter((m) => m.tipo === MOVIMIENTO_TIPO.EGRESO).reduce((acc, mov) => acc + Number(mov.monto || 0), 0),
        [movimientosFiltrados]
    );

    const saldoNeto = useMemo(() => totalIngresos - totalEgresos, [totalIngresos, totalEgresos]);

    const totalIngresosCaja = useMemo(
        () =>
            movimientosFiltrados
                .filter(
                    (m) =>
                        m.tipo === MOVIMIENTO_TIPO.INGRESO &&
                        ["matriculas", "inscripciones"].includes(String(m.categoria || "").toLowerCase())
                )
                .reduce((acc, mov) => acc + Number(mov.monto || 0), 0),
        [movimientosFiltrados]
    );

    const totalIngresosEfectivo = useMemo(
        () =>
            movimientosFiltrados
                .filter(
                    (m) =>
                        m.tipo === MOVIMIENTO_TIPO.INGRESO &&
                        ["matriculas", "inscripciones"].includes(String(m.categoria || "").toLowerCase()) &&
                        String(m.metodo_pago || "").toLowerCase() === "efectivo"
                )
                .reduce((acc, mov) => acc + Number(mov.monto || 0), 0),
        [movimientosFiltrados]
    );

    const totalSalidasReales = useMemo(
        () => movimientosFiltrados.filter((m) => m.tipo === MOVIMIENTO_TIPO.EGRESO).reduce((acc, mov) => acc + Number(mov.monto || 0), 0),
        [movimientosFiltrados]
    );

    const totalSalidasEfectivo = useMemo(
        () =>
            movimientosFiltrados
                .filter((m) => m.tipo === MOVIMIENTO_TIPO.EGRESO && String(m.metodo_pago || "").toLowerCase() === "efectivo")
                .reduce((acc, mov) => acc + Number(mov.monto || 0), 0),
        [movimientosFiltrados]
    );

    const saldoCajaEfectivo = useMemo(() => totalIngresosEfectivo - totalSalidasEfectivo, [totalIngresosEfectivo, totalSalidasEfectivo]);

    const movimientosAnalisis = useMemo(() => {
        const hoy = dayjs();
        let inicio: dayjs.Dayjs;
        let fin: dayjs.Dayjs;
        switch (periodoAnalisis) {
            case "trimestre_actual": {
                const q = Math.floor(hoy.month() / 3);
                inicio = hoy.month(q * 3).startOf("month");
                fin = hoy.month(q * 3 + 2).endOf("month");
                break;
            }
            case "semestre_1":
                inicio = hoy.startOf("year");
                fin = hoy.month(5).endOf("month");
                break;
            case "semestre_2":
                inicio = hoy.month(6).startOf("month");
                fin = hoy.endOf("year");
                break;
            case "anio_actual":
                inicio = hoy.startOf("year");
                fin = hoy.endOf("year");
                break;
            case "anio_anterior": {
                const ant = hoy.subtract(1, "year");
                inicio = ant.startOf("year");
                fin = ant.endOf("year");
                break;
            }
            default: // mes_actual
                inicio = hoy.startOf("month");
                fin = hoy.endOf("month");
        }
        return movimientos.filter((m) => {
            const f = dayjs(m.fecha);
            return f.isBetween(inicio, fin.add(1, "day"), "day", "[)");
        });
    }, [movimientos, periodoAnalisis]);

    const analisisFinanciero = useMemo(() => {
        const ingresos = movimientosAnalisis
            .filter((m) => m.tipo === MOVIMIENTO_TIPO.INGRESO)
            .reduce((acc, m) => acc + Number(m.monto || 0), 0);
        const egresos = movimientosAnalisis
            .filter((m) => m.tipo === MOVIMIENTO_TIPO.EGRESO)
            .reduce((acc, m) => acc + Number(m.monto || 0), 0);
        const ganancia = ingresos - egresos;
        const total = ingresos + egresos;
        const pctIngresos = total > 0 ? Math.round((ingresos / total) * 100) : 0;
        const pctEgresos = total > 0 ? Math.round((egresos / total) * 100) : 0;
        const cobertura = egresos > 0 ? Math.min(Math.round((ingresos / egresos) * 100), 999) : 100;
        const margen = ingresos > 0 ? Math.round((ganancia / ingresos) * 100) : 0;
        const superoPE = ingresos >= egresos;
        return { ingresos, egresos, ganancia, pctIngresos, pctEgresos, cobertura, margen, superoPE };
    }, [movimientosAnalisis]);

    const etiquetaPeriodo = useMemo(() => {
        const hoy = dayjs();
        const labels: Record<string, string> = {
            mes_actual: hoy.format("MMMM YYYY"),
            trimestre_actual: `T${Math.floor(hoy.month() / 3) + 1} ${hoy.year()}`,
            semestre_1: `1er Semestre ${hoy.year()}`,
            semestre_2: `2do Semestre ${hoy.year()}`,
            anio_actual: String(hoy.year()),
            anio_anterior: String(hoy.year() - 1),
        };
        return labels[periodoAnalisis] ?? periodoAnalisis;
    }, [periodoAnalisis]);

    const handleRegistrarMovimiento = useCallback(async () => {
        try {
            const values = await form.validateFields();
            setRegistrando(true);

            await crearMovimiento({
                fecha: (values.fecha as dayjs.Dayjs).format("YYYY-MM-DD"),
                tipo: values.tipo,
                monto: Number(values.monto),
                concepto: values.concepto,
                categoria: values.categoria || null,
                metodo_pago: values.metodo_pago || null,
                referencia: values.referencia || null,
                descripcion: values.descripcion || null,
                created_by: user?.id || null,
            });

            message.success("Movimiento registrado correctamente");
            setDrawerVisible(false);
            form.resetFields();
            await cargarMovimientos();
        } catch (err: any) {
            if (err?.errorFields) {
                return;
            }
            console.error("Error registrando movimiento", err);
            message.error(err?.message ?? "No se pudo registrar el movimiento");
        } finally {
            setRegistrando(false);
        }
    }, [cargarMovimientos, form, user?.id]);

    const handleEliminar = useCallback(
        async (movimientoId: string) => {
            try {
                await eliminarMovimiento(movimientoId);
                message.success("Movimiento eliminado");
                await cargarMovimientos();
            } catch (err: any) {
                console.error("Error eliminando movimiento", err);
                message.error(err?.message ?? "No se pudo eliminar el movimiento");
            }
        },
        [cargarMovimientos]
    );

    const resetFiltros = () => {
        setBusqueda("");
        setFiltroRango(null);
        setFiltroMes(null);
        setFiltroPeriodo(null);
        setFiltroTipo(null);
        setFiltroCategoria(null);
        setFiltroMetodo(null);
        setFiltroConciliado(null);
    };

    const handleReimprimirComprobante = (ticketUrl: string) => {
        const printWindow = window.open(ticketUrl, "_blank");
        if (!printWindow) {
            message.warning("No se pudo abrir el comprobante para imprimir");
            return;
        }

        const fallbackTimeout = window.setTimeout(() => {
            try {
                printWindow.focus();
                printWindow.print();
            } catch {
            }
        }, 2500);

        printWindow.addEventListener(
            "load",
            () => {
                window.clearTimeout(fallbackTimeout);
                try {
                    printWindow.focus();
                    printWindow.print();
                } catch {
                }
            },
            { once: true }
        );
    };

    const ejecutarLiquidacionProfesoresAhora = async () => {
        if (!puedeEjecutarLiquidacion) {
            message.warning("No tienes permisos para ejecutar la liquidación de profesores");
            return;
        }

        try {
            setEjecutandoLiquidacion(true);

            const response = await fetch("/api/tesoreria/ejecutar-liquidacion-profesores", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            const result = await response.json();

            if (!response.ok || result?.success === false) {
                throw new Error(result?.error || "No se pudo ejecutar la liquidación");
            }

            if (result?.skipped) {
                message.info(result?.reason || "Liquidación omitida para la fecha actual");
                return;
            }

            const enviados = Number(result?.totales?.enviados || 0);
            const omitidos = Number(result?.totales?.omitidos || 0);
            const fallidos = Number(result?.totales?.fallidos || 0);
            const periodo = String(result?.periodo?.periodoTexto || "periodo actual");

            message.success(`Liquidación ${periodo}: enviados ${enviados}, omitidos ${omitidos}, fallidos ${fallidos}`);
        } catch (error: any) {
            console.error("Error ejecutando liquidación manual:", error);
            message.error(error?.message || "No se pudo ejecutar la liquidación ahora");
        } finally {
            setEjecutandoLiquidacion(false);
        }
    };

    const handleEnviarComprobanteWhatsapp = (record: MovimientoFinanciero) => {
        if (!record.ticket_url) {
            message.warning("Este movimiento no tiene comprobante");
            return;
        }

        const telefono = record.perfiles?.telefono;
        if (!telefono) {
            message.warning("El estudiante no tiene teléfono/WhatsApp registrado");
            return;
        }

        const nombre = record.perfiles?.nombre_completo || "estudiante";
        const concepto = record.concepto || "pago";
        const monto = Number(record.monto || 0);
        const montoTexto = formatoCOP(monto);
        const mensajeWhatsApp = `Hola ${nombre}, te compartimos tu comprobante de ${concepto} por ${montoTexto}: ${record.ticket_url}`;
        enviarWhatsapp(telefono, mensajeWhatsApp);
    };

    const handleRegenerarComprobante = async (record: MovimientoFinanciero) => {
        try {
            if (!record.pago_id && !record.pago_abono_id) {
                message.warning("Solo se puede regenerar ticket en movimientos vinculados a un pago");
                return;
            }

            const { data: configAcademia } = await supabaseBrowserClient
                .from("configuracion")
                .select("*")
                .order("updated_at", { ascending: false, nullsFirst: false })
                .order("created_at", { ascending: false, nullsFirst: false })
                .limit(1)
                .maybeSingle();

            const { data: pagoData, error: pagoError } = record.pago_abono_id
                ? await supabaseBrowserClient
                    .from("pagos_abonos")
                    .select("id, pago_id, fecha_pago, monto_abono, metodo_pago, referencia, observaciones, pagos(id, periodo_pagado, numero_cuota, tipo_cuota, estudiante_id, matriculas!pagos_matricula_id_fkey(modalidad_pago, cursos(nombre))))")
                    .eq("id", record.pago_abono_id)
                    .maybeSingle()
                : await supabaseBrowserClient
                    .from("pagos")
                    .select("id, fecha_pago, monto, metodo_pago, referencia, periodo_pagado, numero_cuota, tipo_cuota, estudiante_id, matriculas!pagos_matricula_id_fkey(modalidad_pago, cursos(nombre))")
                    .eq("id", record.pago_id)
                    .maybeSingle();

            if (pagoError || !pagoData) {
                throw pagoError ?? new Error("No se encontró el pago asociado al movimiento");
            }

            const pago = record.pago_abono_id
                ? {
                    id: (pagoData as any)?.pagos?.id,
                    fecha_pago: (pagoData as any)?.fecha_pago,
                    monto: Number((pagoData as any)?.monto_abono || 0),
                    metodo_pago: (pagoData as any)?.metodo_pago,
                    referencia: (pagoData as any)?.referencia,
                    periodo_pagado: (pagoData as any)?.pagos?.periodo_pagado,
                    numero_cuota: (pagoData as any)?.pagos?.numero_cuota,
                    tipo_cuota: (pagoData as any)?.pagos?.tipo_cuota,
                    estudiante_id: (pagoData as any)?.pagos?.estudiante_id,
                    matriculas: (pagoData as any)?.pagos?.matriculas,
                    abono_id: (pagoData as any)?.id,
                  }
                : (pagoData as any);

            const estudianteId = String(pago?.estudiante_id || record?.estudiante_id || "");
            const { data: perfil } = estudianteId
                ? await supabaseBrowserClient
                    .from("perfiles")
                    .select("id, nombre_completo, identificacion, telefono")
                    .eq("id", estudianteId)
                    .maybeSingle()
                : { data: null as any };

            const cursoNombre = (pago as any)?.matriculas?.cursos?.nombre || "Curso";
            const periodoLegible = getPeriodoPagoLegible(pago as any);
            const fechaPagoLegible = pago?.fecha_pago ? dayjs(pago.fecha_pago).format("DD/MM/YYYY") : dayjs().format("DD/MM/YYYY");
            const concepto = record.pago_abono_id ? `Abono a ${periodoLegible} - ${cursoNombre}` : `${periodoLegible} - ${cursoNombre}`;

            const ticketData = {
                academia: {
                    nombre: configAcademia?.nombre_academia || "Academia Crystal Diamante",
                    ruc: configAcademia?.ruc || undefined,
                    logoUrl: configAcademia?.logo_url || undefined,
                    telefono: configAcademia?.telefono || undefined,
                    direccion: configAcademia?.direccion || undefined,
                    email: configAcademia?.email || undefined,
                    ticketTitulo: configAcademia?.ticket_titulo || undefined,
                    ticketNota: configAcademia?.ticket_nota || undefined,
                    ticketPie: configAcademia?.ticket_pie || undefined,
                    ticketCampos: configAcademia?.ticket_campos || undefined,
                },
                estudiante: {
                    nombre: perfil?.nombre_completo || record?.perfiles?.nombre_completo || "Estudiante",
                    identificacion: perfil?.identificacion || undefined,
                    telefono: perfil?.telefono || record?.perfiles?.telefono || undefined,
                },
                pago: {
                    referencia: pago?.referencia || (pago as any)?.abono_id || pago?.id,
                    metodo: pago?.metodo_pago || "efectivo",
                    monto: Number(pago?.monto || 0),
                    fecha: fechaPagoLegible,
                    concepto,
                    periodo: record.descripcion || periodoLegible,
                    numeroCuota: typeof pago?.numero_cuota === "number" ? pago.numero_cuota : undefined,
                },
                curso: {
                    nombre: cursoNombre,
                },
            } as const;

            const blob = await generarTicketPagoBlob(ticketData);
            const placeholder = window.open("", "_blank");
            if (placeholder) {
                abrirTicketPagoDesdeBlob(blob, placeholder);
            } else {
                abrirTicketPagoDesdeBlob(blob);
            }

            const { publicUrl } = await subirTicketPago({
                blob,
                pagoId: String(pago.id),
                estudianteId: estudianteId || undefined,
            });

            await supabaseBrowserClient
                .from(record.pago_abono_id ? "pagos_abonos" : "pagos")
                .update({ ticket_url: publicUrl } as any)
                .eq("id", record.pago_abono_id || pago.id);

            await supabaseBrowserClient
                .from("movimientos_financieros")
                .update({ ticket_url: publicUrl })
                .eq(record.pago_abono_id ? "pago_abono_id" : "pago_id", record.pago_abono_id || pago.id);

            setMovimientos((prev) => prev.map((mov) => {
                const coincide = record.pago_abono_id
                    ? String(mov.pago_abono_id || "") === String(record.pago_abono_id)
                    : String(mov.pago_id || "") === String(pago.id);

                if (coincide) {
                    return { ...mov, ticket_url: publicUrl };
                }
                return mov;
            }));

            message.success("Ticket regenerado correctamente");
        } catch (err) {
            console.error("Error regenerando ticket:", err);
            message.error("No se pudo regenerar el ticket");
        }
    };

    return (
        <List
            title={isMobile ? "💰 Tesorería" : "💰 Tesorería - Movimientos Financieros"}
            headerButtons={
                <Space direction={isMobile ? "vertical" : "horizontal"} style={{ width: isMobile ? "100%" : "auto" }}>
                    <Input
                        placeholder={isMobile ? "Buscar..." : "Buscar por concepto, referencia o persona"}
                        allowClear
                        prefix={<SearchOutlined />}
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        style={{ width: isMobile ? "100%" : 320 }}
                        size={isMobile ? "middle" : "large"}
                    />
                    <Button 
                        icon={<ReloadOutlined />} 
                        onClick={() => void cargarMovimientos()} 
                        disabled={loading}
                        size={isMobile ? "middle" : "large"}
                        block={isMobile}
                    >
                        {isMobile ? "Actualizar" : "Actualizar"}
                    </Button>
                    <Button
                        icon={<CalendarOutlined />}
                        onClick={() => void ejecutarLiquidacionProfesoresAhora()}
                        loading={ejecutandoLiquidacion}
                        disabled={!puedeEjecutarLiquidacion}
                        size={isMobile ? "middle" : "large"}
                        block={isMobile}
                    >
                        {isMobile ? "Liquidar ahora" : "Ejecutar liquidación ahora"}
                    </Button>
                    <Button
                        type="primary"
                        icon={<FileAddOutlined />}
                        onClick={() => {
                            form.resetFields();
                            form.setFieldValue("tipo", MOVIMIENTO_TIPO.INGRESO);
                            form.setFieldValue("fecha", dayjs());
                            setDrawerVisible(true);
                        }}
                        size={isMobile ? "middle" : "large"}
                        block={isMobile}
                    >
                        {isMobile ? "Registrar" : "Registrar movimiento"}
                    </Button>
                </Space>
            }
        >
            {user?.rol === "admin" && (
                <Alert
                    message="🔓 Modo Administrador"
                    description="Puedes eliminar movimientos. Hazlo solo si hay un error, ya que afecta los reportes contables."
                    type="warning"
                    showIcon
                    closable
                    style={{ marginBottom: 20 }}
                />
            )}

            {/* ── ANÁLISIS FINANCIERO ── */}
            <Card
                style={{ marginBottom: 20, borderRadius: 14, border: "1px solid #e0e7ff" }}
                bodyStyle={{ padding: isMobile ? 14 : 24 }}
                title={
                    <Space>
                        <BarChartOutlined style={{ color: "#6366f1", fontSize: 16 }} />
                        <span style={{ fontWeight: 700, fontSize: 15 }}>Análisis Financiero</span>
                        <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 400 }}>— {etiquetaPeriodo}</span>
                    </Space>
                }
                extra={
                    <Select
                        value={periodoAnalisis}
                        onChange={setPeriodoAnalisis}
                        size="small"
                        style={{ minWidth: isMobile ? 140 : 180 }}
                        options={[
                            { label: "Este mes", value: "mes_actual" },
                            { label: "Trimestre actual", value: "trimestre_actual" },
                            { label: "Semestre 1 (Ene–Jun)", value: "semestre_1" },
                            { label: "Semestre 2 (Jul–Dic)", value: "semestre_2" },
                            { label: "Este año", value: "anio_actual" },
                            { label: "Año anterior", value: "anio_anterior" },
                        ]}
                    />
                }
            >
                {/* Tarjetas de métricas */}
                <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
                    <Col xs={12} sm={6}>
                        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12, padding: "12px 14px", textAlign: "center" }}>
                            <div style={{ fontSize: 11, color: "#15803d", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Total Entradas</div>
                            <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 700, color: "#16a34a" }}>{formatoCOP(analisisFinanciero.ingresos)}</div>
                            <div style={{ fontSize: 11, color: "#15803d", marginTop: 2 }}>{analisisFinanciero.pctIngresos}% del flujo</div>
                        </div>
                    </Col>
                    <Col xs={12} sm={6}>
                        <div style={{ background: "#fff1f2", border: "1px solid #fca5a5", borderRadius: 12, padding: "12px 14px", textAlign: "center" }}>
                            <div style={{ fontSize: 11, color: "#b91c1c", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Total Salidas</div>
                            <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 700, color: "#dc2626" }}>{formatoCOP(analisisFinanciero.egresos)}</div>
                            <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 2 }}>{analisisFinanciero.pctEgresos}% del flujo</div>
                        </div>
                    </Col>
                    <Col xs={12} sm={6}>
                        <div style={{
                            background: analisisFinanciero.ganancia >= 0 ? "#eff6ff" : "#fff7ed",
                            border: `1px solid ${analisisFinanciero.ganancia >= 0 ? "#93c5fd" : "#fdba74"}`,
                            borderRadius: 12, padding: "12px 14px", textAlign: "center"
                        }}>
                            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5, color: analisisFinanciero.ganancia >= 0 ? "#1d4ed8" : "#c2410c" }}>
                                {analisisFinanciero.ganancia >= 0 ? "Ganancia" : "Pérdida"}
                            </div>
                            <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 700, color: analisisFinanciero.ganancia >= 0 ? "#2563eb" : "#ea580c", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                {analisisFinanciero.ganancia >= 0
                                    ? <RiseOutlined style={{ fontSize: 14 }} />
                                    : <FallOutlined style={{ fontSize: 14 }} />}
                                {formatoCOP(Math.abs(analisisFinanciero.ganancia))}
                            </div>
                            <div style={{ fontSize: 11, marginTop: 2, color: analisisFinanciero.ganancia >= 0 ? "#1d4ed8" : "#c2410c" }}>
                                Margen: {analisisFinanciero.margen}%
                            </div>
                        </div>
                    </Col>
                    <Col xs={12} sm={6}>
                        <div style={{
                            background: analisisFinanciero.superoPE ? "#f0fdf4" : "#fef9c3",
                            border: `1px solid ${analisisFinanciero.superoPE ? "#86efac" : "#fde047"}`,
                            borderRadius: 12, padding: "12px 14px", textAlign: "center"
                        }}>
                            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5, color: analisisFinanciero.superoPE ? "#15803d" : "#854d0e" }}>
                                Punto de Equilibrio
                            </div>
                            <div style={{ fontSize: isMobile ? 13 : 14, fontWeight: 700, color: analisisFinanciero.superoPE ? "#16a34a" : "#ca8a04", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                {analisisFinanciero.superoPE
                                    ? <><TrophyOutlined />  Superado</>  
                                    : <><WarningOutlined />  No alcanzado</>}
                            </div>
                            <Tooltip title={analisisFinanciero.superoPE
                                ? `Ingresos superan los gastos en ${formatoCOP(analisisFinanciero.ganancia)}`
                                : `Faltan ${formatoCOP(analisisFinanciero.egresos - analisisFinanciero.ingresos)} para cubrir gastos`}>
                                <div style={{ fontSize: 11, marginTop: 2, color: analisisFinanciero.superoPE ? "#15803d" : "#854d0e", cursor: "help", textDecoration: "underline dotted" }}>
                                    Cobertura: {analisisFinanciero.cobertura}%
                                </div>
                            </Tooltip>
                        </div>
                    </Col>
                </Row>

                {/* Barras comparativas */}
                <Divider style={{ margin: "12px 0" }} />
                <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <Space>
                            <span style={{ width: 10, height: 10, borderRadius: 2, background: "#22c55e", display: "inline-block" }} />
                            <Text style={{ fontSize: 12 }}>Entradas</Text>
                        </Space>
                        <Text strong style={{ fontSize: 12, color: "#16a34a" }}>{formatoCOP(analisisFinanciero.ingresos)}</Text>
                    </div>
                    <Tooltip title={`${analisisFinanciero.pctIngresos}% del flujo total`}>
                        <Progress
                            percent={analisisFinanciero.pctIngresos}
                            strokeColor="#22c55e"
                            trailColor="#f0fdf4"
                            showInfo={false}
                            size={["100%", 14]}
                            style={{ marginBottom: 10 }}
                        />
                    </Tooltip>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <Space>
                            <span style={{ width: 10, height: 10, borderRadius: 2, background: "#ef4444", display: "inline-block" }} />
                            <Text style={{ fontSize: 12 }}>Salidas</Text>
                        </Space>
                        <Text strong style={{ fontSize: 12, color: "#dc2626" }}>{formatoCOP(analisisFinanciero.egresos)}</Text>
                    </div>
                    <Tooltip title={`${analisisFinanciero.pctEgresos}% del flujo total`}>
                        <Progress
                            percent={analisisFinanciero.pctEgresos}
                            strokeColor="#ef4444"
                            trailColor="#fff1f2"
                            showInfo={false}
                            size={["100%", 14]}
                        />
                    </Tooltip>
                </div>

                {/* Barra de punto de equilibrio */}
                <Divider style={{ margin: "12px 0" }} />
                <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <Text style={{ fontSize: 12 }}>Cobertura de gastos (entradas / salidas)</Text>
                        <Text strong style={{ fontSize: 12, color: analisisFinanciero.superoPE ? "#16a34a" : "#ca8a04" }}>
                            {analisisFinanciero.cobertura}% {analisisFinanciero.superoPE ? "✓" : "↓ falta más"}
                        </Text>
                    </div>
                    <Progress
                        percent={Math.min(analisisFinanciero.cobertura, 100)}
                        strokeColor={analisisFinanciero.superoPE ? { from: "#22c55e", to: "#15803d" } : { from: "#fbbf24", to: "#f59e0b" }}
                        trailColor="#f3f4f6"
                        showInfo={false}
                        size={["100%", 18]}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>0% — Sin ingresos</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>100% — Punto de equilibrio</Text>
                    </div>
                </div>
            </Card>

            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                <Col xs={24} sm={8}>
                    <Card 
                        variant="borderless" 
                        style={{ background: "#f6ffed", borderColor: "#b7eb8f" }}
                        bodyStyle={{ padding: isMobile ? 12 : 24 }}
                    >
                        <Statistic
                            title={isMobile ? "Ingresos" : "Ingresos filtrados"}
                            value={formatoCOP(totalIngresos)}
                            valueStyle={{ color: "#3f8600", fontSize: isMobile ? 18 : 24 }}
                            prefix={<DollarCircleOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card 
                        variant="borderless" 
                        style={{ background: "#fff1f0", borderColor: "#ffa39e" }}
                        bodyStyle={{ padding: isMobile ? 12 : 24 }}
                    >
                        <Statistic
                            title={isMobile ? "Egresos" : "Egresos filtrados"}
                            value={formatoCOP(totalEgresos)}
                            valueStyle={{ color: "#cf1322", fontSize: isMobile ? 18 : 24 }}
                            prefix={<DollarCircleOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card 
                        variant="borderless" 
                        style={{ background: "#e6f7ff", borderColor: "#91d5ff" }}
                        bodyStyle={{ padding: isMobile ? 12 : 24 }}
                    >
                        <Statistic
                            title="Saldo neto"
                            value={formatoCOP(saldoNeto)}
                            valueStyle={{ color: saldoNeto >= 0 ? "#1890ff" : "#cf1322", fontSize: isMobile ? 18 : 24 }}
                            prefix={<BankOutlined />}
                        />
                    </Card>
                </Col>
            </Row>

            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                <Col xs={24} md={8}>
                    <Card
                        variant="borderless"
                        style={{ background: "#f6ffed", borderColor: "#b7eb8f" }}
                        bodyStyle={{ padding: isMobile ? 12 : 24 }}
                    >
                        <Statistic
                            title="Ingresos de caja (matrículas + mensualidades)"
                            value={formatoCOP(totalIngresosCaja)}
                            valueStyle={{ color: "#3f8600", fontSize: isMobile ? 16 : 22 }}
                            prefix={<DollarCircleOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={24} md={8}>
                    <Card
                        variant="borderless"
                        style={{ background: "#fff1f0", borderColor: "#ffa39e" }}
                        bodyStyle={{ padding: isMobile ? 12 : 24 }}
                    >
                        <Statistic
                            title="Salidas reales (profesores + gastos)"
                            value={formatoCOP(totalSalidasReales)}
                            valueStyle={{ color: "#cf1322", fontSize: isMobile ? 16 : 22 }}
                            prefix={<DollarCircleOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={24} md={8}>
                    <Card
                        variant="borderless"
                        style={{ background: "#e6f7ff", borderColor: "#91d5ff" }}
                        bodyStyle={{ padding: isMobile ? 12 : 24 }}
                    >
                        <Statistic
                            title="Saldo caja efectivo"
                            value={formatoCOP(saldoCajaEfectivo)}
                            valueStyle={{ color: saldoCajaEfectivo >= 0 ? "#1890ff" : "#cf1322", fontSize: isMobile ? 16 : 22 }}
                            prefix={<BankOutlined />}
                        />
                    </Card>
                </Col>
            </Row>

            <Card 
                style={{ marginBottom: 16 }} 
                title={
                    <Space>
                        <FilterOutlined />
                        <span>{isMobile ? "Filtros" : "Filtros de búsqueda"}</span>
                    </Space>
                }
                bodyStyle={{ padding: isMobile ? 12 : 24 }}
            >
                <Row gutter={[12, 12]}>
                    <Col xs={24} md={12} lg={8}>
                        <label style={{ fontSize: 12, fontWeight: "bold", display: "block", marginBottom: 4 }}>Rango de fechas</label>
                        <RangePicker
                            style={{ width: "100%" }}
                            value={filtroRango as any}
                            onChange={(value) => {
                                setFiltroRango(value as any);
                                if (value && (value[0] || value[1])) {
                                    setFiltroMes(null);
                                    setFiltroPeriodo(null);
                                }
                            }}
                            size="middle"
                        />
                    </Col>
                    <Col xs={12} sm={6} md={6} lg={4}>
                        <label style={{ fontSize: 12, fontWeight: "bold", display: "block", marginBottom: 4 }}>Mes</label>
                        <DatePicker
                            picker="month"
                            style={{ width: "100%" }}
                            value={filtroMes as any}
                            onChange={(value) => {
                                setFiltroMes(value);
                                if (value) {
                                    setFiltroRango(null);
                                    setFiltroPeriodo(null);
                                }
                            }}
                            allowClear
                            size="middle"
                        />
                    </Col>
                    <Col xs={12} sm={6} md={6} lg={4}>
                        <label style={{ fontSize: 12, fontWeight: "bold", display: "block", marginBottom: 4 }}>Período</label>
                        <Select
                            allowClear
                            placeholder="Selecciona"
                            value={filtroPeriodo ?? undefined}
                            onChange={(val) => {
                                setFiltroPeriodo(val ?? null);
                                if (val) {
                                    setFiltroRango(null);
                                    setFiltroMes(null);
                                }
                            }}
                            style={{ width: "100%" }}
                            size="middle"
                            options={[
                                { label: "Hoy", value: "hoy" },
                                { label: "Semana actual", value: "semana_actual" },
                                { label: "Mes actual", value: "mes_actual" },
                                { label: "Mes anterior", value: "mes_anterior" },
                                { label: "Año actual", value: "anio_actual" },
                            ]}
                        />
                    </Col>
                    <Col xs={12} sm={6} md={6} lg={4}>
                        <label style={{ fontSize: 12, fontWeight: "bold", display: "block", marginBottom: 4 }}>Tipo</label>
                        <Select
                            allowClear
                            placeholder="Todos"
                            value={filtroTipo ?? undefined}
                            onChange={(val) => setFiltroTipo(val ?? null)}
                            style={{ width: "100%" }}
                            size="middle"
                            options={[
                                { label: MOVIMIENTO_TIPO_LABEL[MOVIMIENTO_TIPO.INGRESO], value: MOVIMIENTO_TIPO.INGRESO },
                                { label: MOVIMIENTO_TIPO_LABEL[MOVIMIENTO_TIPO.EGRESO], value: MOVIMIENTO_TIPO.EGRESO },
                            ]}
                        />
                    </Col>
                    <Col xs={12} sm={6} md={6} lg={4}>
                        <label style={{ fontSize: 12, fontWeight: "bold", display: "block", marginBottom: 4 }}>Categoría</label>
                        <Select
                            allowClear
                            placeholder="Todas"
                            value={filtroCategoria ?? undefined}
                            onChange={(val) => setFiltroCategoria(val ?? null)}
                            style={{ width: "100%" }}
                            size="middle"
                            options={categoriasDisponibles.map((cat) => ({ label: cat, value: cat }))}
                        />
                    </Col>
                    <Col xs={12} sm={6} md={6} lg={4}>
                        <label style={{ fontSize: 12, fontWeight: "bold", display: "block", marginBottom: 4 }}>Método</label>
                        <Select
                            allowClear
                            placeholder="Todos"
                            value={filtroMetodo ?? undefined}
                            onChange={(val) => setFiltroMetodo(val ?? null)}
                            style={{ width: "100%" }}
                            size="middle"
                            options={metodosDisponibles.map((met) => ({ label: met, value: met }))}
                        />
                    </Col>
                    <Col xs={12} sm={6} md={6} lg={4}>
                        <label style={{ fontSize: 12, fontWeight: "bold", display: "block", marginBottom: 4 }}>Conciliación</label>
                        <Select
                            allowClear
                            placeholder="Todos"
                            value={filtroConciliado ?? undefined}
                            onChange={(val) => setFiltroConciliado(val ?? null)}
                            style={{ width: "100%" }}
                            size="middle"
                            options={[
                                { label: "Conciliados", value: "conciliado" },
                                { label: "Pendientes", value: "pendiente" },
                            ]}
                        />
                    </Col>
                    <Col xs={24} sm={12} md={12} lg={8}>
                        <label style={{ fontSize: 12, fontWeight: "bold", display: "block", marginBottom: 4 }}>Buscar</label>
                        <Input
                            placeholder="Buscar por concepto..."
                            prefix={<SearchOutlined />}
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            allowClear
                            size="middle"
                        />
                    </Col>
                    <Col xs={12} sm={6} md={6} lg={4}>
                        <label style={{ fontSize: 12, fontWeight: "bold", display: "block", marginBottom: 4, opacity: 0 }}>.</label>
                        <Button onClick={resetFiltros} style={{ width: "100%" }} size="middle">
                            {isMobile ? "Limpiar" : "Limpiar filtros"}
                        </Button>
                    </Col>
                </Row>
            </Card>

            {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                    <Spin size="large" />
                </div>
            ) : error ? (
                <Alert type="error" message={error} showIcon closable />
            ) : (
                <Table
                    rowKey="id"
                    dataSource={movimientosFiltrados}
                    scroll={{ x: isMobile ? 700 : 1000 }}
                    size={isMobile ? "small" : "middle"}
                    pagination={{ 
                      pageSize: isMobile ? 10 : 15,
                      simple: isMobile,
                      showSizeChanger: !isMobile,
                      position: ["bottomCenter"]
                    }}
                >
                    <Table.Column
                        title="Fecha"
                        dataIndex="fecha"
                        width={isMobile ? 100 : 140}
                        render={(value) => (
                            <Space size={4}>
                                {!isMobile && <CalendarOutlined style={{ color: "#999" }} />}
                                <span style={{ fontSize: isMobile ? 11 : 14 }}>
                                    {value ? dayjs(value).format(isMobile ? "DD/MM/YY" : "DD MMM YYYY") : "-"}
                                </span>
                            </Space>
                        )}
                    />
                    <Table.Column
                        title="Tipo"
                        dataIndex="tipo"
                        width={isMobile ? 70 : 100}
                        render={(tipo: MovimientoFinanciero["tipo"]) => (
                            <Tag color={MOVIMIENTO_TIPO_COLOR[tipo] || "default"}>
                                {isMobile ? (tipo === "ingreso" ? "+" : "-") : (MOVIMIENTO_TIPO_LABEL[tipo] || tipo)}
                            </Tag>
                        )}
                    />
                    <Table.Column
                        title="Concepto"
                        dataIndex="concepto"
                        render={(concepto: string, record: MovimientoFinanciero) => (
                            <Space direction="vertical" size={0}>
                                <Space size={8} wrap>
                                    <Text strong>{concepto}</Text>
                                    {record.pago_abono_id ? <Tag color="gold">ABONO</Tag> : null}
                                </Space>
                                {record.categoria ? <Text type="secondary">{record.categoria}</Text> : null}
                                {record.descripcion ? <Text type="secondary">{record.descripcion}</Text> : null}
                            </Space>
                        )}
                    />
                    {!isMobile && (
                        <Table.Column
                            title="Método"
                            dataIndex="metodo_pago"
                            render={(value: string | null) => (
                                <Tag icon={<DollarCircleOutlined />}>
                                    {value || "Efectivo"}
                                </Tag>
                            )}
                        />
                    )}
                    <Table.Column
                        title="Monto"
                        dataIndex="monto"
                        align="right"
                        width={isMobile ? 90 : 140}
                        render={(monto: number, record: MovimientoFinanciero) => (
                            <Text 
                                strong 
                                style={{ 
                                    color: record.tipo === MOVIMIENTO_TIPO.INGRESO ? "#3f8600" : "#cf1322",
                                    fontSize: isMobile ? 11 : 14
                                }}
                            >
                                {record.tipo === MOVIMIENTO_TIPO.EGRESO ? "-" : "+"}
                                {isMobile ? `$${(monto/1000).toFixed(0)}k` : formatoCOP(monto)}
                            </Text>
                        )}
                    />
                    {!isMobile && (
                        <Table.Column
                            title="Referencia"
                            dataIndex="referencia"
                            render={(value: string | null) => value || "-"}
                        />
                    )}
                    {!isMobile && (
                        <Table.Column
                            title="Persona"
                            render={(_, record: MovimientoFinanciero) => (
                                <Space direction="vertical" size={0}>
                                    {record.perfiles?.nombre_completo ? (
                                        <Text>{record.perfiles.nombre_completo}</Text>
                                    ) : null}
                                    {record.proveedores?.nombre_completo ? (
                                        <Text type="secondary">Proveedor: {record.proveedores.nombre_completo}</Text>
                                    ) : null}
                                    {!record.perfiles?.nombre_completo && !record.proveedores?.nombre_completo ? (
                                        <Text type="secondary">No asignado</Text>
                                    ) : null}
                                </Space>
                            )}
                        />
                    )}
                    {!isMobile && (
                        <Table.Column
                            title="Ticket"
                            render={(_, record: MovimientoFinanciero) =>
                                <Space size={6} wrap>
                                    {record.ticket_url ? (
                                        <>
                                            <Button size="small" onClick={() => window.open(record.ticket_url!, "_blank")}>Ver PDF</Button>
                                            <Button size="small" icon={<PrinterOutlined />} onClick={() => handleReimprimirComprobante(record.ticket_url!)}>
                                                Reimprimir
                                            </Button>
                                            <Button size="small" icon={<WhatsAppOutlined />} onClick={() => handleEnviarComprobanteWhatsapp(record)}>
                                                Enviar
                                            </Button>
                                        </>
                                    ) : (
                                        <Tag color="default">Sin comprobante</Tag>
                                    )}
                                    <Button size="small" onClick={() => void handleRegenerarComprobante(record)}>
                                        Regenerar
                                    </Button>
                                </Space>
                            }
                        />
                    )}
                    {!isMobile && (
                        <Table.Column
                            title="Conciliado"
                            dataIndex="conciliado"
                            render={(value: boolean) => (
                                <Tag color={value ? "green" : "orange"}>{value ? "Conciliado" : "Pendiente"}</Tag>
                            )}
                        />
                    )}
                    <Table.Column
                        title={isMobile ? "Opciones" : "Acciones"}
                        fixed="right"
                        render={(_, record: MovimientoFinanciero) => {
                            if (isMobile) {
                                const items: any[] = [
                                    {
                                        key: `ver-ticket-${record.id}`,
                                        label: record.ticket_url ? "Ver comprobante" : "Sin comprobante",
                                        disabled: !record.ticket_url,
                                        onClick: () => record.ticket_url && window.open(record.ticket_url, "_blank"),
                                    },
                                    {
                                        key: `reimprimir-ticket-${record.id}`,
                                        label: "Reimprimir comprobante",
                                        disabled: !record.ticket_url,
                                        onClick: () => record.ticket_url && handleReimprimirComprobante(record.ticket_url),
                                    },
                                    {
                                        key: `enviar-ticket-${record.id}`,
                                        label: "Enviar por WhatsApp",
                                        disabled: !record.ticket_url,
                                        onClick: () => handleEnviarComprobanteWhatsapp(record),
                                    },
                                    {
                                        key: `regenerar-ticket-${record.id}`,
                                        label: "Regenerar ticket",
                                        onClick: () => void handleRegenerarComprobante(record),
                                    },
                                ];

                                if (user?.rol === "admin") {
                                    items.push({ type: "divider" as const });
                                    items.push({
                                        key: `eliminar-${record.id}`,
                                        label: "Eliminar",
                                        danger: true,
                                        onClick: () => void handleEliminar(record.id),
                                    });
                                }

                                return (
                                    <Dropdown trigger={["click"]} menu={{ items }}>
                                        <Button size="small" icon={<EllipsisOutlined />} />
                                    </Dropdown>
                                );
                            }

                            return user?.rol === "admin" ? (
                                <Popconfirm
                                    title="Eliminar movimiento"
                                    description="Esta acción no se puede deshacer. ¿Deseas continuar?"
                                    okText="Sí, eliminar"
                                    cancelText="Cancelar"
                                    onConfirm={() => void handleEliminar(record.id)}
                                >
                                    <Button size="small" danger icon={<DeleteOutlined />} />
                                </Popconfirm>
                            ) : null;
                        }}
                    />
                </Table>
            )}

            <Drawer
                title="Registrar movimiento"
                width={isMobile ? "100%" : isTablet ? 400 : 480}
                open={drawerVisible}
                onClose={() => {
                    if (registrando) return;
                    setDrawerVisible(false);
                }}
                destroyOnClose
                placement={isMobile ? "bottom" : "right"}
                height={isMobile ? "95%" : undefined}
                extra={
                    <Space>
                        <Button onClick={() => setDrawerVisible(false)} disabled={registrando}>
                            Cerrar
                        </Button>
                        <Button type="primary" icon={<SaveOutlined />} loading={registrando} onClick={() => void handleRegistrarMovimiento()}>
                            Guardar
                        </Button>
                    </Space>
                }
            >
                <Form form={form} layout="vertical" initialValues={{ tipo: MOVIMIENTO_TIPO.INGRESO, fecha: dayjs(), metodo_pago: "efectivo" }}>
                    <Form.Item
                        label="Tipo de movimiento"
                        name="tipo"
                        rules={[{ required: true, message: "Selecciona el tipo" }]}
                    >
                        <Select
                            options={[
                                { label: MOVIMIENTO_TIPO_LABEL[MOVIMIENTO_TIPO.INGRESO], value: MOVIMIENTO_TIPO.INGRESO },
                                { label: MOVIMIENTO_TIPO_LABEL[MOVIMIENTO_TIPO.EGRESO], value: MOVIMIENTO_TIPO.EGRESO },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item
                        label="Fecha"
                        name="fecha"
                        rules={[{ required: true, message: "Selecciona la fecha" }]}
                    >
                        <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
                    </Form.Item>
                    <Form.Item
                        label="Concepto"
                        name="concepto"
                        rules={[{ required: true, message: "Ingresa el concepto" }]}
                    >
                        <Input placeholder="Descripción del movimiento" />
                    </Form.Item>
                    <Form.Item label="Categoría" name="categoria">
                        <Select
                            allowClear
                            placeholder="Selecciona una categoría"
                            options={MOVIMIENTO_CATEGORIAS.map((cat) => ({ label: cat, value: cat }))}
                        />
                    </Form.Item>
                    <Form.Item
                        label="Monto"
                        name="monto"
                        rules={[{ required: true, message: "Ingresa el monto" }]}
                    >
                        <InputNumber<number>
                            min={0}
                            style={{ width: "100%" }}
                            formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                            parser={(value) => Number(value?.replace(/\./g, "")) || 0}
                            addonBefore={<DollarCircleOutlined />}
                        />
                    </Form.Item>
                    <Form.Item
                        label="Método de pago"
                        name="metodo_pago"
                        rules={[{ required: true, message: "Selecciona el método de pago" }]}
                    >
                        <Select
                            placeholder="Selecciona método de pago"
                            options={[
                                { label: "Efectivo", value: "efectivo" },
                                { label: "Transferencia", value: "transferencia" },
                                { label: "Tarjeta", value: "tarjeta" },
                                { label: "Nequi", value: "nequi" },
                                { label: "QR", value: "qr" },
                                { label: "Otro", value: "otro" },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item label="Referencia" name="referencia">
                        <Input placeholder="Número de recibo, comprobante, etc." />
                    </Form.Item>
                    <Form.Item label="Descripción" name="descripcion">
                        <Input.TextArea rows={3} placeholder="Detalle adicional" />
                    </Form.Item>
                </Form>
            </Drawer>
        </List>
    );
}
