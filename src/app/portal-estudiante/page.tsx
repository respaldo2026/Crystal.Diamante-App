"use client";

import React, { useEffect, useRef, useState } from "react";
import { logger } from "@utils/logger";
import {
  Tabs,
  Card,
  Table,
  Row,
  Col,
  Statistic,
  Skeleton,
  Alert,
  Progress,
  Button,
  Empty,
  message,
  Tag,
  Divider,
  List,
  Typography,
  Space,
  Dropdown,
  Checkbox,
  Grid
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  BookOutlined,
  FileTextOutlined,
  TrophyOutlined,
  DownloadOutlined,
  WhatsAppOutlined,
  DollarCircleOutlined,
  SafetyCertificateOutlined,
  VideoCameraOutlined,
  FilePdfOutlined,
  ClockCircleOutlined,
  GiftOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { formatDate } from "@utils/date";
import { obtenerPensumPorProgramas, obtenerMaterialesPorProgramas, obtenerMaterialesCicloPorProgramas, obtenerMaterialesClasePorProgramas } from "@modules/academico/pensum.service";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { descargarCertificado as descargarCertificadoPDF } from "@utils/certificate";
import { HistorialEntregas } from "@components/EntregaMaterialModal";

dayjs.locale("es");

const { Title, Text } = Typography;

export default function PortalEstudiante() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [activeTab, setActiveTab] = useState("1");
  const [loading, setLoading] = useState(true);
  const [estudiante, setEstudiante] = useState<any>(null);
  const [asistencias, setAsistencias] = useState<any[]>([]);
  const [calificaciones, setCalificaciones] = useState<any[]>([]);
  const [avancePorCurso, setAvancePorCurso] = useState<any[]>([]);
  const [certificados, setCertificados] = useState<any[]>([]);
  const [pagos, setPagos] = useState<any[]>([]);
  const [pensum, setPensum] = useState<any[]>([]);
  const [materiales, setMateriales] = useState<any[]>([]);
  const [materialesCiclo, setMaterialesCiclo] = useState<any[]>([]);
  const [materialesClase, setMaterialesClase] = useState<any[]>([]);
  const [matriculas, setMatriculas] = useState<any[]>([]);
  const [whatsappAgente, setWhatsappAgente] = useState<string | null>(null);
  const [whatsappAdmisiones, setWhatsappAdmisiones] = useState<string | null>(null);
  const [matriculaRutaId, setMatriculaRutaId] = useState<string | null>(null);
  const [cicloRutaId, setCicloRutaId] = useState<string | null>(null);
  const [temaRutaId, setTemaRutaId] = useState<string | null>(null);
  const [checklistInsumos, setChecklistInsumos] = useState<Record<string, boolean>>({});
  const isFetchingRef = useRef(false);
  const hasFetchedOnceRef = useRef(false);

  const deduplicarLista = <T,>(items: T[], resolverClave: (item: T) => string) => {
    const vistos = new Set<string>();
    const resultado: T[] = [];
    for (const item of items || []) {
      const clave = resolverClave(item);
      if (!clave || vistos.has(clave)) continue;
      vistos.add(clave);
      resultado.push(item);
    }
    return resultado;
  };

  const normalizarTexto = (valor?: string | null) =>
    String(valor || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const parseTemaTituloMaterial = (titulo?: string | null) => {
    const raw = String(titulo || "").trim();
    const match = raw.match(/^\s*(?:\[?tema[:\-]\s*)(.+?)(?:\]|—|–|-|:)\s*(.+)?$/i);
    if (!match) {
      return {
        tema: "",
        tituloLimpio: raw,
      };
    }

    return {
      tema: String(match[1] || "").trim(),
      tituloLimpio: String(match[2] || raw).trim(),
    };
  };

  const normalizarTemaComparacion = (valor?: string | null) =>
    normalizarTexto(valor).replace(/^\d+\s*/, "").trim();

  const obtenerSaludoBienvenida = (genero?: string | null) => {
    const generoNormalizado = String(genero || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (["femenino", "femenina", "mujer"].includes(generoNormalizado)) {
      return "Bienvenida";
    }

    if (["masculino", "masculina", "hombre"].includes(generoNormalizado)) {
      return "Bienvenido";
    }

    return "Te damos la bienvenida";
  };

  const normalizarTelefonoWhatsapp = (valor?: string | null): string | null => {
    if (!valor) return null;

    const texto = String(valor).trim();
    if (!texto) return null;

    const matchWa = texto.match(/wa\.me\/(\d+)/i);
    const base = matchWa?.[1] || texto;
    let digitos = base.replace(/\D/g, "");

    if (!digitos) return null;

    if (digitos.length === 10) {
      digitos = `57${digitos}`;
    }

    return digitos;
  };

  const abrirWhatsapp = (telefono: string | null, mensajeBase: string) => {
    if (!telefono) {
      message.warning("No hay número de WhatsApp configurado");
      return;
    }

    const enlace = `https://wa.me/${telefono}?text=${encodeURIComponent(mensajeBase)}`;
    window.open(enlace, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    if (hasFetchedOnceRef.current || isFetchingRef.current) return;
    cargarDatos();
  }, []);

  useEffect(() => {
    if (!estudiante?.id) return;
    try {
      const key = `portal-checklist-insumos:${estudiante.id}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setChecklistInsumos(parsed);
        }
      }
    } catch (error) {
      logger.error("No se pudo cargar checklist de insumos", error);
    }
  }, [estudiante?.id]);

  useEffect(() => {
    if (!estudiante?.id) return;
    try {
      const key = `portal-checklist-insumos:${estudiante.id}`;
      localStorage.setItem(key, JSON.stringify(checklistInsumos));
    } catch (error) {
      logger.error("No se pudo guardar checklist de insumos", error);
    }
  }, [checklistInsumos, estudiante?.id]);

  useEffect(() => {
    if (!matriculas.length) {
      setMatriculaRutaId(null);
      setCicloRutaId(null);
      setTemaRutaId(null);
      return;
    }

    if (!matriculaRutaId) {
      return;
    }

    const existeMatricula = matriculas.some((m: any) => String(m.id) === String(matriculaRutaId));
    if (!existeMatricula) {
      setMatriculaRutaId(String(matriculas[0].id));
      setCicloRutaId(null);
      setTemaRutaId(null);
    }
  }, [matriculas, matriculaRutaId]);

  const cargarDatos = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      if (!hasFetchedOnceRef.current) {
        setLoading(true);
      }

      const { data: { user }, error: authError } = await supabaseBrowserClient.auth.getUser();
      if (authError || !user) {
        message.error("No autenticado");
        return;
      }

      const { data: perfil, error: errPerfil } = await supabaseBrowserClient
        .from("perfiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (errPerfil || !perfil) {
        message.error("Perfil no encontrado. Contacta a la administración.");
        return;
      }

      setEstudiante(perfil);

      const { data: config } = await supabaseBrowserClient
        .from("configuracion")
        .select("*")
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      const numeroAgente = normalizarTelefonoWhatsapp((config as any)?.whatsapp_agente || (config as any)?.whatsapp || null);
      const numeroAdmisiones = normalizarTelefonoWhatsapp((config as any)?.whatsapp_admisiones || (config as any)?.telefono || (config as any)?.whatsapp || null);

      setWhatsappAgente(numeroAgente);
      setWhatsappAdmisiones(numeroAdmisiones);

      // 1. Cargar Matrículas con Cursos y Programas
      const { data: dataMatriculas } = await supabaseBrowserClient
        .from("matriculas")
        .select(`
          *,
          cursos (
            *,
            programas (*)
          )
        `)
        .eq("estudiante_id", user.id)
        .neq("estado", "cancelado");

      setMatriculas(dataMatriculas || []);

      const matriculaIds = dataMatriculas?.map(m => m.id) || [];
      const programaIds = dataMatriculas?.map(m => m.cursos?.programa_id).filter(Boolean) || [];

      // 2. Cargar Pagos (Independiente de matrículas activas para ver historial completo)
      const { data: dataPagos, error: errPagos } = await supabaseBrowserClient
        .from("pagos")
        .select("*")
        .eq("estudiante_id", user.id)
        .order("fecha_vencimiento", { ascending: true });
      
      if (errPagos) logger.error("Error cargando pagos:", errPagos);

      let pagosFinales = dataPagos || [];

      if (pagosFinales.length === 0 && matriculaIds.length > 0) {
        const { data: pagosPorMatricula, error: errPagosPorMatricula } = await supabaseBrowserClient
          .from("pagos")
          .select("*")
          .in("matricula_id", matriculaIds)
          .order("fecha_vencimiento", { ascending: true });

        if (errPagosPorMatricula) {
          logger.error("Error cargando pagos por matrícula:", errPagosPorMatricula);
        } else {
          pagosFinales = pagosPorMatricula || [];
        }
      }

      setPagos(pagosFinales);

      // 3. Cargar datos relacionados a matrículas activas
      if (matriculaIds.length > 0) {
        // Asistencias
        const { data: dataAsistencias } = await supabaseBrowserClient
          .from("asistencias")
          .select("*, matriculas(id, cursos(nombre))")
          .in("matricula_id", matriculaIds)
          .order("fecha", { ascending: false });
        setAsistencias(dataAsistencias || []);

        // Calificaciones
        const { data: dataCalificaciones } = await supabaseBrowserClient
          .from("calificaciones")
          .select("*, matriculas(id, cursos(nombre))")
          .in("matricula_id", matriculaIds)
          .order("fecha_evaluacion", { ascending: false });
        setCalificaciones(dataCalificaciones || []);
      }

      // 4. Cargar Pensum y Materiales si hay programas
      if (programaIds.length > 0) {
        const pensumData = await obtenerPensumPorProgramas(programaIds);
        setPensum(pensumData);

        const materialesData = await obtenerMaterialesPorProgramas(programaIds);
        const materialesUnicos = deduplicarLista(materialesData || [], (m: any) =>
          (() => {
            const parsed = parseTemaTituloMaterial(m?.titulo);
            const temaKey = normalizarTexto(parsed.tema);
            const tituloKey = normalizarTexto(parsed.tituloLimpio);
            return String(`${m?.programa_id || ''}-${m?.pensum_id || ''}-${temaKey}-${tituloKey}-${normalizarTexto(m?.tipo_material || '')}`);
          })()
        );
        setMateriales(materialesUnicos);

        const materialesCicloData = await obtenerMaterialesCicloPorProgramas(programaIds);
        const materialesCicloUnicos = deduplicarLista(materialesCicloData || [], (m: any) => String(m?.id || ""));
        setMaterialesCiclo(materialesCicloUnicos);

        const materialesClaseData = await obtenerMaterialesClasePorProgramas(programaIds);
        const materialesClaseUnicos = deduplicarLista(materialesClaseData || [], (m: any) =>
          String(`${m?.programa_id || ''}-${m?.pensum_id || ''}-${m?.pensum_curso_id || ''}-${(m?.nombre_material || '').trim().toLowerCase()}-${m?.cantidad || ''}-${(m?.unidad || '').trim().toLowerCase()}-${(m?.observaciones || '').trim().toLowerCase()}`)
        );
        setMaterialesClase(materialesClaseUnicos);
      }

      // 5. Calcular Avance y Certificados
      if (dataMatriculas) {
        const avance = dataMatriculas.map((m: any) => ({
          matriculaId: m.id,
          curso: m.cursos?.nombre,
          programa: m.cursos?.programas?.nombre,
          programaId: m.cursos?.programa_id,
          diasSemana: m.cursos?.dias_semana,
          horaInicio: m.cursos?.hora_inicio,
          horaFin: m.cursos?.hora_fin,
          nota: m.nota_final || 0,
          estado: m.estado_academico
        }));
        setAvancePorCurso(avance);

        const certs = dataMatriculas.filter((m: any) => m.estado_academico === 'aprobado' && m.nota_final >= 70);
        setCertificados(certs);
      }
    } catch (error) {
      logger.error("Error:", error);
      message.error("Error cargando información del portal");
    } finally {
      hasFetchedOnceRef.current = true;
      isFetchingRef.current = false;
      setLoading(false);
    }
  };

  const descargarCertificado = async (matricula: any) => {
    try {
      await descargarCertificadoPDF({
        estudianteName: estudiante?.nombre_completo || "Estudiante",
        courseName: matricula?.cursos?.nombre || "Curso",
        fechaFinalizacion: matricula?.cursos?.fecha_fin || new Date().toISOString(),
        folio: String(matricula?.id || "FOLIO"),
      });
      message.success("Certificado descargado");
    } catch (err: any) {
      logger.error(err);
      message.error("No se pudo descargar el certificado");
    }
  };

  const renderFinanciero = () => {
    const pendientes = pagos.filter(p => p.estado === 'pendiente');
    const realizados = pagos.filter(p => p.estado === 'pagado');

    // Función auxiliar para determinar si está vencido (estrictamente anterior a hoy)
    const isVencido = (fecha: string) => {
      return fecha && dayjs().startOf('day').isAfter(dayjs(fecha));
    };

    return (
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title={<><ClockCircleOutlined /> Próximos Pagos</>} className="shadow-sm">
            {pendientes.length > 0 ? (
              <Table 
                dataSource={pendientes} 
                rowKey="id" 
                pagination={false} 
                size="small"
                scroll={{ x: 560 }}
                columns={[
                  { 
                    title: 'Concepto', 
                    dataIndex: 'periodo_pagado', 
                    render: (t, r: any) => {
                      const vencido = isVencido(r.fecha_vencimiento);
                      const style = !vencido ? { color: '#8c8c8c', fontSize: '13px' } : {};
                      return <span style={style}>{t || `Cuota ${r.numero_cuota}`}</span>;
                    } 
                  },
                  { 
                    title: 'Vence', 
                    dataIndex: 'fecha_vencimiento', 
                    render: (d, r: any) => {
                      const vencido = isVencido(r.fecha_vencimiento);
                      const style = !vencido ? { color: '#8c8c8c', fontSize: '13px' } : {};
                      return <span style={style}>{d ? dayjs(d).format("DD/MM/YYYY") : '-'}</span>;
                    }
                  },
                  { 
                    title: 'Monto', 
                    dataIndex: 'monto', 
                    render: (v, r: any) => {
                      const vencido = isVencido(r.fecha_vencimiento);
                      const style = !vencido ? { color: '#8c8c8c', fontSize: '13px' } : {};
                      return <span style={style}>{`$ ${Number(v).toLocaleString()}`}</span>;
                    }
                  },
                  { 
                    title: 'Estado', 
                    render: (_, r: any) => {
                      const vencido = isVencido(r.fecha_vencimiento);
                      if (vencido) return <Tag color="red">VENCIDO</Tag>;
                      return <Tag style={{ color: '#8c8c8c', borderColor: '#d9d9d9', fontSize: '11px' }}>PENDIENTE</Tag>;
                    } 
                  }
                ]}
              />
            ) : (
              <Alert message="¡Estás al día!" description="No tienes pagos pendientes." type="success" showIcon />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={<><CheckCircleOutlined /> Historial de Pagos</>} className="shadow-sm">
             <Table 
                dataSource={realizados} 
                rowKey="id" 
                pagination={{ pageSize: 5 }} 
                size="small"
               scroll={{ x: 520 }}
                columns={[
                  { title: 'Concepto', dataIndex: 'periodo_pagado', render: (t, r: any) => t || `Cuota ${r.numero_cuota}` },
                  { title: 'Fecha', dataIndex: 'fecha_pago', render: (d) => d ? dayjs(d).format("DD/MM/YYYY") : '-' },
                  { title: 'Monto', dataIndex: 'monto', render: (v) => `$ ${Number(v).toLocaleString()}` },
                  { title: 'Estado', render: () => <Tag color="green">PAGADO</Tag> }
                ]}
              />
          </Card>
        </Col>
      </Row>
    );
  };

  const renderRutaAcademica = (vista: "plan" | "kits" | "ciclo") => {
    if (!matriculas.length) return <Empty description="No tienes cursos activos" />;

    const matriculasActivas = deduplicarLista(
      matriculas.filter((m: any) => m.estado !== "cancelado"),
      (m: any) => String(m?.id)
    );

    const matriculaSeleccionada = matriculasActivas.find((m: any) => String(m.id) === String(matriculaRutaId));

    const tituloPrincipal = vista === "plan"
      ? "Plan de Estudios"
      : vista === "ciclo"
        ? "Materiales del ciclo"
        : "Materiales por clase";

    const StepCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
      <Card title={title} size={isMobile ? "small" : "default"}>
        {children}
      </Card>
    );

    if (!matriculaSeleccionada) {
      return (
        <StepCard title={tituloPrincipal}>
          <Text strong>Selecciona un curso</Text>
          <Row gutter={[10, 10]} style={{ marginTop: 10 }}>
            {matriculasActivas.map((mat: any) => (
              <Col xs={24} sm={12} lg={8} key={mat.id}>
                <Button
                  block
                  onClick={() => {
                    setMatriculaRutaId(String(mat.id));
                    setCicloRutaId(null);
                    setTemaRutaId(null);
                  }}
                >
                  {mat?.cursos?.nombre || `Curso ${mat.id}`}
                </Button>
              </Col>
            ))}
          </Row>
        </StepCard>
      );
    }

    const programaIdSeleccionado = matriculaSeleccionada?.cursos?.programa_id;

    const ciclosPrograma = deduplicarLista(
      pensum.filter((p: any) => p.programa_id === programaIdSeleccionado),
      (ciclo: any) => String(ciclo?.id || `${ciclo?.programa_id || ''}-${ciclo?.nombre_ciclo || ''}-${ciclo?.numero_ciclo || ''}`)
    ).sort((a: any, b: any) => {
      const ordenA = Number(a?.orden ?? a?.numero_ciclo ?? 0);
      const ordenB = Number(b?.orden ?? b?.numero_ciclo ?? 0);
      if (ordenA !== ordenB) return ordenA - ordenB;
      return Number(a?.id || 0) - Number(b?.id || 0);
    });

    const cicloSeleccionado = ciclosPrograma.find((c: any) => String(c.id) === String(cicloRutaId));

    if (!ciclosPrograma.length) {
      return (
        <StepCard title={tituloPrincipal}>
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Button onClick={() => setMatriculaRutaId(null)}>← Volver a cursos</Button>
            <Empty description="Este curso aún no tiene módulos/ciclos configurados" />
          </Space>
        </StepCard>
      );
    }

    if (!cicloSeleccionado) {
      return (
        <StepCard title={tituloPrincipal}>
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Button onClick={() => setMatriculaRutaId(null)}>← Volver a cursos</Button>
            <Text strong>Selecciona un ciclo / módulo</Text>
            <Row gutter={[10, 10]}>
              {ciclosPrograma.map((ciclo: any) => (
                <Col xs={24} sm={12} lg={8} key={ciclo.id}>
                  <Button
                    block
                    onClick={() => {
                      setCicloRutaId(String(ciclo.id));
                      setTemaRutaId(null);
                    }}
                  >
                    {ciclo.nombre_ciclo}
                  </Button>
                </Col>
              ))}
            </Row>
          </Space>
        </StepCard>
      );
    }

    const temasCiclo = deduplicarLista(
      (cicloSeleccionado?.pensum_cursos || []),
      (tema: any) => String(tema?.id || normalizarTexto(tema?.nombre_curso || ""))
    ).sort((a: any, b: any) => {
      const ordenA = Number(a?.orden ?? 0);
      const ordenB = Number(b?.orden ?? 0);
      if (ordenA !== ordenB) return ordenA - ordenB;
      return Number(a?.id || 0) - Number(b?.id || 0);
    });

    const temaSeleccionado = temasCiclo.find((t: any) => String(t.id) === String(temaRutaId));

    if (vista === "ciclo") {
      const materialesCicloPrograma = deduplicarLista(
        materialesCiclo.filter((m: any) => m.programa_id === programaIdSeleccionado),
        (m: any) => String(m?.id || ""),
      );
      const materialesCicloSeleccionado = deduplicarLista(
        materialesCicloPrograma.filter((item: any) => {
          if (!cicloSeleccionado?.id) return false;
          return String(item.pensum_id) === String(cicloSeleccionado.id);
        }),
        (m: any) => String(m?.id || ""),
      );

      return (
        <StepCard title={tituloPrincipal}>
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Space wrap>
              <Button onClick={() => setMatriculaRutaId(null)}>← Cursos</Button>
              <Button onClick={() => setCicloRutaId(null)}>← Ciclos</Button>
            </Space>
            <Text strong>Materiales generales del ciclo</Text>
            {materialesCicloSeleccionado.length === 0 ? (
              <Text type="secondary">No hay materiales generales registrados para este ciclo.</Text>
            ) : (
              <Table
                dataSource={materialesCicloSeleccionado}
                rowKey={(record) => String(record?.id || record?.nombre)}
                size="small"
                pagination={false}
                columns={[
                  {
                    title: "Producto",
                    dataIndex: "nombre",
                    render: (value) => <Text strong>{value}</Text>,
                  },
                  {
                    title: "Cantidad",
                    dataIndex: "cantidad",
                    render: (value) => value || "Cantidad por definir",
                  },
                  {
                    title: "Kit",
                    dataIndex: "incluido_kit",
                    align: "center",
                    render: (value) => (value ? <GiftOutlined style={{ color: "#d81b87" }} /> : null),
                  },
                ]}
              />
            )}
          </Space>
        </StepCard>
      );
    }

    if (!temasCiclo.length) {
      return (
        <StepCard title={tituloPrincipal}>
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Button onClick={() => setCicloRutaId(null)}>← Volver a ciclos</Button>
            <Empty description="Este ciclo aún no tiene temas configurados" />
          </Space>
        </StepCard>
      );
    }

    if (!temaSeleccionado) {
      return (
        <StepCard title={tituloPrincipal}>
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Space wrap>
              <Button onClick={() => setMatriculaRutaId(null)}>← Cursos</Button>
              <Button onClick={() => setCicloRutaId(null)}>← Ciclos</Button>
            </Space>
            <Text strong>Selecciona un tema</Text>
            <Row gutter={[10, 10]}>
              {temasCiclo.map((tema: any) => (
                <Col xs={24} sm={12} lg={8} key={tema.id}>
                  <Button block onClick={() => setTemaRutaId(String(tema.id))}>
                    {tema.nombre_curso}
                  </Button>
                </Col>
              ))}
            </Row>
          </Space>
        </StepCard>
      );
    }

    const materialesPrograma = deduplicarLista(
      materiales.filter((m: any) => m.programa_id === programaIdSeleccionado),
      (m: any) => {
        const parsed = parseTemaTituloMaterial(m?.titulo);
        return String(`${m?.pensum_id || ''}-${normalizarTexto(parsed.tema)}-${normalizarTexto(parsed.tituloLimpio)}-${normalizarTexto(m?.tipo_material || '')}`);
      }
    );

    const materialesClasePrograma = deduplicarLista(
      materialesClase.filter((m: any) => m.programa_id === programaIdSeleccionado),
      (m: any) => String(`${m?.pensum_id || ''}-${m?.pensum_curso_id || ''}-${normalizarTexto(m?.materiales_ciclo?.nombre || m?.nombre_material || '')}-${m?.materiales_ciclo?.cantidad || m?.cantidad || ''}-${normalizarTexto(m?.unidad || '')}`)
    );

    const recursosTema = deduplicarLista(
      materialesPrograma.filter((material: any) => {
        if (!temaSeleccionado) return false;
        if (cicloSeleccionado?.id && material.pensum_id && String(material.pensum_id) !== String(cicloSeleccionado.id)) return false;

        const parsed = parseTemaTituloMaterial(material.titulo);
        const temaMaterial = normalizarTemaComparacion(parsed.tema);
        const temaObjetivo = normalizarTemaComparacion(temaSeleccionado.nombre_curso);
        const tituloLimpio = normalizarTexto(parsed.tituloLimpio);
        const descripcion = normalizarTexto(material.descripcion || "");

        if (!temaObjetivo) return true;
        if (temaMaterial) return temaMaterial === temaObjetivo;
        return tituloLimpio.includes(temaObjetivo) || descripcion.includes(temaObjetivo);
      }),
      (m: any) => {
        const parsed = parseTemaTituloMaterial(m?.titulo);
        return `${normalizarTexto(parsed.tema)}-${normalizarTexto(parsed.tituloLimpio)}-${normalizarTexto(m?.tipo_material || '')}`;
      }
    );

    const insumosTema = deduplicarLista(
      materialesClasePrograma.filter((item: any) => {
        if (!temaSeleccionado) return false;
        if (cicloSeleccionado?.id && item.pensum_id && String(item.pensum_id) !== String(cicloSeleccionado.id)) return false;
        return String(item.pensum_curso_id) === String(temaSeleccionado.id);
      }),
      (m: any) => `${normalizarTexto(m?.materiales_ciclo?.nombre || m?.nombre_material || '')}-${m?.materiales_ciclo?.cantidad || m?.cantidad || ''}-${normalizarTexto(m?.unidad || '')}`
    );

    const toggleChecklist = (insumo: any, checked: boolean) => {
      const key = `${matriculaSeleccionada.id}|${temaSeleccionado?.id || 'sin-tema'}|${insumo.id || normalizarTexto(insumo.nombre_material)}`;
      setChecklistInsumos((prev) => ({
        ...prev,
        [key]: checked,
      }));
    };

    const insumosMarcados = insumosTema.filter((insumo: any) => {
      const key = `${matriculaSeleccionada.id}|${temaSeleccionado?.id || 'sin-tema'}|${insumo.id || normalizarTexto(insumo.nombre_material)}`;
      return Boolean(checklistInsumos[key]);
    }).length;

    const temaActualNombre = temaSeleccionado?.nombre_curso || "Sin tema";

    return (
      <Card
        title={tituloPrincipal}
        size={isMobile ? "small" : "default"}
      >
        <Space wrap style={{ marginBottom: 12 }}>
          <Button onClick={() => setMatriculaRutaId(null)}>Cambiar curso</Button>
          <Button onClick={() => setCicloRutaId(null)}>Cambiar ciclo</Button>
          <Button onClick={() => setTemaRutaId(null)}>Cambiar tema</Button>
        </Space>

        {vista === "kits" && temaSeleccionado ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={`Viendo materiales de la clase: ${temaActualNombre}`}
          />
        ) : null}

        {vista === "plan" ? (
          <Card size={isMobile ? "small" : "default"} title="Material didáctico del tema">
            {recursosTema.length === 0 ? (
              <Text type="secondary">No hay material didáctico asignado a este tema.</Text>
            ) : (
              <List
                size={isMobile ? "small" : "default"}
                dataSource={recursosTema}
                renderItem={(item: any) => {
                  let Icon = FileTextOutlined;
                  if (item.tipo_material === 'video') Icon = VideoCameraOutlined;
                  if (item.tipo_material === 'documento') Icon = FilePdfOutlined;
                  const parsed = parseTemaTituloMaterial(item.titulo);
                  return (
                    <List.Item
                      actions={[
                        <a key={`desc-${item.id}`} href={item.url_archivo} target="_blank" rel="noreferrer">
                          <DownloadOutlined />
                        </a>,
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<Icon />}
                        title={parsed.tituloLimpio || item.titulo}
                        description={item.descripcion || "Sin descripción"}
                      />
                    </List.Item>
                  );
                }}
              />
            )}
          </Card>
        ) : (
          <Card
            size={isMobile ? "small" : "default"}
            title="Productos / materiales necesarios"
            extra={
              <Text type={insumosTema.length > 0 && insumosMarcados === insumosTema.length ? undefined : "secondary"}>
                {insumosMarcados}/{insumosTema.length} listos
              </Text>
            }
          >
            {insumosTema.length === 0 ? (
              <Text type="secondary">No hay productos necesarios registrados para este tema.</Text>
            ) : (
              <List
                size={isMobile ? "small" : "default"}
                dataSource={insumosTema}
                renderItem={(insumo: any) => {
                  const key = `${matriculaSeleccionada.id}|${temaSeleccionado?.id || 'sin-tema'}|${insumo.id || normalizarTexto(insumo.nombre_material)}`;
                  const nombreInsumo = insumo.materiales_ciclo?.nombre || insumo.nombre_material;
                  const cantidadInsumo = insumo.materiales_ciclo?.cantidad || insumo.cantidad;
                  return (
                    <List.Item>
                      <Space direction="vertical" size={2} style={{ width: "100%" }}>
                        <Checkbox
                          checked={Boolean(checklistInsumos[key])}
                          onChange={(event) => toggleChecklist(insumo, event.target.checked)}
                        >
                          <Space size={8} wrap>
                            <Text strong>{nombreInsumo}</Text>
                            {insumo.materiales_ciclo?.incluido_kit ? <Tag color="purple">Kit mensual</Tag> : null}
                          </Space>
                        </Checkbox>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {[cantidadInsumo, insumo.unidad].filter(Boolean).join(" ") || "Cantidad por definir"}
                          {insumo.obligatorio ? " • Obligatorio" : " • Opcional"}
                        </Text>
                        {insumo.observaciones ? (
                          <Text type="secondary" style={{ fontSize: 12 }}>{insumo.observaciones}</Text>
                        ) : null}
                      </Space>
                    </List.Item>
                  );
                }}
              />
            )}
          </Card>
        )}
      </Card>
    );
  };

  const renderPensum = () => renderRutaAcademica("plan");

  const renderMaterialesKits = () => renderRutaAcademica("kits");

  const renderMaterialesCiclo = () => renderRutaAcademica("ciclo");

  const obtenerRutaTemasPrograma = (programaId: string | number | null | undefined) => {
    const ciclos = (pensum || [])
      .filter((p: any) => String(p?.programa_id) === String(programaId))
      .sort((a: any, b: any) => {
        const ordenA = Number(a?.orden ?? a?.numero_ciclo ?? 0);
        const ordenB = Number(b?.orden ?? b?.numero_ciclo ?? 0);
        if (ordenA !== ordenB) return ordenA - ordenB;
        return Number(a?.id || 0) - Number(b?.id || 0);
      });

    const ruta: Array<{ ciclo: any; tema: any }> = [];
    ciclos.forEach((ciclo: any) => {
      const temasOrdenados = (ciclo?.pensum_cursos || [])
        .slice()
        .sort((a: any, b: any) => {
          const ordenA = Number(a?.orden ?? 0);
          const ordenB = Number(b?.orden ?? 0);
          if (ordenA !== ordenB) return ordenA - ordenB;
          return Number(a?.id || 0) - Number(b?.id || 0);
        });

      temasOrdenados.forEach((tema: any) => {
        ruta.push({ ciclo, tema });
      });
    });

    return ruta;
  };

  const obtenerSiguienteClase = (curso: any) => {
    const ruta = obtenerRutaTemasPrograma(curso?.programaId);
    if (!ruta.length) return null;

    const temasVistos = new Set(
      (asistencias || [])
        .filter((asistencia: any) => String(asistencia?.matricula_id) === String(curso?.matriculaId))
        .map((asistencia: any) => asistencia?.tema_id)
        .filter(Boolean)
        .map((id: any) => String(id))
    );

    const siguiente = ruta.find((item) => !temasVistos.has(String(item.tema?.id)));
    if (siguiente) {
      return {
        ...siguiente,
        completado: false,
        total: ruta.length,
        vistos: temasVistos.size,
      };
    }

    const ultima = ruta[ruta.length - 1];
    return {
      ...ultima,
      completado: true,
      total: ruta.length,
      vistos: ruta.length,
    };
  };

  const irAMaterialesSiguienteClase = (curso: any, siguienteParam?: any) => {
    const siguiente = siguienteParam || obtenerSiguienteClase(curso);
    if (!siguiente) {
      message.info("Este curso aún no tiene ciclo/tema configurado");
      return;
    }

    const matriculaId = curso?.matriculaId ? String(curso.matriculaId) : null;
    const cicloId = siguiente?.ciclo?.id ? String(siguiente.ciclo.id) : null;
    const temaId = siguiente?.tema?.id ? String(siguiente.tema.id) : null;

    if (!matriculaId || !cicloId || !temaId) {
      message.info("No se pudo abrir la clase objetivo. Intenta de nuevo.");
      return;
    }

    setMatriculaRutaId(matriculaId);
    setCicloRutaId(cicloId);
    setTemaRutaId(temaId);
    setActiveTab("7");
  };

  if (loading) {
    return (
      <div className="portal-estudiante" style={{ padding: isMobile ? "12px" : "20px", maxWidth: "1200px", margin: "0 auto" }}>
        <Card style={{ marginBottom: 20 }}>
          <Skeleton active paragraph={{ rows: 2 }} title={{ width: "45%" }} />
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <Space size={12} wrap>
            <Skeleton.Button active size="small" style={{ width: 120 }} />
            <Skeleton.Button active size="small" style={{ width: 140 }} />
            <Skeleton.Button active size="small" style={{ width: 110 }} />
            <Skeleton.Button active size="small" style={{ width: 105 }} />
          </Space>
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card>
              <Skeleton active paragraph={{ rows: 5 }} title={{ width: "60%" }} />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card>
              <Skeleton active paragraph={{ rows: 5 }} title={{ width: "55%" }} />
            </Card>
          </Col>
        </Row>
      </div>
    );
  }

  return (
    <div className="portal-estudiante" style={{ padding: isMobile ? "12px" : "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <Card style={{ marginBottom: 20 }}>
        <Row gutter={16} className="header-row">
          <Col xs={24} sm={12}>
            <Text style={{ display: "block", fontSize: isMobile ? 16 : 18, fontWeight: 600 }}>
              Te damos la Bienvenida
            </Text>
            <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
              Portal de Estudiante
            </Text>
          </Col>
          <Col xs={24} sm={12} className="header-actions" style={{ textAlign: "right" }}>
            {(whatsappAgente || whatsappAdmisiones) && (
              <Dropdown
                trigger={["click"]}
                menu={{
                  items: [
                    {
                      key: "agente",
                      label: "Hablar con Agente",
                      onClick: () =>
                        abrirWhatsapp(
                          whatsappAgente,
                          `Hola, soy ${estudiante?.nombre_completo || "estudiante"}. Tengo una consulta sobre mis cursos en el portal.`
                        ),
                      disabled: !whatsappAgente,
                    },
                    {
                      key: "admisiones",
                      label: "Hablar con Admisiones",
                      onClick: () =>
                        abrirWhatsapp(
                          whatsappAdmisiones,
                          `Hola, soy ${estudiante?.nombre_completo || "estudiante"}. Necesito apoyo de Admisiones.`
                        ),
                      disabled: !whatsappAdmisiones,
                    },
                  ],
                }}
              >
                <Button
                  icon={<WhatsAppOutlined />}
                  type="primary"
                  size="middle"
                  style={{ backgroundColor: "#25D366", borderColor: "#25D366", height: 34, paddingInline: 12, fontSize: 13 }}
                >
                  Contactar por WhatsApp
                </Button>
              </Dropdown>
            )}
          </Col>
        </Row>
      </Card>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "1",
            label: <span><BookOutlined /> Mis Cursos</span>,
            children: (
              <>
                {avancePorCurso.length === 0 ? (
                  <Empty description="No estás inscrito en ningún curso activo" />
                ) : (
                  <Row gutter={16}>
                    {avancePorCurso.map((curso: any, idx: number) => (
                      <Col xs={24} sm={12} lg={8} key={idx}>
                        <Card className="course-card" title={curso.curso}>
                          <Row gutter={12}>
                            <Col xs={12}>
                              <div style={{ textAlign: "center" }}>
                                <Progress
                                  type="circle"
                                  percent={Math.max(0, Math.min(100, Number(curso.nota || 0)))}
                                  width={isMobile ? 94 : 108}
                                  format={() => `${Number(curso.nota || 0)}/100`}
                                />
                                <Text type="secondary" style={{ display: "block", marginTop: 6, fontSize: 12 }}>
                                  Nota actual
                                </Text>
                              </div>
                            </Col>
                            <Col xs={12}>
                              <div style={{ textAlign: "center" }}>
                                <Progress
                                  type="dashboard"
                                  percent={Math.max(0, Math.min(100, Math.round((Number(curso.nota || 0) / 70) * 100)))}
                                  width={isMobile ? 94 : 108}
                                  format={(percent) => `${percent}%`}
                                  status={Number(curso.nota || 0) >= 70 ? "success" : "active"}
                                />
                                <Text type="secondary" style={{ display: "block", marginTop: 6, fontSize: 12 }}>
                                  Meta aprobatoria
                                </Text>
                              </div>
                            </Col>
                          </Row>
                          <div style={{ marginTop: 10, textAlign: 'center' }}>
                            <Tag color={curso.nota >= 70 ? "green" : "orange"}>{curso.estado?.toUpperCase()}</Tag>
                          </div>

                          {(() => {
                            const siguiente = obtenerSiguienteClase(curso);
                            const nombreTema = siguiente?.tema?.nombre_curso || "Tema por definir";
                            const nombreCiclo = siguiente?.ciclo?.nombre_ciclo || "Ciclo por definir";
                            const descripcionTema = siguiente?.tema?.descripcion || "Introducción al ciclo";

                            return (
                              <div style={{ marginTop: 12 }}>
                                <Text style={{ fontSize: 12, display: "block" }}>
                                  {siguiente?.completado ? (
                                    <>
                                      <strong>Plan completado:</strong> ya registraste asistencia en {siguiente?.vistos}/{siguiente?.total} clases del programa. Puedes repasar materiales del último tema.
                                    </>
                                  ) : (
                                    <>
                                      <strong>Siguiente Clase:</strong> {nombreTema} del {nombreCiclo}: {descripcionTema}. Verifica la lista de materiales para esta clase.
                                    </>
                                  )}
                                </Text>
                                <Button
                                  type="link"
                                  style={{ paddingLeft: 0, marginTop: 4, height: "auto" }}
                                  onClick={() => irAMaterialesSiguienteClase(curso, siguiente)}
                                >
                                  {siguiente?.completado
                                    ? "Ver materiales del último tema"
                                    : "Ir a lista de materiales de esta clase"}
                                </Button>
                              </div>
                            );
                          })()}
                        </Card>
                      </Col>
                    ))}
                  </Row>
                )}
              </>
            ),
          },
          {
            key: "2",
            label: <span><SafetyCertificateOutlined /> Plan de Estudios</span>,
            children: renderPensum()
          },
          {
            key: "3",
            label: <span><DollarCircleOutlined /> Financiero</span>,
            children: renderFinanciero()
          },
          {
            key: "4",
            label: <span><CheckCircleOutlined /> Asistencia</span>,
            children: (
              <Table
                dataSource={asistencias}
                rowKey="id"
                size="small"
                scroll={{ x: 520 }}
                columns={[
                  { title: "Fecha", dataIndex: "fecha", render: (f) => formatDate(f) },
                  { title: "Curso", render: (_, r: any) => r.matriculas?.cursos?.nombre },
                  { title: "Estado", dataIndex: "estado", render: (e) => <Tag color={e === "presente" ? "green" : "red"}>{e?.toUpperCase()}</Tag> },
                ]}
              />
            ),
          },
          {
            key: "5",
            label: <span><FileTextOutlined /> Calificaciones</span>,
            children: (
              <Table
                dataSource={calificaciones}
                rowKey="id"
                size="small"
                scroll={{ x: 520 }}
                columns={[
                  { title: "Curso", render: (_, r: any) => r.matriculas?.cursos?.nombre },
                  { title: "Nota", dataIndex: "calificacion", render: (c) => <Tag color={c >= 70 ? "green" : "red"}>{c}</Tag> },
                  { title: "Fecha", dataIndex: "fecha_evaluacion", render: (f) => formatDate(f) },
                ]}
              />
            ),
          },
          {
            key: "6",
            label: <span><TrophyOutlined /> Certificados</span>,
            children: (
              <Table
                dataSource={certificados}
                rowKey="id"
                size="small"
                scroll={{ x: 520 }}
                columns={[
                  { title: "Curso", render: (_, r: any) => r.cursos?.nombre },
                  { title: "Nota Final", dataIndex: "nota_final" },
                  { title: "Acción", render: (_, r) => <Button icon={<DownloadOutlined />} onClick={() => descargarCertificado(r)}>Descargar</Button> }
                ]}
              />
            ),
          },
          {
            key: "7",
            label: <span><BookOutlined /> Materiales por clase</span>,
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                {renderMaterialesKits()}
                <HistorialEntregas estudianteId={estudiante?.id} />
              </Space>
            )
          },
          {
            key: "8",
            label: <span><BookOutlined /> Materiales del ciclo</span>,
            children: renderMaterialesCiclo(),
          }
        ]}
      />
      <style jsx global>{`
        .portal-estudiante .header-row {
          align-items: center;
        }
        .portal-estudiante .course-card .ant-progress {
          filter: drop-shadow(0 8px 16px rgba(15, 23, 42, 0.12));
        }
        .portal-estudiante .course-card .ant-progress-inner {
          background: radial-gradient(circle at 30% 30%, #ffffff 0%, #f3f6fb 45%, #e6ebf3 100%);
        }
        .portal-estudiante .course-card .ant-progress-circle .ant-progress-text,
        .portal-estudiante .course-card .ant-progress-dashboard .ant-progress-text {
          color: #1f2937;
          font-weight: 700;
          letter-spacing: 0.2px;
        }
        .portal-estudiante .course-card .ant-progress-circle-path {
          stroke: #d81b87;
          stroke-linecap: round;
        }
        .portal-estudiante .course-card .ant-progress-dashboard-path {
          stroke: #0ea5e9;
          stroke-linecap: round;
        }
        .portal-estudiante .course-card .ant-progress-circle-trail,
        .portal-estudiante .course-card .ant-progress-dashboard-trail {
          stroke: #e3e8f1;
        }
        @media (max-width: 576px) {
          .portal-estudiante {
            padding: 12px !important;
          }
          .portal-estudiante .header-row {
            text-align: center;
          }
          .portal-estudiante .header-actions {
            text-align: center !important;
            margin-top: 12px;
          }
          .portal-estudiante .header-actions .ant-btn {
            width: 100%;
          }
          .portal-estudiante .ant-card-head-title {
            white-space: normal;
          }
          .portal-estudiante .course-card .ant-card-body {
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .portal-estudiante .ant-table {
            font-size: 12px;
          }
          .portal-estudiante .ant-table-cell {
            white-space: normal;
          }
        }
      `}</style>
    </div>
  );
}
