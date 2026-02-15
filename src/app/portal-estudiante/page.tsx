"use client";

import React, { useEffect, useState } from "react";
import { logger } from "@utils/logger";
import {
  Tabs,
  Card,
  Table,
  Row,
  Col,
  Statistic,
  Spin,
  Alert,
  Progress,
  Button,
  Empty,
  message,
  Tag,
  Divider,
  List,
  Collapse,
  Typography,
  Space,
  Dropdown,
  Checkbox
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
  ClockCircleOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { formatDate } from "@utils/date";
import { obtenerPensumPorProgramas, obtenerMaterialesPorProgramas, obtenerMaterialesClasePorProgramas } from "@modules/academico/pensum.service";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { descargarCertificado as descargarCertificadoPDF } from "@utils/certificate";
import { HistorialEntregas } from "@components/EntregaMaterialModal";

dayjs.locale("es");

const { Title, Text } = Typography;
const { Panel } = Collapse;

export default function PortalEstudiante() {
  const [loading, setLoading] = useState(true);
  const [estudiante, setEstudiante] = useState<any>(null);
  const [asistencias, setAsistencias] = useState<any[]>([]);
  const [calificaciones, setCalificaciones] = useState<any[]>([]);
  const [avancePorCurso, setAvancePorCurso] = useState<any[]>([]);
  const [certificados, setCertificados] = useState<any[]>([]);
  const [pagos, setPagos] = useState<any[]>([]);
  const [pensum, setPensum] = useState<any[]>([]);
  const [materiales, setMateriales] = useState<any[]>([]);
  const [materialesClase, setMaterialesClase] = useState<any[]>([]);
  const [matriculas, setMatriculas] = useState<any[]>([]);
  const [whatsappAgente, setWhatsappAgente] = useState<string | null>(null);
  const [whatsappAdmisiones, setWhatsappAdmisiones] = useState<string | null>(null);
  const [matriculaRutaId, setMatriculaRutaId] = useState<string | null>(null);
  const [cicloRutaId, setCicloRutaId] = useState<string | null>(null);
  const [temaRutaId, setTemaRutaId] = useState<string | null>(null);
  const [checklistInsumos, setChecklistInsumos] = useState<Record<string, boolean>>({});

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

    const existeMatricula = matriculas.some((m: any) => String(m.id) === String(matriculaRutaId));
    if (!existeMatricula) {
      setMatriculaRutaId(String(matriculas[0].id));
      setCicloRutaId(null);
      setTemaRutaId(null);
    }
  }, [matriculas, matriculaRutaId]);

  const cargarDatos = async () => {
    try {
      setLoading(true);

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

        const materialesClaseData = await obtenerMaterialesClasePorProgramas(programaIds);
        const materialesClaseUnicos = deduplicarLista(materialesClaseData || [], (m: any) =>
          String(`${m?.programa_id || ''}-${m?.pensum_id || ''}-${m?.pensum_curso_id || ''}-${(m?.nombre_material || '').trim().toLowerCase()}-${m?.cantidad || ''}-${(m?.unidad || '').trim().toLowerCase()}-${(m?.observaciones || '').trim().toLowerCase()}`)
        );
        setMaterialesClase(materialesClaseUnicos);
      }

      // 5. Calcular Avance y Certificados
      if (dataMatriculas) {
        const avance = dataMatriculas.map((m: any) => ({
          curso: m.cursos?.nombre,
          programa: m.cursos?.programas?.nombre,
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

  const renderPensum = () => {
    if (!matriculas.length) return <Empty description="No tienes cursos activos" />;

    const matriculasActivas = deduplicarLista(
      matriculas.filter((m: any) => m.estado !== "cancelado"),
      (m: any) => String(m?.id)
    );

    const matriculaSeleccionada =
      matriculasActivas.find((m: any) => String(m.id) === String(matriculaRutaId)) ||
      matriculasActivas[0];

    if (!matriculaSeleccionada) {
      return <Empty description="No se encontró una matrícula activa" />;
    }

    const programaIdSeleccionado = matriculaSeleccionada?.cursos?.programa_id;
    const programaNombre = matriculaSeleccionada?.cursos?.programas?.nombre || matriculaSeleccionada?.cursos?.nombre || "Programa";

    const ciclosPrograma = deduplicarLista(
      pensum.filter((p: any) => p.programa_id === programaIdSeleccionado),
      (ciclo: any) => String(ciclo?.id || `${ciclo?.programa_id || ''}-${ciclo?.nombre_ciclo || ''}-${ciclo?.numero_ciclo || ''}`)
    ).sort((a: any, b: any) => Number(a?.numero_ciclo || 0) - Number(b?.numero_ciclo || 0));

    const cicloSeleccionado =
      ciclosPrograma.find((c: any) => String(c.id) === String(cicloRutaId)) ||
      ciclosPrograma[0];

    const temasCiclo = deduplicarLista(
      (cicloSeleccionado?.pensum_cursos || []),
      (tema: any) => String(tema?.id || normalizarTexto(tema?.nombre_curso || ""))
    );

    const temaSeleccionado =
      temasCiclo.find((t: any) => String(t.id) === String(temaRutaId)) ||
      temasCiclo[0];

    const materialesPrograma = deduplicarLista(
      materiales.filter((m: any) => m.programa_id === programaIdSeleccionado),
      (m: any) => {
        const parsed = parseTemaTituloMaterial(m?.titulo);
        return String(`${m?.pensum_id || ''}-${normalizarTexto(parsed.tema)}-${normalizarTexto(parsed.tituloLimpio)}-${normalizarTexto(m?.tipo_material || '')}`);
      }
    );

    const materialesClasePrograma = deduplicarLista(
      materialesClase.filter((m: any) => m.programa_id === programaIdSeleccionado),
      (m: any) => String(`${m?.pensum_id || ''}-${m?.pensum_curso_id || ''}-${normalizarTexto(m?.nombre_material || '')}-${m?.cantidad || ''}-${normalizarTexto(m?.unidad || '')}`)
    );

    const recursosTema = deduplicarLista(
      materialesPrograma.filter((material: any) => {
        if (!temaSeleccionado) return false;
        if (cicloSeleccionado?.id && material.pensum_id && String(material.pensum_id) !== String(cicloSeleccionado.id)) return false;

        const parsed = parseTemaTituloMaterial(material.titulo);
        const temaMaterial = normalizarTexto(parsed.tema);
        const temaObjetivo = normalizarTexto(temaSeleccionado.nombre_curso);
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
      (m: any) => `${normalizarTexto(m?.nombre_material || '')}-${m?.cantidad || ''}-${normalizarTexto(m?.unidad || '')}`
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

    const obtenerRecursosTema = (ciclo: any, tema: any) => {
      return deduplicarLista(
        materialesPrograma.filter((material: any) => {
          if (!tema) return false;
          if (ciclo?.id && material.pensum_id && String(material.pensum_id) !== String(ciclo.id)) return false;

          const parsed = parseTemaTituloMaterial(material.titulo);
          const temaMaterial = normalizarTexto(parsed.tema);
          const temaObjetivo = normalizarTexto(tema.nombre_curso);
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
    };

    const obtenerInsumosTema = (ciclo: any, tema: any) => {
      return deduplicarLista(
        materialesClasePrograma.filter((item: any) => {
          if (!tema) return false;
          if (ciclo?.id && item.pensum_id && String(item.pensum_id) !== String(ciclo.id)) return false;
          return String(item.pensum_curso_id) === String(tema.id);
        }),
        (m: any) => `${normalizarTexto(m?.nombre_material || '')}-${m?.cantidad || ''}-${normalizarTexto(m?.unidad || '')}`
      );
    };

    const contarInsumosMarcados = (tema: any, insumos: any[]) => {
      return insumos.filter((insumo: any) => {
        const key = `${matriculaSeleccionada.id}|${tema?.id || 'sin-tema'}|${insumo.id || normalizarTexto(insumo.nombre_material)}`;
        return Boolean(checklistInsumos[key]);
      }).length;
    };

    return (
      <Card title={`Plan de Estudios: ${programaNombre}`}>
        <Divider orientation="left">Curso inscrito</Divider>
        <Row gutter={[8, 8]}>
          {matriculasActivas.map((mat: any) => (
            <Col xs={24} sm={12} md={8} key={mat.id}>
              <Button
                block
                type={String(mat.id) === String(matriculaSeleccionada.id) ? "primary" : "default"}
                style={
                  String(mat.id) === String(matriculaSeleccionada.id)
                    ? { backgroundColor: "#1677ff", borderColor: "#1677ff" }
                    : undefined
                }
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

        <div style={{ marginTop: 8, marginBottom: 4 }}>
          <Tag color="blue">Curso seleccionado: {matriculaSeleccionada?.cursos?.nombre || "N/A"}</Tag>
        </div>

        <Divider orientation="left">Módulo / Mes</Divider>
        {ciclosPrograma.length === 0 ? (
          <Empty description="Este curso aún no tiene módulos/ciclos configurados" />
        ) : (
          <Collapse
            accordion
            activeKey={cicloSeleccionado?.id ? String(cicloSeleccionado.id) : undefined}
            onChange={(key) => {
              const value = Array.isArray(key) ? key[0] : key;
              setCicloRutaId(value ? String(value) : null);
              setTemaRutaId(null);
            }}
          >
            {ciclosPrograma.map((ciclo: any) => {
              const temasDelCiclo = deduplicarLista(
                (ciclo?.pensum_cursos || []),
                (tema: any) => String(tema?.id || normalizarTexto(tema?.nombre_curso || ""))
              );

              return (
                <Panel
                  header={
                    <Space size={8} wrap>
                      <Text
                        strong
                        style={{
                          color: String(cicloSeleccionado?.id) === String(ciclo.id) ? "#1677ff" : undefined,
                        }}
                      >
                        {ciclo.nombre_ciclo}
                      </Text>
                      {String(cicloSeleccionado?.id) === String(ciclo.id) ? <Tag color="blue">Seleccionado</Tag> : null}
                    </Space>
                  }
                  key={String(ciclo.id)}
                >
                  {temasDelCiclo.length === 0 ? (
                    <Empty description="Este módulo aún no tiene temas configurados" />
                  ) : (
                    <Collapse
                      accordion
                      activeKey={String(cicloSeleccionado?.id) === String(ciclo.id) && temaSeleccionado?.id ? String(temaSeleccionado.id) : undefined}
                      onChange={(key) => {
                        const value = Array.isArray(key) ? key[0] : key;
                        setTemaRutaId(value ? String(value) : null);
                      }}
                    >
                      {temasDelCiclo.map((tema: any) => {
                        const recursosTemaPanel = obtenerRecursosTema(ciclo, tema);
                        const insumosTemaPanel = obtenerInsumosTema(ciclo, tema);
                        const marcadosTema = contarInsumosMarcados(tema, insumosTemaPanel);

                        return (
                          <Panel
                            key={String(tema.id)}
                            header={
                              <Space size={8} wrap>
                                <Text
                                  strong
                                  style={{ color: String(temaSeleccionado?.id) === String(tema.id) ? "#722ed1" : undefined }}
                                >
                                  {tema.nombre_curso}
                                </Text>
                                <Tag>{tema.horas || 0} horas</Tag>
                                {String(temaSeleccionado?.id) === String(tema.id) ? <Tag color="purple">Seleccionado</Tag> : null}
                              </Space>
                            }
                          >
                            <Row gutter={[12, 12]}>
                              <Col xs={24} lg={12}>
                                <Card size="small" title="Material didáctico del tema">
                                  {recursosTemaPanel.length === 0 ? (
                                    <Text type="secondary">No hay material didáctico asignado a este tema.</Text>
                                  ) : (
                                    <List
                                      dataSource={recursosTemaPanel}
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
                              </Col>

                              <Col xs={24} lg={12}>
                                <Card
                                  size="small"
                                  title="Productos / materiales necesarios"
                                  extra={<Tag color={insumosTemaPanel.length > 0 && marcadosTema === insumosTemaPanel.length ? "green" : "blue"}>{marcadosTema}/{insumosTemaPanel.length} listos</Tag>}
                                >
                                  {insumosTemaPanel.length === 0 ? (
                                    <Text type="secondary">No hay productos necesarios registrados para este tema.</Text>
                                  ) : (
                                    <List
                                      dataSource={insumosTemaPanel}
                                      renderItem={(insumo: any) => {
                                        const key = `${matriculaSeleccionada.id}|${tema?.id || 'sin-tema'}|${insumo.id || normalizarTexto(insumo.nombre_material)}`;
                                        return (
                                          <List.Item>
                                            <Space direction="vertical" size={2} style={{ width: "100%" }}>
                                              <Checkbox
                                                checked={Boolean(checklistInsumos[key])}
                                                onChange={(event) => toggleChecklist(insumo, event.target.checked)}
                                              >
                                                <Text strong>{insumo.nombre_material}</Text>
                                              </Checkbox>
                                              <Text type="secondary" style={{ fontSize: 12 }}>
                                                {[insumo.cantidad, insumo.unidad].filter(Boolean).join(" ") || "Cantidad por definir"}
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
                              </Col>
                            </Row>
                          </Panel>
                        );
                      })}
                    </Collapse>
                  )}
                </Panel>
              );
            })}
          </Collapse>
        )}
      </Card>
    );
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 50 }}>
        <Spin size="large" />
        <div style={{ marginTop: 10 }}>Cargando tu información...</div>
      </div>
    );
  }

  return (
    <div className="portal-estudiante" style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <Card style={{ marginBottom: 20 }}>
        <Row gutter={16} className="header-row">
          <Col xs={24} sm={12}>
            <Title level={2}>{obtenerSaludoBienvenida(estudiante?.genero)}, {estudiante?.nombre_completo}! 🎓</Title>
            <Text type="secondary">Portal de Estudiante - Academy Crystal</Text>
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
                  size="large"
                  style={{ backgroundColor: "#25D366", borderColor: "#25D366" }}
                >
                  Contactar por WhatsApp
                </Button>
              </Dropdown>
            )}
          </Col>
        </Row>
      </Card>

      <Tabs
        defaultActiveKey="1"
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
                        <Card className="course-card" title={curso.curso} extra={<Tag>{curso.programa}</Tag>}>
                          <Progress type="circle" percent={curso.nota} format={() => `${curso.nota}/100`} />
                          <div style={{ marginTop: 10, textAlign: 'center' }}>
                            <Tag color={curso.nota >= 70 ? "green" : "orange"}>{curso.estado?.toUpperCase()}</Tag>
                          </div>
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
            label: <span><BookOutlined /> Materiales (Kits)</span>,
            children: <HistorialEntregas estudianteId={estudiante?.id} />
          }
        ]}
      />
      <style jsx global>{`
        .portal-estudiante .header-row {
          align-items: center;
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
