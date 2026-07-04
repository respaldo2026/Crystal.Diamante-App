
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    Switch,
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
import { abrirTicketPagoDesdeBlob, formatTicketReference, generarTicketPagoBlob } from "@utils/pago-ticket";
import { subirTicketPago } from "@utils/ticket-storage";
import { construirNombreGrupo } from "@utils/grupos";
import {
    listarMovimientos,
    crearMovimiento,
    eliminarMovimiento,
    sincronizarIngresosDesdePagos,
    sincronizarEgresosDesdeSesionesClase,
    type MovimientoFinanciero,
} from "@modules/finanzas/movimientos.service";
import { obtenerCursos, type GrupoAcademico } from "@modules/academico/cursos.service";
import { MOVIMIENTO_CATEGORIAS, MOVIMIENTO_TIPO, MOVIMIENTO_TIPO_COLOR, MOVIMIENTO_TIPO_LABEL } from "@constants/movimientos";
import { normalizeModalidadPago } from "@/types/payment-plans";

const { useBreakpoint } = Grid;

const { Text } = Typography;
const { RangePicker } = DatePicker;

const formatoCOP = (valor: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(valor);

const CATEGORIA_FILTRO_NEGOCIO = {
    MATRICULA: "matricula",
    MENSUALIDAD_PAGO_CLASE: "mensualidad_pago_clase",
    NOMINA: "nomina",
    OTROS: "otros",
} as const;

type CategoriaFiltroNegocio = typeof CATEGORIA_FILTRO_NEGOCIO[keyof typeof CATEGORIA_FILTRO_NEGOCIO];

const FILTRO_CATEGORIA_OPTIONS: Array<{ label: string; value: CategoriaFiltroNegocio }> = [
    { label: "Matrícula / Inscripción", value: CATEGORIA_FILTRO_NEGOCIO.MATRICULA },
    { label: "Mensualidades / Pago clase", value: CATEGORIA_FILTRO_NEGOCIO.MENSUALIDAD_PAGO_CLASE },
    { label: "Nómina", value: CATEGORIA_FILTRO_NEGOCIO.NOMINA },
    { label: "Otros", value: CATEGORIA_FILTRO_NEGOCIO.OTROS },
];

const clasificarCategoriaNegocio = (mov: Pick<MovimientoFinanciero, "tipo" | "categoria" | "concepto" | "descripcion">): CategoriaFiltroNegocio => {
    const categoria = String(mov.categoria || "").toLowerCase().trim();
    const texto = `${String(mov.concepto || "")} ${String(mov.descripcion || "")}`.toLowerCase();

    if (mov.tipo === MOVIMIENTO_TIPO.EGRESO) {
        if (categoria.includes("nomina")) return CATEGORIA_FILTRO_NEGOCIO.NOMINA;
        return CATEGORIA_FILTRO_NEGOCIO.OTROS;
    }

    const esMatricula = /inscrip|matric/.test(categoria) || /inscrip|matric/.test(texto);
    const esMensualidadPagoClase = /mensual|cuota|ciclo\s*mensual|clase\s*#|pago\s*clase|por\s*clase/.test(texto);

    if (esMensualidadPagoClase) return CATEGORIA_FILTRO_NEGOCIO.MENSUALIDAD_PAGO_CLASE;
    if (esMatricula) return CATEGORIA_FILTRO_NEGOCIO.MATRICULA;
    if (categoria.includes("nomina")) return CATEGORIA_FILTRO_NEGOCIO.NOMINA;

    return CATEGORIA_FILTRO_NEGOCIO.OTROS;
};

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
    const [filtroPeriodo, setFiltroPeriodo] = useState<string | null>("mes_actual");
    const [filtroTipo, setFiltroTipo] = useState<string | null>(null);
    const [filtroCategoria, setFiltroCategoria] = useState<string | null>(null);
    const [filtroMetodo, setFiltroMetodo] = useState<string | null>(null);
    const [filtroConciliado, setFiltroConciliado] = useState<string | null>(null);
    const [drawerVisible, setDrawerVisible] = useState(false);
    const [registrando, setRegistrando] = useState(false);
    const [ejecutandoLiquidacion, setEjecutandoLiquidacion] = useState(false);
    const [cursosDisponibles, setCursosDisponibles] = useState<GrupoAcademico[]>([]);
    const [filtroGrupoRentabilidad, setFiltroGrupoRentabilidad] = useState<string | null>(null);
    const [verSoloMovimientosGrupo, setVerSoloMovimientosGrupo] = useState(true);
    const [loadingRelacionGrupo, setLoadingRelacionGrupo] = useState(false);
    const [relacionGrupoMovimientos, setRelacionGrupoMovimientos] = useState<{
        pagoIds: string[];
        pagoAbonoIds: string[];
        sesionesRefs: string[];
    }>({ pagoIds: [], pagoAbonoIds: [], sesionesRefs: [] });
    const [loadingRentabilidadGrupo, setLoadingRentabilidadGrupo] = useState(false);
    const [rentabilidadRefreshTick, setRentabilidadRefreshTick] = useState(0);
    const [rentabilidadGrupo, setRentabilidadGrupo] = useState({
        ingresos: 0,
        egresosNomina: 0,
        ganancia: 0,
        margen: 0,
        cobertura: 0,
    });
    const [form] = Form.useForm();
    const reconciliandoRef = useRef(false);
    const reconciliacionInicialHechaRef = useRef(false);
    const recargaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
                        referencia: formatTicketReference(pago?.referencia || pago?.id, "FAC"),
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

    const reconciliarTesoreria = useCallback(async () => {
        if (reconciliandoRef.current) return;
        reconciliandoRef.current = true;
        try {
            try {
                await sincronizarIngresosDesdePagos(user?.id || null);
            } catch (syncError) {
                console.warn("No se pudo sincronizar ingresos desde pagos al cargar tesorería", syncError);
            }

            try {
                await sincronizarEgresosDesdeSesionesClase(user?.id || null);
            } catch (syncError) {
                console.warn("No se pudo sincronizar egresos de sesiones clase", syncError);
            }

            if (puedeVerTodo) {
                try {
                    const resLimpieza = await fetch("/api/tesoreria/limpiar-duplicados", { method: "POST" });
                    const jsonLimpieza = await resLimpieza.json();
                    if (jsonLimpieza?.eliminados > 0) {
                        message.info(`Se eliminaron ${jsonLimpieza.eliminados} movimientos duplicados`);
                    }
                } catch {
                    // silencioso
                }
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
        } finally {
            reconciliandoRef.current = false;
        }
    }, [generarTicketsFaltantes, puedeVerTodo, user?.id]);

    const cargarMovimientos = useCallback(async (opts?: { reconciliar?: boolean }) => {
        setLoading(true);
        setError(null);
        try {
            const data = await listarMovimientos({}, { userId: user?.id || null, esAdmin: puedeVerTodo });
            setMovimientos(data);
        } catch (err: any) {
            console.error("Error cargando movimientos", err);
            setError(err.message ?? "No se pudieron cargar los movimientos");
        } finally {
            setLoading(false);
        }

        const debeReconciliar = opts?.reconciliar || !reconciliacionInicialHechaRef.current;
        if (debeReconciliar) {
            reconciliacionInicialHechaRef.current = true;
            void reconciliarTesoreria();
        }
    }, [puedeVerTodo, reconciliarTesoreria, user?.id]);

    useEffect(() => {
        void cargarMovimientos({ reconciliar: true });
    }, [cargarMovimientos]);

    useEffect(() => {
        const channel = supabaseBrowserClient
            .channel("tesoreria-live-sync")
            .on("postgres_changes", { event: "*", schema: "public", table: "sesiones_clase" }, () => {
                if (recargaDebounceRef.current) clearTimeout(recargaDebounceRef.current);
                recargaDebounceRef.current = setTimeout(() => {
                    void cargarMovimientos({ reconciliar: false });
                }, 500);
                setRentabilidadRefreshTick((prev) => prev + 1);
            })
            .on("postgres_changes", { event: "*", schema: "public", table: "pagos" }, () => {
                if (recargaDebounceRef.current) clearTimeout(recargaDebounceRef.current);
                recargaDebounceRef.current = setTimeout(() => {
                    void cargarMovimientos({ reconciliar: false });
                }, 500);
                setRentabilidadRefreshTick((prev) => prev + 1);
            })
            .on("postgres_changes", { event: "*", schema: "public", table: "perfiles" }, () => {
                setRentabilidadRefreshTick((prev) => prev + 1);
            })
            .subscribe();

        return () => {
            if (recargaDebounceRef.current) {
                clearTimeout(recargaDebounceRef.current);
                recargaDebounceRef.current = null;
            }
            supabaseBrowserClient.removeChannel(channel);
        };
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

    const rangoPeriodoSeleccionado = useMemo(() => {
        if (filtroRango && filtroRango[0] && filtroRango[1]) {
            return {
                inicio: filtroRango[0].startOf("day"),
                fin: filtroRango[1].endOf("day"),
            };
        }

        if (filtroMes) {
            return {
                inicio: filtroMes.startOf("month"),
                fin: filtroMes.endOf("month"),
            };
        }

        const hoy = dayjs();
        const periodo = filtroPeriodo || "mes_actual";
        if (periodo === "hoy") {
            return { inicio: hoy.startOf("day"), fin: hoy.endOf("day") };
        }
        if (periodo === "semana_actual") {
            return { inicio: hoy.startOf("week"), fin: hoy.endOf("week") };
        }
        if (periodo === "mes_actual") {
            return { inicio: hoy.startOf("month"), fin: hoy.endOf("month") };
        }
        if (periodo === "mes_anterior") {
            const mesAnterior = hoy.subtract(1, "month");
            return { inicio: mesAnterior.startOf("month"), fin: mesAnterior.endOf("month") };
        }
        if (periodo === "trimestre_actual") {
            const q = Math.floor(hoy.month() / 3);
            return { inicio: hoy.month(q * 3).startOf("month"), fin: hoy.month(q * 3 + 2).endOf("month") };
        }
        if (periodo === "semestre_1") {
            return { inicio: hoy.startOf("year"), fin: hoy.month(5).endOf("month") };
        }
        if (periodo === "semestre_2") {
            return { inicio: hoy.month(6).startOf("month"), fin: hoy.endOf("year") };
        }
        if (periodo === "anio_actual") {
            return { inicio: hoy.startOf("year"), fin: hoy.endOf("year") };
        }

        const ant = hoy.subtract(1, "year");
        return { inicio: ant.startOf("year"), fin: ant.endOf("year") };
    }, [filtroMes, filtroPeriodo, filtroRango]);

    useEffect(() => {
        const cargarCursos = async () => {
            try {
                const cursos = await obtenerCursos();
                setCursosDisponibles(cursos);
                const primerCurso = cursos[0];
                if (!filtroGrupoRentabilidad && primerCurso) {
                    setFiltroGrupoRentabilidad(String(primerCurso.id));
                }
            } catch (error) {
                console.warn("No se pudieron cargar cursos para rentabilidad por grupo", error);
            }
        };

        void cargarCursos();
    }, []);

    useEffect(() => {
        const cargarRelacionGrupoMovimientos = async () => {
            if (!filtroGrupoRentabilidad) {
                setRelacionGrupoMovimientos({ pagoIds: [], pagoAbonoIds: [], sesionesRefs: [] });
                return;
            }

            try {
                setLoadingRelacionGrupo(true);

                const { data: pagosGrupo, error: pagosError } = await supabaseBrowserClient
                    .from("pagos")
                    .select("id, pagos_abonos(id), matriculas!inner(curso_id)")
                    .eq("estado", "pagado")
                    .eq("matriculas.curso_id", filtroGrupoRentabilidad);

                if (pagosError) throw pagosError;

                const pagoIds = (pagosGrupo || []).map((p: any) => String(p.id || "")).filter(Boolean);
                const pagoAbonoIds = (pagosGrupo || [])
                    .flatMap((p: any) => (Array.isArray(p?.pagos_abonos) ? p.pagos_abonos : []))
                    .map((ab: any) => String(ab?.id || ""))
                    .filter(Boolean);

                const { data: sesionesGrupo, error: sesionesError } = await supabaseBrowserClient
                    .from("sesiones_clase")
                    .select("id")
                    .eq("curso_id", filtroGrupoRentabilidad);

                if (sesionesError) throw sesionesError;

                const sesionesRefs = (sesionesGrupo || [])
                    .map((s: any) => String(s?.id || ""))
                    .filter(Boolean)
                    .map((id) => `sesion_clase_${id}`);

                setRelacionGrupoMovimientos({ pagoIds, pagoAbonoIds, sesionesRefs });
            } catch (err) {
                console.warn("No se pudo cargar la relación de movimientos por grupo", err);
                setRelacionGrupoMovimientos({ pagoIds: [], pagoAbonoIds: [], sesionesRefs: [] });
            } finally {
                setLoadingRelacionGrupo(false);
            }
        };

        void cargarRelacionGrupoMovimientos();
    }, [filtroGrupoRentabilidad]);

    useEffect(() => {
        const calcularRentabilidadGrupo = async () => {
            if (!filtroGrupoRentabilidad) {
                setRentabilidadGrupo({ ingresos: 0, egresosNomina: 0, ganancia: 0, margen: 0, cobertura: 0 });
                return;
            }

            try {
                setLoadingRentabilidadGrupo(true);
                const inicio = rangoPeriodoSeleccionado.inicio.format("YYYY-MM-DD");
                const fin = rangoPeriodoSeleccionado.fin.format("YYYY-MM-DD");

                const { data: ingresosData, error: ingresosError } = await supabaseBrowserClient
                    .from("pagos")
                    .select("monto, fecha_pago, matriculas!inner(curso_id)")
                    .eq("estado", "pagado")
                    .eq("matriculas.curso_id", filtroGrupoRentabilidad)
                    .gte("fecha_pago", inicio)
                    .lte("fecha_pago", fin);

                if (ingresosError) throw ingresosError;

                const ingresos = (ingresosData || []).reduce((sum: number, p: any) => sum + Number(p?.monto || 0), 0);

                let egresosNomina = 0;
                const { data: sesionesConPerfil, error: sesionesPerfilError } = await supabaseBrowserClient
                    .from("sesiones_clase")
                    .select("fecha, horas_dictadas, profesor_id, perfiles!sesiones_clase_profesor_id_fkey(valor_hora)")
                    .eq("curso_id", filtroGrupoRentabilidad)
                    .gte("fecha", inicio)
                    .lte("fecha", fin)
                    .gt("horas_dictadas", 0);

                if (!sesionesPerfilError) {
                    egresosNomina = (sesionesConPerfil || []).reduce((sum: number, s: any) => {
                        const horas = Number(s?.horas_dictadas || 0);
                        const valorHora = Number(s?.perfiles?.valor_hora || 0);
                        return sum + (horas * valorHora);
                    }, 0);
                } else {
                    const { data: sesionesBase, error: sesionesBaseError } = await supabaseBrowserClient
                        .from("sesiones_clase")
                        .select("profesor_id, horas_dictadas")
                        .eq("curso_id", filtroGrupoRentabilidad)
                        .gte("fecha", inicio)
                        .lte("fecha", fin)
                        .gt("horas_dictadas", 0);

                    if (sesionesBaseError) throw sesionesBaseError;

                    const profesorIds = Array.from(
                        new Set((sesionesBase || []).map((s: any) => String(s?.profesor_id || "")).filter(Boolean))
                    );

                    let valorHoraPorProfesor = new Map<string, number>();
                    if (profesorIds.length > 0) {
                        const { data: perfilesData, error: perfilesError } = await supabaseBrowserClient
                            .from("perfiles")
                            .select("id, valor_hora")
                            .in("id", profesorIds);

                        if (perfilesError) throw perfilesError;

                        valorHoraPorProfesor = new Map(
                            (perfilesData || []).map((p: any) => [String(p.id), Number(p.valor_hora || 0)])
                        );
                    }

                    egresosNomina = (sesionesBase || []).reduce((sum: number, s: any) => {
                        const horas = Number(s?.horas_dictadas || 0);
                        const valorHora = valorHoraPorProfesor.get(String(s?.profesor_id || "")) || 0;
                        return sum + (horas * valorHora);
                    }, 0);
                }

                const ganancia = ingresos - egresosNomina;
                const margen = ingresos > 0 ? Math.round((ganancia / ingresos) * 100) : 0;
                const cobertura = egresosNomina > 0 ? Math.round((ingresos / egresosNomina) * 100) : 100;

                setRentabilidadGrupo({ ingresos, egresosNomina, ganancia, margen, cobertura });
            } catch (rentErr: any) {
                console.warn("No se pudo calcular rentabilidad por grupo", {
                    message: rentErr?.message,
                    code: rentErr?.code,
                    details: rentErr?.details,
                    hint: rentErr?.hint,
                });
                setRentabilidadGrupo({ ingresos: 0, egresosNomina: 0, ganancia: 0, margen: 0, cobertura: 0 });
            } finally {
                setLoadingRentabilidadGrupo(false);
            }
        };

        void calcularRentabilidadGrupo();
    }, [filtroGrupoRentabilidad, rangoPeriodoSeleccionado, rentabilidadRefreshTick]);

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

            if (filtroCategoria) {
                const categoriaNegocio = clasificarCategoriaNegocio(mov);
                if (categoriaNegocio !== filtroCategoria) return false;
            }

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
                } else if (filtroPeriodo === "trimestre_actual") {
                    const q = Math.floor(hoy.month() / 3);
                    inicio = hoy.month(q * 3).startOf("month");
                    fin = hoy.month(q * 3 + 2).endOf("month");
                } else if (filtroPeriodo === "semestre_1") {
                    inicio = hoy.startOf("year");
                    fin = hoy.month(5).endOf("month");
                } else if (filtroPeriodo === "semestre_2") {
                    inicio = hoy.month(6).startOf("month");
                    fin = hoy.endOf("year");
                } else if (filtroPeriodo === "anio_anterior") {
                    const ant = hoy.subtract(1, "year");
                    inicio = ant.startOf("year");
                    fin = ant.endOf("year");
                }

                if (inicio && fin && !fechaMov.isBetween(inicio, fin.add(1, "day"), "day", "[)")) {
                    return false;
                }
            }

            return true;
        });
    }, [busqueda, filtroCategoria, filtroConciliado, filtroMes, filtroMetodo, filtroPeriodo, filtroRango, filtroTipo, movimientos]);

    const movimientosUnicos = useMemo(() => {
        const vistos = new Set<string>();
        return movimientosFiltrados.filter((mov) => {
            const tipo = String(mov.tipo || "").toLowerCase();
            const key =
                tipo === "egreso" && mov.referencia
                    ? `egreso:${mov.referencia}`
                    : tipo === "ingreso" && mov.pago_abono_id
                      ? `ingreso-abono:${mov.pago_abono_id}`
                      : tipo === "ingreso" && mov.pago_id
                        ? `ingreso-pago:${mov.pago_id}`
                        : `id:${mov.id}`;

            if (vistos.has(key)) return false;
            vistos.add(key);
            return true;
        });
    }, [movimientosFiltrados]);

    const movimientosTabla = useMemo(() => {
        if (!verSoloMovimientosGrupo || !filtroGrupoRentabilidad) {
            return movimientosUnicos;
        }

        const pagoIdsSet = new Set(relacionGrupoMovimientos.pagoIds);
        const pagoAbonoIdsSet = new Set(relacionGrupoMovimientos.pagoAbonoIds);
        const sesionesRefsSet = new Set(relacionGrupoMovimientos.sesionesRefs);

        return movimientosUnicos.filter((mov) => {
            const tipo = String(mov.tipo || "").toLowerCase();

            if (tipo === "ingreso") {
                if (mov.pago_abono_id) {
                    return pagoAbonoIdsSet.has(String(mov.pago_abono_id));
                }
                if (mov.pago_id) {
                    return pagoIdsSet.has(String(mov.pago_id));
                }
                return false;
            }

            if (tipo === "egreso") {
                const ref = String(mov.referencia || "");
                if (!ref.startsWith("sesion_clase_")) return false;
                return sesionesRefsSet.has(ref);
            }

            return false;
        });
    }, [filtroGrupoRentabilidad, movimientosUnicos, relacionGrupoMovimientos, verSoloMovimientosGrupo]);

    const totalIngresos = useMemo(
        () => movimientosUnicos.filter((m) => m.tipo === MOVIMIENTO_TIPO.INGRESO).reduce((acc, mov) => acc + Number(mov.monto || 0), 0),
        [movimientosUnicos]
    );

    const totalEgresos = useMemo(
        () => movimientosUnicos.filter((m) => m.tipo === MOVIMIENTO_TIPO.EGRESO).reduce((acc, mov) => acc + Number(mov.monto || 0), 0),
        [movimientosUnicos]
    );

    const saldoNeto = useMemo(() => totalIngresos - totalEgresos, [totalIngresos, totalEgresos]);

    const totalIngresosCaja = useMemo(
        () =>
            movimientosUnicos
                .filter(
                    (m) =>
                        m.tipo === MOVIMIENTO_TIPO.INGRESO &&
                        ["matriculas", "inscripciones"].includes(String(m.categoria || "").toLowerCase())
                )
                .reduce((acc, mov) => acc + Number(mov.monto || 0), 0),
        [movimientosUnicos]
    );

    const totalIngresosEfectivo = useMemo(
        () =>
            movimientosUnicos
                .filter(
                    (m) =>
                        m.tipo === MOVIMIENTO_TIPO.INGRESO &&
                        ["matriculas", "inscripciones"].includes(String(m.categoria || "").toLowerCase()) &&
                        String(m.metodo_pago || "").toLowerCase() === "efectivo"
                )
                .reduce((acc, mov) => acc + Number(mov.monto || 0), 0),
        [movimientosUnicos]
    );

    const totalSalidasReales = useMemo(
        () => movimientosUnicos.filter((m) => m.tipo === MOVIMIENTO_TIPO.EGRESO).reduce((acc, mov) => acc + Number(mov.monto || 0), 0),
        [movimientosUnicos]
    );

    const totalSalidasEfectivo = useMemo(
        () =>
            movimientosUnicos
                .filter((m) => m.tipo === MOVIMIENTO_TIPO.EGRESO && String(m.metodo_pago || "").toLowerCase() === "efectivo")
                .reduce((acc, mov) => acc + Number(mov.monto || 0), 0),
        [movimientosUnicos]
    );

    const saldoCajaEfectivo = useMemo(() => totalIngresosEfectivo - totalSalidasEfectivo, [totalIngresosEfectivo, totalSalidasEfectivo]);

    const analisisFinanciero = useMemo(() => {
        const ingresos = movimientosUnicos
            .filter((m) => m.tipo === MOVIMIENTO_TIPO.INGRESO)
            .reduce((acc, m) => acc + Number(m.monto || 0), 0);
        const egresos = movimientosUnicos
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
    }, [movimientosUnicos]);

    const etiquetaPeriodo = useMemo(() => {
        const hoy = dayjs();
        if (filtroRango && filtroRango[0] && filtroRango[1]) {
            return `${filtroRango[0].format("DD/MM/YYYY")} — ${filtroRango[1].format("DD/MM/YYYY")}`;
        }
        if (filtroMes) return filtroMes.format("MMMM YYYY");
        const labels: Record<string, string> = {
            hoy: "Hoy",
            semana_actual: "Esta semana",
            mes_actual: hoy.format("MMMM YYYY"),
            mes_anterior: hoy.subtract(1, "month").format("MMMM YYYY"),
            trimestre_actual: `T${Math.floor(hoy.month() / 3) + 1} ${hoy.year()}`,
            semestre_1: `1er Semestre ${hoy.year()}`,
            semestre_2: `2do Semestre ${hoy.year()}`,
            anio_actual: String(hoy.year()),
            anio_anterior: String(hoy.year() - 1),
        };
        return filtroPeriodo ? (labels[filtroPeriodo] ?? filtroPeriodo) : "Sin filtro de período";
    }, [filtroRango, filtroMes, filtroPeriodo]);

    const filtrosActivosResumen = useMemo(() => {
        const tags: string[] = [];
        tags.push(`Periodo: ${etiquetaPeriodo}`);
        if (filtroTipo) tags.push(`Tipo: ${MOVIMIENTO_TIPO_LABEL[filtroTipo as keyof typeof MOVIMIENTO_TIPO_LABEL] || filtroTipo}`);
        if (filtroCategoria) tags.push(`Categoría: ${filtroCategoria}`);
        if (filtroMetodo) tags.push(`Método: ${filtroMetodo}`);
        if (filtroConciliado) tags.push(`Conciliación: ${filtroConciliado}`);
        if (busqueda.trim()) tags.push(`Texto: "${busqueda.trim()}"`);
        if (filtroGrupoRentabilidad) tags.push("Grupo seleccionado para rentabilidad");
        if (verSoloMovimientosGrupo && filtroGrupoRentabilidad) tags.push("Solo movimientos vinculados al grupo");
        return tags;
    }, [busqueda, etiquetaPeriodo, filtroCategoria, filtroConciliado, filtroGrupoRentabilidad, filtroMetodo, filtroTipo, verSoloMovimientosGrupo]);

    const baseCalculoPuntoEquilibrio = useMemo(() => {
        const ingresosMov = movimientosUnicos.filter((m) => m.tipo === MOVIMIENTO_TIPO.INGRESO);
        const egresosMov = movimientosUnicos.filter((m) => m.tipo === MOVIMIENTO_TIPO.EGRESO);
        return {
            totalRegistros: movimientosUnicos.length,
            ingresosRegistros: ingresosMov.length,
            egresosRegistros: egresosMov.length,
            ingresosMonto: analisisFinanciero.ingresos,
            egresosMonto: analisisFinanciero.egresos,
            cobertura: analisisFinanciero.cobertura,
        };
    }, [analisisFinanciero.cobertura, analisisFinanciero.egresos, analisisFinanciero.ingresos, movimientosUnicos]);

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
        setFiltroPeriodo("mes_actual");
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

            // Sincronizar egresos desde sesiones dictadas
            try {
                const { sincronizados } = await sincronizarEgresosDesdeSesionesClase(user?.id || null);
                if (sincronizados > 0) {
                    message.info(`${sincronizados} clases dictadas registradas como egresos en tesorería`);
                }
            } catch (syncErr) {
                console.warn("No se pudo sincronizar egresos de sesiones", syncErr);
            }

            await cargarMovimientos();
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
                    referencia: formatTicketReference(pago?.referencia || (pago as any)?.abono_id || pago?.id, "FAC"),
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

            {/* ── FILTROS ── */}
            <Card size="small" style={{ marginBottom: 16, borderRadius: 10 }} bodyStyle={{ padding: isMobile ? 10 : 16 }}>
                <Row gutter={[8, 8]} align="middle" wrap>
                    <Col xs={24} sm={10} md={6} lg={4}>
                        <Select
                            allowClear
                            placeholder="Período rápido"
                            value={filtroPeriodo ?? undefined}
                            onChange={(val) => {
                                setFiltroPeriodo(val ?? null);
                                if (val) { setFiltroRango(null); setFiltroMes(null); }
                            }}
                            style={{ width: "100%" }}
                            size="middle"
                            options={[
                                { label: "Hoy", value: "hoy" },
                                { label: "Semana actual", value: "semana_actual" },
                                { label: "Mes actual", value: "mes_actual" },
                                { label: "Mes anterior", value: "mes_anterior" },
                                { label: "Trimestre actual", value: "trimestre_actual" },
                                { label: "Semestre 1 (Ene\u2013Jun)", value: "semestre_1" },
                                { label: "Semestre 2 (Jul\u2013Dic)", value: "semestre_2" },
                                { label: "Este año", value: "anio_actual" },
                                { label: "Año anterior", value: "anio_anterior" },
                            ]}
                        />
                    </Col>
                    <Col xs={12} sm={5} md={3} lg={2}>
                        <DatePicker
                            picker="month"
                            placeholder="Mes"
                            style={{ width: "100%" }}
                            value={filtroMes}
                            onChange={(value) => {
                                setFiltroMes(value);
                                if (value) { setFiltroRango(null); setFiltroPeriodo(null); }
                            }}
                            allowClear
                            size="middle"
                            format="MMM YYYY"
                        />
                    </Col>
                    <Col xs={12} sm={9} md={7} lg={5}>
                        <RangePicker
                            style={{ width: "100%" }}
                            value={filtroRango as any}
                            onChange={(value) => {
                                setFiltroRango(value as any);
                                if (value && (value[0] || value[1])) { setFiltroMes(null); setFiltroPeriodo(null); }
                            }}
                            size="middle"
                            format="DD/MM/YY"
                            placeholder={["Desde", "Hasta"]}
                        />
                    </Col>
                    <Col xs={12} sm={4} md={3} lg={2}>
                        <Select
                            allowClear
                            placeholder="Tipo"
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
                    <Col xs={12} sm={4} md={3} lg={2}>
                        <Select
                            allowClear
                            placeholder="Categoría"
                            value={filtroCategoria ?? undefined}
                            onChange={(val) => setFiltroCategoria(val ?? null)}
                            style={{ width: "100%" }}
                            size="middle"
                            options={FILTRO_CATEGORIA_OPTIONS}
                        />
                    </Col>
                    <Col xs={12} sm={4} md={3} lg={2}>
                        <Select
                            allowClear
                            placeholder="Método"
                            value={filtroMetodo ?? undefined}
                            onChange={(val) => setFiltroMetodo(val ?? null)}
                            style={{ width: "100%" }}
                            size="middle"
                            options={metodosDisponibles.map((metodo) => ({ label: metodo, value: metodo }))}
                        />
                    </Col>
                    <Col xs={12} sm={4} md={3} lg={2}>
                        <Select
                            allowClear
                            placeholder="Conciliación"
                            value={filtroConciliado ?? undefined}
                            onChange={(val) => setFiltroConciliado(val ?? null)}
                            style={{ width: "100%" }}
                            size="middle"
                            options={[
                                { label: "Conciliado", value: "conciliado" },
                                { label: "Pendiente", value: "pendiente" },
                            ]}
                        />
                    </Col>
                    <Col xs={16} sm={8} md={6} lg={4}>
                        <Input
                            placeholder="Buscar concepto..."
                            prefix={<SearchOutlined />}
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            allowClear
                            size="middle"
                        />
                    </Col>
                    <Col xs={8} sm={3} md={2} lg={1}>
                        <Button onClick={resetFiltros} style={{ width: "100%" }} size="middle" title="Limpiar filtros">
                            ✕
                        </Button>
                    </Col>
                    <Col xs={24} sm={24} md={24} lg={4}>
                        <Space size="small" style={{ width: "100%", justifyContent: "flex-end" }}>
                            <Switch
                                checked={verSoloMovimientosGrupo}
                                onChange={setVerSoloMovimientosGrupo}
                                disabled={!filtroGrupoRentabilidad}
                            />
                            <Text style={{ fontSize: 12 }}>Solo grupo</Text>
                            {loadingRelacionGrupo ? <Spin size="small" /> : null}
                        </Space>
                    </Col>
                </Row>
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #e5e7eb" }}>
                    <Space wrap size={[6, 6]}>
                        {filtrosActivosResumen.map((item) => (
                            <Tag key={item} color="blue">{item}</Tag>
                        ))}
                    </Space>
                    <div style={{ marginTop: 8 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            Base del punto de equilibrio: {baseCalculoPuntoEquilibrio.totalRegistros} movimientos ({baseCalculoPuntoEquilibrio.ingresosRegistros} entradas y {baseCalculoPuntoEquilibrio.egresosRegistros} salidas) dentro de los filtros. Se calcula como Entradas {formatoCOP(baseCalculoPuntoEquilibrio.ingresosMonto)} / Salidas {formatoCOP(baseCalculoPuntoEquilibrio.egresosMonto)} = {baseCalculoPuntoEquilibrio.cobertura}%.
                        </Text>
                    </div>
                </div>
            </Card>

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

            <Card
                style={{ marginBottom: 20, borderRadius: 14, border: "1px solid #dbeafe" }}
                bodyStyle={{ padding: isMobile ? 14 : 22 }}
                title={
                    <Space>
                        <RiseOutlined style={{ color: "#2563eb" }} />
                        <span style={{ fontWeight: 700 }}>Rentabilidad por Grupo</span>
                        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 400 }}>— {etiquetaPeriodo}</span>
                    </Space>
                }
            >
                <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
                    <Col xs={24} md={12} lg={10}>
                        <Select
                            allowClear
                            placeholder="Selecciona grupo real"
                            value={filtroGrupoRentabilidad ?? undefined}
                            onChange={(val) => setFiltroGrupoRentabilidad(val ?? null)}
                            options={cursosDisponibles.map((curso) => ({
                                value: String(curso.id),
                                label: (
                                    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
                                        <span style={{ fontWeight: 600 }}>{construirNombreGrupo(curso)}</span>
                                        <span style={{ fontSize: 12, color: "#64748b" }}>
                                            {curso.fecha_inicio ? `Inicio ${dayjs(curso.fecha_inicio).format("DD MMM YYYY")}` : "Sin fecha de inicio"}
                                            {curso.estado ? ` · ${curso.estado}` : ""}
                                        </span>
                                    </div>
                                ),
                            }))}
                            style={{ width: "100%" }}
                        />
                    </Col>
                    <Col xs={24} md={12} lg={14}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            Este cuadro usa el mismo filtro de tiempo de Tesorería y compara Ingresos pagados del grupo vs Egresos de nómina por clases dictadas del grupo.
                        </Text>
                    </Col>
                </Row>

                {loadingRentabilidadGrupo ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: 18 }}>
                        <Spin />
                    </div>
                ) : (
                    <>
                        <Row gutter={[12, 12]}>
                            <Col xs={24} sm={8}>
                                <Card size="small" bordered style={{ background: "#f0fdf4" }}>
                                    <Text type="secondary">Ingresos grupo</Text>
                                    <div style={{ color: "#15803d", fontWeight: 700, fontSize: 22 }}>{formatoCOP(rentabilidadGrupo.ingresos)}</div>
                                </Card>
                            </Col>
                            <Col xs={24} sm={8}>
                                <Card size="small" bordered style={{ background: "#fff1f2" }}>
                                    <Text type="secondary">Egresos nómina grupo</Text>
                                    <div style={{ color: "#b91c1c", fontWeight: 700, fontSize: 22 }}>{formatoCOP(rentabilidadGrupo.egresosNomina)}</div>
                                </Card>
                            </Col>
                            <Col xs={24} sm={8}>
                                <Card size="small" bordered style={{ background: rentabilidadGrupo.ganancia >= 0 ? "#eff6ff" : "#fff7ed" }}>
                                    <Text type="secondary">Rentabilidad grupo</Text>
                                    <div style={{ color: rentabilidadGrupo.ganancia >= 0 ? "#1d4ed8" : "#c2410c", fontWeight: 700, fontSize: 22 }}>
                                        {formatoCOP(rentabilidadGrupo.ganancia)}
                                    </div>
                                    <Text type="secondary">Margen {rentabilidadGrupo.margen}%</Text>
                                </Card>
                            </Col>
                        </Row>

                        <div style={{ marginTop: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                <Text style={{ fontSize: 12 }}>Cobertura (ingresos / egresos nómina)</Text>
                                <Text strong style={{ fontSize: 12, color: rentabilidadGrupo.cobertura >= 100 ? "#15803d" : "#b45309" }}>
                                    {rentabilidadGrupo.cobertura}% {rentabilidadGrupo.cobertura >= 100 ? "✓" : "↓"}
                                </Text>
                            </div>
                            <Progress
                                percent={Math.max(0, Math.min(rentabilidadGrupo.cobertura, 100))}
                                showInfo={false}
                                strokeColor={rentabilidadGrupo.cobertura >= 100 ? "#16a34a" : "#f59e0b"}
                                trailColor="#e5e7eb"
                                size={["100%", 14]}
                            />
                        </div>
                    </>
                )}
            </Card>




            {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                    <Spin size="large" />
                </div>
            ) : error ? (
                <Alert type="error" message={error} showIcon closable />
            ) : (
                <>
                <div style={{ marginBottom: 10, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        Filtro estricto: pagos de matrículas del grupo y sesiones del mismo grupo.
                    </Text>
                </div>
                <Table
                    rowKey="id"
                    dataSource={movimientosTabla}
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
                </>
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
