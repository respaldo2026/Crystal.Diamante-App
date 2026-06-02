"use client";

import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Grid,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  GiftOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { normalizeModalidadPago } from "@/types/payment-plans";
import { getMontoProgramado, getVisiblePaymentStatus } from "@utils/payment-balances";
import { construirNombreGrupo } from "@utils/grupos";

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

type FiltroPeriodo = "mes_actual" | "mes_anterior" | "trimestre_actual" | "personalizado";

type KitRow = {
  key: string;
  programaId: string;
  programaNombre: string;
  estudianteNombre: string;
  estudianteTelefono: string;
  grupoNombre: string;
  planLabel: string;
  cicloKit: string;
  ultimoPagoFecha: string | null;
  ultimoPagoPeriodo: string;
  ultimoPagoMonto: number;
  proximoPagoFecha: string | null;
  proximoPagoPeriodo: string;
  proximoPagoMonto: number;
  estadoPagoLabel: string;
  estadoPagoColor: "green" | "orange" | "red" | "default";
  puedeRecibirKit: boolean;
  pagoEnPeriodo: boolean;
  vencido: boolean;
};

type PensumRow = {
  id: string;
  programa_id: number | string;
  numero_ciclo?: number | null;
  nombre_ciclo?: string | null;
  orden?: number | null;
};

type MaterialCicloRow = {
  id: string;
  programa_id: number | string;
  pensum_id: string;
  nombre: string;
  cantidad?: string | null;
  cobertura_material?: string | null;
  incluido_kit?: boolean | null;
  orden?: number | null;
  activo?: boolean | null;
};

const formatoCOP = (valor: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(valor || 0);

const esPagoInscripcion = (pago: any) => {
  const numero = Number(pago?.numero_cuota || 0);
  const periodo = String(pago?.periodo_pagado || "").toLowerCase();
  return numero === 0 || periodo.includes("inscrip") || periodo.includes("matric");
};

const parseNumeroDesdeTexto = (value?: string | null): number | null => {
  const raw = String(value || "");
  const match = raw.match(/\d+/);
  if (!match) return null;
  const numero = Number(match[0]);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
};

const parseCantidadNumerica = (value?: string | null): number | null => {
  if (!value) return null;
  const normalized = String(value)
    .replace(/,/g, ".")
    .replace(/\s+/g, " ")
    .trim();
  const match = normalized.match(/\d+(\.\d+)?/);
  if (!match) return null;
  const numero = Number(match[0]);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
};

const obtenerRangoPeriodo = (
  filtroPeriodo: FiltroPeriodo,
  rangoPersonalizado: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null,
) => {
  const hoy = dayjs();

  if (filtroPeriodo === "personalizado" && rangoPersonalizado?.[0] && rangoPersonalizado?.[1]) {
    return {
      inicio: rangoPersonalizado[0].startOf("day"),
      fin: rangoPersonalizado[1].endOf("day"),
      etiqueta: `${rangoPersonalizado[0].format("DD/MM/YYYY")} - ${rangoPersonalizado[1].format("DD/MM/YYYY")}`,
    };
  }

  if (filtroPeriodo === "mes_anterior") {
    const mesAnterior = hoy.subtract(1, "month");
    return {
      inicio: mesAnterior.startOf("month"),
      fin: mesAnterior.endOf("month"),
      etiqueta: mesAnterior.format("MMMM YYYY"),
    };
  }

  if (filtroPeriodo === "trimestre_actual") {
    const q = Math.floor(hoy.month() / 3);
    const inicio = hoy.month(q * 3).startOf("month");
    const fin = hoy.month(q * 3 + 2).endOf("month");
    return {
      inicio,
      fin,
      etiqueta: `T${q + 1} ${hoy.year()}`,
    };
  }

  return {
    inicio: hoy.startOf("month"),
    fin: hoy.endOf("month"),
    etiqueta: hoy.format("MMMM YYYY"),
  };
};

export default function KitMensualPage() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtroGrupo, setFiltroGrupo] = useState<string | null>(null);
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>("mes_actual");
  const [rangoPersonalizado, setRangoPersonalizado] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  const [gruposDisponibles, setGruposDisponibles] = useState<Array<{ value: string; label: string }>>([]);
  const [rows, setRows] = useState<KitRow[]>([]);
  const [pensumRows, setPensumRows] = useState<PensumRow[]>([]);
  const [materialesCicloRows, setMaterialesCicloRows] = useState<MaterialCicloRow[]>([]);
  const [cicloImpresion, setCicloImpresion] = useState<string>("todos");
  const [alcanceImpresion, setAlcanceImpresion] = useState<"entregables" | "todos">("entregables");

  const periodo = useMemo(() => obtenerRangoPeriodo(filtroPeriodo, rangoPersonalizado), [filtroPeriodo, rangoPersonalizado]);

  useEffect(() => {
    const cargarGrupos = async () => {
      const { data, error: cursosError } = await supabaseBrowserClient
        .from("cursos")
        .select("id, nombre, dias_semana, hora_inicio, programas(nombre)")
        .order("nombre", { ascending: true });

      if (cursosError) {
        console.warn("No se pudieron cargar grupos para kit mensual", cursosError);
        return;
      }

      const options = (data || []).map((curso: any) => ({
        value: String(curso.id),
        label: construirNombreGrupo(curso),
      }));

      setGruposDisponibles(options);
    };

    void cargarGrupos();
  }, []);

  useEffect(() => {
    const cargarEstadoKit = async () => {
      try {
        setLoading(true);
        setError(null);

        let queryMatriculas = supabaseBrowserClient
          .from("matriculas")
          .select("id, estado, fecha_inicio, modalidad_pago, porcentaje_productos, estudiante_id, curso_id, perfiles!matriculas_estudiante_id_fkey(id, nombre_completo, telefono), cursos(id, nombre, programa_id, dias_semana, hora_inicio, programas(id, nombre))")
          .order("fecha_inicio", { ascending: false });

        if (filtroGrupo) {
          queryMatriculas = queryMatriculas.eq("curso_id", filtroGrupo);
        }

        const { data: matriculasData, error: matriculasError } = await queryMatriculas;
        if (matriculasError) throw matriculasError;

        const matriculasMensuales = (matriculasData || []).filter((m: any) => {
          const modalidad = normalizeModalidadPago(m?.modalidad_pago);
          const estado = String(m?.estado || "").toLowerCase();
          const esInactiva = ["cancelado", "cancelada", "retirado", "retirada", "anulado", "anulada"].includes(estado);
          return modalidad !== "POR_CLASE" && !esInactiva;
        });

        if (matriculasMensuales.length === 0) {
          setRows([]);
          setPensumRows([]);
          setMaterialesCicloRows([]);
          return;
        }

        const matriculaIds = matriculasMensuales.map((m: any) => String(m.id));
        const programaIds = Array.from(
          new Set(
            matriculasMensuales
              .map((m: any) => {
                const curso = Array.isArray(m?.cursos) ? m.cursos[0] : m?.cursos;
                const programaId = curso?.programa_id ?? (Array.isArray(curso?.programas) ? curso.programas[0]?.id : curso?.programas?.id);
                return programaId ? String(programaId) : "";
              })
              .filter(Boolean),
          ),
        );

        let pensumData: PensumRow[] = [];
        let materialesCicloData: MaterialCicloRow[] = [];

        if (programaIds.length > 0) {
          const { data: pensumRes, error: pensumError } = await supabaseBrowserClient
            .from("pensum")
            .select("id, programa_id, numero_ciclo, nombre_ciclo, orden")
            .in("programa_id", programaIds)
            .order("programa_id", { ascending: true })
            .order("orden", { ascending: true, nullsFirst: false })
            .order("numero_ciclo", { ascending: true, nullsFirst: false });

          if (pensumError) {
            console.warn("No se pudo cargar pensum para materiales por ciclo", pensumError);
          } else {
            pensumData = (pensumRes || []) as PensumRow[];
          }

          const pensumIds = pensumData.map((p) => String(p.id)).filter(Boolean);
          if (pensumIds.length > 0) {
            const { data: materialesRes, error: materialesError } = await supabaseBrowserClient
              .from("materiales_ciclo")
              .select("id, programa_id, pensum_id, nombre, cantidad, cobertura_material, incluido_kit, orden, activo")
              .in("pensum_id", pensumIds)
              .order("programa_id", { ascending: true })
              .order("pensum_id", { ascending: true })
              .order("orden", { ascending: true, nullsFirst: false });

            if (materialesError) {
              console.warn("No se pudo cargar materiales_ciclo", materialesError);
            } else {
              materialesCicloData = ((materialesRes || []) as MaterialCicloRow[]).filter((m) => m?.activo !== false);
            }
          }
        }

        setPensumRows(pensumData);
        setMaterialesCicloRows(materialesCicloData);

        const { data: pagosData, error: pagosError } = await supabaseBrowserClient
          .from("pagos")
          .select("id, matricula_id, estado, fecha_pago, fecha_vencimiento, numero_cuota, periodo_pagado, monto, monto_programado, total_abonado, saldo_pendiente, descuento_aplicado")
          .in("matricula_id", matriculaIds)
          .order("fecha_vencimiento", { ascending: true, nullsFirst: false });

        if (pagosError) throw pagosError;

        const pagosPorMatricula = new Map<string, any[]>();
        (pagosData || []).forEach((p: any) => {
          const key = String(p?.matricula_id || "");
          if (!key) return;
          const arr = pagosPorMatricula.get(key) || [];
          arr.push(p);
          pagosPorMatricula.set(key, arr);
        });

        const inicio = periodo.inicio;
        const fin = periodo.fin;
        const hoy = dayjs().endOf("day");

        const dataRows: KitRow[] = matriculasMensuales.map((m: any) => {
          const perfil = Array.isArray(m?.perfiles) ? m.perfiles[0] : m?.perfiles;
          const curso = Array.isArray(m?.cursos) ? m.cursos[0] : m?.cursos;
          const programa = Array.isArray(curso?.programas) ? curso.programas[0] : curso?.programas;
          const modalidad = normalizeModalidadPago(m?.modalidad_pago);
          const planLabel = modalidad === "MENSUAL_100" ? "Mensual 100" : "Mensual 70";

          const pagosMatricula = (pagosPorMatricula.get(String(m.id)) || []).filter((p: any) => !esPagoInscripcion(p));

          const pagosPagados = pagosMatricula
            .filter((p: any) => String(p?.estado || "").toLowerCase() === "pagado")
            .sort((a: any, b: any) => dayjs(b?.fecha_pago || 0).valueOf() - dayjs(a?.fecha_pago || 0).valueOf());

          const ultimoPago = pagosPagados[0] || null;

          const pagosPendientes = pagosMatricula
            .filter((p: any) => String(p?.estado || "").toLowerCase() !== "pagado")
            .sort((a: any, b: any) => {
              const fa = dayjs(a?.fecha_vencimiento || "9999-12-31").valueOf();
              const fb = dayjs(b?.fecha_vencimiento || "9999-12-31").valueOf();
              return fa - fb;
            });

          const proximoPago = pagosPendientes[0] || null;

          const pagoEnPeriodo = pagosPagados.some((p: any) => {
            if (!p?.fecha_pago) return false;
            const fp = dayjs(p.fecha_pago);
            return fp.isBetween(inicio, fin, "day", "[]");
          });

          const proximoVencido = Boolean(
            proximoPago?.fecha_vencimiento && dayjs(proximoPago.fecha_vencimiento).endOf("day").isBefore(hoy),
          );

          let estadoPagoLabel: KitRow["estadoPagoLabel"] = "Sin programación";
          let estadoPagoColor: KitRow["estadoPagoColor"] = "default";

          if (pagoEnPeriodo) {
            estadoPagoLabel = "Pagó en el período";
            estadoPagoColor = "green";
          } else if (proximoVencido) {
            estadoPagoLabel = "Pendiente vencido";
            estadoPagoColor = "red";
          } else if (proximoPago) {
            estadoPagoLabel = "Pendiente por pagar";
            estadoPagoColor = "orange";
          }

          return {
            key: String(m.id),
            programaId: String(curso?.programa_id ?? programa?.id ?? ""),
            programaNombre: String(programa?.nombre || "Programa"),
            estudianteNombre: String(perfil?.nombre_completo || "Estudiante"),
            estudianteTelefono: String(perfil?.telefono || ""),
            grupoNombre: construirNombreGrupo(curso),
            planLabel,
            cicloKit: String(
              (pagoEnPeriodo
                ? (ultimoPago?.periodo_pagado || (Number.isFinite(Number(ultimoPago?.numero_cuota)) ? `Cuota ${ultimoPago?.numero_cuota}` : "-"))
                : (proximoPago?.periodo_pagado || (Number.isFinite(Number(proximoPago?.numero_cuota)) ? `Cuota ${proximoPago?.numero_cuota}` : "-"))) || "-"
            ),
            ultimoPagoFecha: ultimoPago?.fecha_pago || null,
            ultimoPagoPeriodo: String(
              ultimoPago?.periodo_pagado ||
              (Number.isFinite(Number(ultimoPago?.numero_cuota)) ? `Cuota ${ultimoPago?.numero_cuota}` : "-")
            ),
            ultimoPagoMonto: Number(ultimoPago?.monto || getMontoProgramado(ultimoPago || {}) || 0),
            proximoPagoFecha: proximoPago?.fecha_vencimiento || null,
            proximoPagoPeriodo: String(
              proximoPago?.periodo_pagado ||
              (Number.isFinite(Number(proximoPago?.numero_cuota)) ? `Cuota ${proximoPago?.numero_cuota}` : "-")
            ),
            proximoPagoMonto: Number(getMontoProgramado(proximoPago || {}) || proximoPago?.monto || 0),
            estadoPagoLabel,
            estadoPagoColor,
            puedeRecibirKit: pagoEnPeriodo,
            pagoEnPeriodo,
            vencido: proximoVencido || (proximoPago ? getVisiblePaymentStatus(proximoPago) === "vencido" : false),
          };
        });

        setRows(dataRows.sort((a, b) => Number(b.puedeRecibirKit) - Number(a.puedeRecibirKit)));
      } catch (err: any) {
        console.error("Error cargando estado de kit mensual", err);
        setError(err?.message || "No se pudo cargar el estado de kit mensual");
      } finally {
        setLoading(false);
      }
    };

    void cargarEstadoKit();
  }, [filtroGrupo, periodo]);

  const totalEstudiantes = rows.length;
  const puedeKit = rows.filter((r) => r.puedeRecibirKit).length;
  const bloqueados = rows.filter((r) => !r.puedeRecibirKit).length;
  const vencidos = rows.filter((r) => r.vencido).length;

  const ciclosDisponiblesImpresion = useMemo(() => {
    const items = Array.from(new Set(rows.map((r) => String(r.cicloKit || "-")).filter((c) => c && c !== "-")));
    return items.sort((a, b) => {
      const na = Number((a.match(/\d+/) || ["9999"])[0]);
      const nb = Number((b.match(/\d+/) || ["9999"])[0]);
      if (na !== nb) return na - nb;
      return a.localeCompare(b, "es");
    });
  }, [rows]);

  const rowsParaImpresion = useMemo(() => {
    return rows.filter((r) => {
      if (alcanceImpresion === "entregables" && !r.puedeRecibirKit) return false;
      if (cicloImpresion !== "todos" && r.cicloKit !== cicloImpresion) return false;
      return true;
    });
  }, [alcanceImpresion, cicloImpresion, rows]);

  const materialesPorBloqueImpresion = useMemo(() => {
    type Bloque = {
      key: string;
      ciclo: string;
      programaId: string;
      programaNombre: string;
      kits: number;
      materiales: MaterialCicloRow[];
    };

    const byKey = new Map<string, Bloque>();

    rowsParaImpresion.forEach((row) => {
      const ciclo = String(row.cicloKit || "-");
      if (!ciclo || ciclo === "-") return;

      const numeroCiclo = parseNumeroDesdeTexto(ciclo);
      if (!numeroCiclo) return;

      const pensum = (pensumRows || []).find((p) => {
        const samePrograma = String(p?.programa_id || "") === String(row.programaId || "");
        if (!samePrograma) return false;
        const nCiclo = Number(p?.numero_ciclo || 0);
        const orden = Number(p?.orden || 0);
        return nCiclo === numeroCiclo || orden === numeroCiclo;
      });

      if (!pensum?.id) return;

      const key = `${row.programaId}|${ciclo}`;
      const existing = byKey.get(key);

      const materiales = (materialesCicloRows || [])
        .filter((m) => String(m?.pensum_id || "") === String(pensum.id))
        .sort((a, b) => Number(a?.orden || 9999) - Number(b?.orden || 9999));

      if (!existing) {
        byKey.set(key, {
          key,
          ciclo,
          programaId: String(row.programaId || ""),
          programaNombre: String(row.programaNombre || "Programa"),
          kits: 1,
          materiales,
        });
      } else {
        existing.kits += 1;
      }
    });

    return Array.from(byKey.values()).sort((a, b) => {
      const pa = a.programaNombre.localeCompare(b.programaNombre, "es");
      if (pa !== 0) return pa;
      const na = Number((a.ciclo.match(/\d+/) || ["9999"])[0]);
      const nb = Number((b.ciclo.match(/\d+/) || ["9999"])[0]);
      if (na !== nb) return na - nb;
      return a.ciclo.localeCompare(b.ciclo, "es");
    });
  }, [materialesCicloRows, pensumRows, rowsParaImpresion]);

  const imprimirChecklist = () => {
    window.print();
  };

  return (
    <div style={{ padding: isMobile ? 12 : 20 }}>
      <style>{`
        .print-only { display: none; }

        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }

          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            width: 80mm;
            background: #fff !important;
          }

          body * {
            visibility: hidden;
          }

          .print-only,
          .print-only * {
            visibility: visible;
          }

          .no-print { display: none !important; }
          .print-only {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
            padding: 3mm;
            box-sizing: border-box;
          }

          .print-checklist {
            color: #111;
            font-family: Arial, sans-serif;
            font-size: 11px;
            line-height: 1.25;
          }

          .print-checklist h1 {
            margin: 0 0 4px 0;
            font-size: 14px;
          }

          .print-checklist .meta {
            margin-bottom: 8px;
            font-size: 10px;
          }

          .print-checklist table {
            width: 100%;
            border-collapse: collapse;
          }

          .print-checklist th,
          .print-checklist td {
            border: 1px solid #999;
            padding: 3px;
            vertical-align: top;
            word-break: break-word;
          }

          .print-checklist th {
            background: #f2f2f2;
            font-weight: 700;
          }
        }
      `}</style>

      <div className="no-print">
      <Card
        title={
          <Space>
            <GiftOutlined />
            <Title level={4} style={{ margin: 0 }}>Control Kit Mensual</Title>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Text type="secondary">
          Esta vista solo muestra estudiantes con plan mensual (Mensual 70/100). Puedes imprimir el listado de materiales por ciclo y el checklist de empaque.
        </Text>

        <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
          <Col xs={24} md={10}>
            <Select
              allowClear
              placeholder="Filtrar por grupo"
              style={{ width: "100%" }}
              value={filtroGrupo ?? undefined}
              onChange={(value) => setFiltroGrupo(value ?? null)}
              options={gruposDisponibles}
            />
          </Col>
          <Col xs={24} md={6}>
            <Select
              style={{ width: "100%" }}
              value={filtroPeriodo}
              onChange={(value) => setFiltroPeriodo(value)}
              options={[
                { label: "Mes actual", value: "mes_actual" },
                { label: "Mes anterior", value: "mes_anterior" },
                { label: "Trimestre actual", value: "trimestre_actual" },
                { label: "Rango personalizado", value: "personalizado" },
              ]}
            />
          </Col>
          <Col xs={24} md={8}>
            <RangePicker
              disabled={filtroPeriodo !== "personalizado"}
              value={rangoPersonalizado as any}
              onChange={(value) => setRangoPersonalizado(value as any)}
              style={{ width: "100%" }}
              format="DD/MM/YYYY"
            />
          </Col>
        </Row>

        <div style={{ marginTop: 8 }}>
          <Text type="secondary">Período aplicado: <strong>{periodo.etiqueta}</strong></Text>
        </div>

        <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
          <Col xs={24} md={8}>
            <Select
              style={{ width: "100%" }}
              value={alcanceImpresion}
              onChange={(value) => setAlcanceImpresion(value)}
              options={[
                { label: "Imprimir solo entregables", value: "entregables" },
                { label: "Imprimir todos los estudiantes", value: "todos" },
              ]}
            />
          </Col>
          <Col xs={24} md={10}>
            <Select
              style={{ width: "100%" }}
              value={cicloImpresion}
              onChange={(value) => setCicloImpresion(value)}
              options={[
                { label: "Todos los ciclos visibles", value: "todos" },
                ...ciclosDisponiblesImpresion.map((c) => ({ label: c, value: c })),
              ]}
            />
          </Col>
          <Col xs={24} md={6}>
            <Button type="primary" style={{ width: "100%" }} onClick={imprimirChecklist}>
              Imprimir ticket materiales (80mm)
            </Button>
          </Col>
        </Row>
      </Card>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Estudiantes mensuales" value={totalEstudiantes} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Puede recibir kit" value={puedeKit} valueStyle={{ color: "#15803d" }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="No puede recibir kit" value={bloqueados} valueStyle={{ color: "#b91c1c" }} prefix={<CloseCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Con pagos vencidos" value={vencidos} valueStyle={{ color: "#c2410c" }} prefix={<ClockCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
          <Spin size="large" />
        </div>
      ) : error ? (
        <Alert type="error" message={error} showIcon />
      ) : rows.length === 0 ? (
        <Empty description="No hay estudiantes mensuales para este filtro" />
      ) : (
        <Card>
          <Table
            rowKey="key"
            dataSource={rows}
            size={isMobile ? "small" : "middle"}
            scroll={{ x: 1100 }}
            pagination={{ pageSize: isMobile ? 10 : 15, showSizeChanger: !isMobile }}
          >
            <Table.Column
              title="Estudiante"
              render={(_, record: KitRow) => (
                <Space direction="vertical" size={0}>
                  <Text strong>{record.estudianteNombre}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{record.estudianteTelefono || "Sin teléfono"}</Text>
                </Space>
              )}
            />
            <Table.Column title="Grupo" dataIndex="grupoNombre" />
            <Table.Column title="Plan" dataIndex="planLabel" render={(value: string) => <Tag color="blue">{value}</Tag>} />
            <Table.Column title="Ciclo kit" dataIndex="cicloKit" render={(value: string) => <Text>{value || "-"}</Text>} />
            <Table.Column
              title="Último pago"
              render={(_, record: KitRow) => (
                <Space direction="vertical" size={0}>
                  <Text>{record.ultimoPagoFecha ? dayjs(record.ultimoPagoFecha).format("DD/MM/YYYY") : "Sin pago"}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{record.ultimoPagoPeriodo || "-"}</Text>
                  <Text strong style={{ color: "#15803d" }}>{record.ultimoPagoMonto > 0 ? formatoCOP(record.ultimoPagoMonto) : "-"}</Text>
                </Space>
              )}
            />
            <Table.Column
              title="Próximo pago"
              render={(_, record: KitRow) => (
                <Space direction="vertical" size={0}>
                  <Text>{record.proximoPagoFecha ? dayjs(record.proximoPagoFecha).format("DD/MM/YYYY") : "Sin cuota pendiente"}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{record.proximoPagoPeriodo || "-"}</Text>
                  <Text strong style={{ color: "#b45309" }}>{record.proximoPagoMonto > 0 ? formatoCOP(record.proximoPagoMonto) : "-"}</Text>
                </Space>
              )}
            />
            <Table.Column
              title="Estado de pago"
              render={(_, record: KitRow) => (
                <Tag color={record.estadoPagoColor}>{record.estadoPagoLabel}</Tag>
              )}
            />
            <Table.Column
              title="Entrega kit"
              render={(_, record: KitRow) => (
                record.puedeRecibirKit
                  ? <Tag color="green">Sí, entregar kit</Tag>
                  : <Tag color="red">No entregar kit</Tag>
              )}
            />
          </Table>
        </Card>
      )}
      </div>

      <div className="print-only print-checklist">
        <h1>Materiales por Ciclo</h1>
        <div className="meta">
          <div>Generado: {dayjs().format("DD/MM/YYYY HH:mm")}</div>
        </div>

        <div style={{ marginTop: 8 }}>
          {materialesPorBloqueImpresion.length === 0 ? (
            <div>No hay materiales de ciclo configurados para los filtros actuales.</div>
          ) : (
            materialesPorBloqueImpresion.map((bloque) => (
              <div key={`mat-${bloque.key}`} style={{ marginBottom: 12, breakInside: "avoid" }}>
                <div style={{ marginBottom: 4, fontWeight: 700, fontSize: 11 }}>
                  {bloque.programaNombre} - {bloque.ciclo}
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Descripcion material</th>
                      <th style={{ width: "28mm" }}>Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bloque.materiales.length === 0 ? (
                      <tr>
                        <td colSpan={2}>No hay materiales cargados para este ciclo.</td>
                      </tr>
                    ) : bloque.materiales.map((m, idx) => (
                      <tr key={`${bloque.key}-${m.id}`}>
                        <td>{m.nombre || `Material ${idx + 1}`}</td>
                        <td>
                          {(() => {
                            const cantidadNumerica = parseCantidadNumerica(m?.cantidad);
                            if (!cantidadNumerica) {
                              return m?.cantidad || "-";
                            }
                            return String(cantidadNumerica * bloque.kits);
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
