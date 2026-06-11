"use client";

import React from "react";
import dayjs from "dayjs";
import { Button, Card, Checkbox, Col, Collapse, Empty, List, Row, Space, Table, Tag, Typography } from "antd";
import { DownloadOutlined, FilePdfOutlined } from "@ant-design/icons";
import { TemaMaterialActions } from "@/modules/portal-estudiante/components/TemaMaterialActions";
import { getMaterialCoverageDisplay, normalizeModalidadPago } from "@/types/payment-plans";
import { getMaterialCanonicalTitle, normalizarTexto } from "@/modules/portal-estudiante/utils";
import { construirNombreGrupo } from "@utils/grupos";

const { Text } = Typography;

type Props = {
  vista: "plan" | "kits" | "ciclo";
  showCertificates?: boolean;
  isMobile: boolean;
  matriculas: any[];
  matriculasActivas: any[];
  matriculaSeleccionada: any;
  ciclosPrograma: any[];
  pagosConPendientes: any[];
  certificados: any[];
  cicloRutaId: string | null;
  actividadPorTemaMatricula: Map<string, number>;
  parseNumeroCuotaAction: (pago: any) => number | null;
  getVisiblePaymentStatusWithGraceAction: (pago: any) => string;
  getFechaVencimientoEfectivaAction: (pago: any) => any;
  getPrimerCicloIncompletoIndexAction: (ciclos: any[], getTemas: (c: any) => any[]) => number;
  getPrimerTemaPendienteIndexAction: (temas: any[]) => number;
  getQuizByTemaIdAction: (temaId: string) => any;
  getNotaByTemaIdAction: (temaId: string) => any;
  isTemaCompletadoByTemaIdAction: (temaId: string) => boolean;
  obtenerTemasCicloAction: (ciclo: any) => any[];
  obtenerMaterialesCicloAction: (cicloId: string) => any[];
  obtenerRecursosTemaAction: (tema: any, cicloId: string) => any[];
  obtenerInsumosTemaAction: (tema: any, cicloId: string) => any[];
  deduplicarListaAction: <T,>(items: T[], resolverClave: (item: T) => string) => T[];
  isIframeMaterialAction: (material: any) => boolean;
  extractIframeSrcAction: (value?: string | null) => string;
  resolveTemaVisualAction: (tema: any, cursoContext?: any) => any;
  buildTemaImageDataUriAction: (tema: any, cursoContext?: any) => string;
  buildChecklistKeyAction: (matriculaId: string, temaId: string, itemId: string) => string;
  isChecklistItemCheckedAction: (key: string) => boolean;
  setChecklistItemCheckedAction: (key: string, checked: boolean) => void;
  obtenerPdfRelacionadoAction: (material: any, recursosTema?: any[]) => any;
  isPdfMaterialAction: (material: any) => boolean;
  getMaterialIconAction: (material: any) => React.ReactNode;
  onOpenMaterialAction: (material: any, titulo: string, temaIdForQuiz?: string) => void;
  onOpenQuizAction: (quiz: any) => Promise<void>;
  onWarnAction: (warnMessage: string) => void;
  renderMobileListCardsAction: (items: any[], getCard: (item: any) => any, emptyText?: string) => React.ReactNode;
  onDownloadCertificadoAction: (matricula: any) => void;
  setMatriculaRutaIdAction: (value: string | null) => void;
  setCicloRutaIdAction: (value: string | null) => void;
  setTemaRutaIdAction: (value: string | null) => void;
};

export const PortalRutaAcademicaSection = ({
  vista,
  showCertificates = false,
  isMobile,
  matriculas,
  matriculasActivas,
  matriculaSeleccionada,
  ciclosPrograma,
  pagosConPendientes,
  certificados,
  cicloRutaId,
  actividadPorTemaMatricula,
  parseNumeroCuotaAction,
  getVisiblePaymentStatusWithGraceAction,
  getFechaVencimientoEfectivaAction,
  getPrimerCicloIncompletoIndexAction,
  getPrimerTemaPendienteIndexAction,
  getQuizByTemaIdAction,
  getNotaByTemaIdAction,
  isTemaCompletadoByTemaIdAction,
  obtenerTemasCicloAction,
  obtenerMaterialesCicloAction,
  obtenerRecursosTemaAction,
  obtenerInsumosTemaAction,
  deduplicarListaAction,
  isIframeMaterialAction,
  extractIframeSrcAction,
  resolveTemaVisualAction,
  buildTemaImageDataUriAction,
  buildChecklistKeyAction,
  isChecklistItemCheckedAction,
  setChecklistItemCheckedAction,
  obtenerPdfRelacionadoAction,
  isPdfMaterialAction,
  getMaterialIconAction,
  onOpenMaterialAction,
  onOpenQuizAction,
  onWarnAction,
  renderMobileListCardsAction,
  onDownloadCertificadoAction,
  setMatriculaRutaIdAction,
  setCicloRutaIdAction,
  setTemaRutaIdAction,
}: Props) => {
  if (!matriculas.length) return <Empty description="No tienes cursos activos" />;

  const tituloPrincipal = vista === "plan"
    ? "Contenido del Curso - Pensum"
    : vista === "ciclo"
      ? "Materiales generales por ciclo"
      : "Materiales necesarios";
  const coloresCiclo = vista === "plan"
    ? ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a"]
    : ["#16a34a", "#0f766e", "#0284c7", "#7c3aed", "#ea580c"];
  const colorNumeroTema = vista === "plan" ? "#2563eb" : "#16a34a";

  if (!matriculaSeleccionada) {
    return (
      <Card title={tituloPrincipal} size={isMobile ? "small" : "default"}>
        <Text strong>Selecciona un curso</Text>
        <Row gutter={[10, 10]} style={{ marginTop: 10 }}>
          {matriculasActivas.map((mat: any) => (
            <Col xs={24} sm={12} lg={8} key={mat.id}>
              <Button
                block
                onClick={() => {
                  setMatriculaRutaIdAction(String(mat.id));
                  setCicloRutaIdAction(null);
                  setTemaRutaIdAction(null);
                }}
              >
                {construirNombreGrupo(mat?.cursos) || `Curso ${mat.id}`}
              </Button>
            </Col>
          ))}
        </Row>
      </Card>
    );
  }

  const cicloActivo =
    cicloRutaId && ciclosPrograma.some((c: any) => String(c.id) === String(cicloRutaId))
      ? String(cicloRutaId)
      : String(ciclosPrograma[0]?.id || "");

  const modalidadMateriales = normalizeModalidadPago(matriculaSeleccionada?.modalidad_pago);
  const esPlanMensualSeleccionado = modalidadMateriales !== "POR_CLASE";
  const porClaseTieneMoraMatriculaSeleccionada = modalidadMateriales === "POR_CLASE"
    && pagosConPendientes.some((p: any) => {
      if (String(p?.matricula_id || "") !== String(matriculaSeleccionada?.id || "")) return false;
      if (String(p?.estado || "").toLowerCase() !== "pendiente") return false;
      const fecha = getFechaVencimientoEfectivaAction(p);
      return Boolean(fecha && dayjs().startOf("day").isAfter(fecha));
    });

  const ciclosMensualesPagados = esPlanMensualSeleccionado
    ? (() => {
      const cuotasPagadas = new Set<number>();

      (pagosConPendientes || []).forEach((pago: any) => {
        if (String(pago?.matricula_id || "") !== String(matriculaSeleccionada?.id || "")) return;

        const numeroCuota = parseNumeroCuotaAction(pago);
        if (!numeroCuota || numeroCuota <= 0) return;

        if (getVisiblePaymentStatusWithGraceAction(pago) === "pagado") {
          cuotasPagadas.add(numeroCuota);
        }
      });

      let consecutivas = 0;
      while (cuotasPagadas.has(consecutivas + 1)) {
        consecutivas += 1;
      }

      return consecutivas;
    })()
    : 0;

  const renderCoverageTagForStudent = (materialRef: any, compact = false) => {
    const display = getMaterialCoverageDisplay({
      modalidadPago: matriculaSeleccionada?.modalidad_pago,
      porcentajeProductos: matriculaSeleccionada?.porcentaje_productos,
      coberturaMaterial: materialRef?.cobertura_material ?? materialRef?.materiales_ciclo?.cobertura_material,
      incluidoKit: materialRef?.incluido_kit ?? materialRef?.materiales_ciclo?.incluido_kit,
    });

    const visualByStatus = {
      included: {
        background: "#ecfdf3",
        borderColor: "#86efac",
        color: "#166534",
      },
      upgrade_required: {
        background: "#fffbeb",
        borderColor: "#fcd34d",
        color: "#92400e",
      },
      not_included: {
        background: "#f8fafc",
        borderColor: "#cbd5e1",
        color: "#475569",
      },
    } as const;

    const visual = visualByStatus[display.status];

    return (
      <Tag
        color={display.color}
        style={{
          fontSize: compact ? 12 : isMobile ? 12 : 13,
          padding: compact ? "2px 8px" : isMobile ? "4px 10px" : "4px 12px",
          marginInlineEnd: 0,
          borderRadius: 999,
          fontWeight: 600,
          border: `1px solid ${visual.borderColor}`,
          borderColor: visual.borderColor,
          color: visual.color,
          background: visual.background,
          whiteSpace: "nowrap",
          display: "inline-flex",
          justifyContent: "center",
          textAlign: "center",
          minWidth: compact ? 104 : undefined,
        }}
      >
        {compact ? display.shortLabel : isMobile ? display.shortLabel : display.label}
      </Tag>
    );
  };

  if (!ciclosPrograma.length) {
    return (
      <Card title={tituloPrincipal} size={isMobile ? "small" : "default"}>
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Button type="text" size="small" onClick={() => setMatriculaRutaIdAction(null)}>← Volver a cursos</Button>
          <Empty description="Este curso aun no tiene modulos/ciclos configurados" />
        </Space>
      </Card>
    );
  }

  const primerCicloIncompletoIndex = getPrimerCicloIncompletoIndexAction(ciclosPrograma, obtenerTemasCicloAction);

  const routeContent = (
    <Card title={tituloPrincipal} size={isMobile ? "small" : "default"}>
      <Space direction="vertical" size={12} style={{ width: "100%", marginBottom: 12 }}>
        <Text strong>Curso activo</Text>
        <Row gutter={[10, 10]}>
          {matriculasActivas.map((mat: any) => {
            const activo = String(mat?.id) === String(matriculaSeleccionada?.id);
            return (
              <Col xs={24} sm={12} lg={8} key={mat.id}>
                <Button
                  block
                  type={activo ? "primary" : "default"}
                  onClick={() => {
                    setMatriculaRutaIdAction(String(mat.id));
                    setCicloRutaIdAction(null);
                    setTemaRutaIdAction(null);
                  }}
                >
                  {construirNombreGrupo(mat?.cursos) || `Curso ${mat.id}`}
                </Button>
              </Col>
            );
          })}
        </Row>
      </Space>

      <Collapse
        accordion
        expandIconPosition="end"
        activeKey={cicloActivo || undefined}
        onChange={(key) => {
          const value = Array.isArray(key) ? key[0] : key;
          setCicloRutaIdAction(value ? String(value) : null);
        }}
        items={ciclosPrograma.map((ciclo: any, index: number) => {
          const cicloId = String(ciclo?.id || `ciclo-${index}`);
          const cicloNumero = ciclo?.numero_ciclo ?? ciclo?.orden ?? index + 1;
          const cicloNombre = ciclo?.nombre_ciclo || ciclo?.titulo || `Ciclo ${cicloNumero}`;
          const colorCiclo = coloresCiclo[index % coloresCiclo.length];
          const temasCiclo = obtenerTemasCicloAction(ciclo);
          const materialesGenerales = obtenerMaterialesCicloAction(cicloId);

          const cicloBloqueado = esPlanMensualSeleccionado
            ? index >= ciclosMensualesPagados
            : index > primerCicloIncompletoIndex;
          const primerIndexActual = cicloBloqueado ? 0 : getPrimerTemaPendienteIndexAction(temasCiclo);

          return {
            key: cicloId,
            collapsible: cicloBloqueado ? "disabled" : undefined,
            className: cicloBloqueado ? "ciclo-bloqueado" : "",
            label: (
              <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 16, opacity: cicloBloqueado ? 0.4 : 1, filter: cicloBloqueado ? "grayscale(0.7)" : undefined, minWidth: 0 }}>
                <div
                  className="ciclo-avatar"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 16,
                    background: cicloBloqueado ? "#d9d9d9" : colorCiclo,
                    color: cicloBloqueado ? "#a0a0a0" : "#f8fafc",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    fontWeight: 700,
                  }}
                >
                  {cicloNumero}
                </div>
                <div style={{ minWidth: 0 }}>
                  <Text strong style={{ fontSize: isMobile ? 14 : 16, color: cicloBloqueado ? "#bfbfbf" : undefined, whiteSpace: "normal" }}>{cicloNombre}</Text>
                  {vista === "kits" ? (
                    <div><Text type="secondary">Materiales por tema</Text></div>
                  ) : ciclo?.descripcion ? (
                    <div><Text type="secondary">{ciclo.descripcion}</Text></div>
                  ) : null}
                </div>
              </div>
            ),
            children: vista === "ciclo" ? (
              materialesGenerales.length ? (
                isMobile ? renderMobileListCardsAction(materialesGenerales, (record: any) => ({
                  key: String(record?.id || record?.nombre),
                  title: <Text strong>{record?.nombre || "Producto"}</Text>,
                  extra: renderCoverageTagForStudent(record, true),
                  rows: [
                    { label: "Cantidad", value: record?.cantidad || "Cantidad por definir" },
                  ],
                })) : <Table
                  dataSource={materialesGenerales}
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
                      title: "Incluido en tu plan",
                      dataIndex: "cobertura_material",
                      align: "center",
                      render: (_value, record: any) => renderCoverageTagForStudent(record),
                    },
                  ]}
                />
              ) : (
                <Text type="secondary">No hay materiales generales registrados para este ciclo.</Text>
              )
            ) : temasCiclo.length ? (
              <List
                dataSource={temasCiclo}
                renderItem={(tema: any, temaIndex: number) => {
                  const temaId = String(tema?.id || `tema-${temaIndex}`);
                  const recursosTema = obtenerRecursosTemaAction(tema, cicloId);
                  const presentacionesTema = deduplicarListaAction(
                    recursosTema.filter((recurso: any) => isIframeMaterialAction(recurso)),
                    (recurso: any) =>
                      String(
                        `${String(recurso?.pensum_id || "")}-${String(recurso?.pensum_curso_id || "")}-${extractIframeSrcAction(recurso?.url_archivo) || String(recurso?.id || recurso?.titulo || "")}`
                      ).toLowerCase()
                  )
                    .map((recurso: any, indexTema: number) => ({
                      id: String(recurso?.id || `gamma-${indexTema}`),
                      titulo: getMaterialCanonicalTitle(recurso, tema?.nombre_curso) || tema?.nombre_curso || "Material",
                      material: recurso,
                    }));
                  const insumosTema = obtenerInsumosTemaAction(tema, cicloId);
                  const temaCompletado = isTemaCompletadoByTemaIdAction(temaId);
                  const bloqueoTemaActualPorPagoPorClase = porClaseTieneMoraMatriculaSeleccionada
                    && temaIndex === primerIndexActual
                    && !temaCompletado;
                  const temaBloqueado = vista === "plan"
                    ? (cicloBloqueado || temaIndex > primerIndexActual || bloqueoTemaActualPorPagoPorClase)
                    : cicloBloqueado;
                  const quizTema = getQuizByTemaIdAction(temaId);
                  const notaQuizTema = getNotaByTemaIdAction(temaId);
                  const notaActividadTema = actividadPorTemaMatricula.get(`${matriculaSeleccionada?.id || ""}-${temaId}`) ?? null;
                  const colorAvatarTema = temaBloqueado ? "#bfbfbf" : temaCompletado ? "#16a34a" : colorNumeroTema;
                  const temaVisual = resolveTemaVisualAction(tema, matriculaSeleccionada?.cursos);
                  const temaImageSrc = buildTemaImageDataUriAction(tema, matriculaSeleccionada?.cursos);
                  const insumosMarcados = insumosTema.filter((insumo: any) => {
                    const key = buildChecklistKeyAction(
                      String(matriculaSeleccionada.id),
                      temaId,
                      String(insumo.id || normalizarTexto(insumo.nombre_material))
                    );
                    return isChecklistItemCheckedAction(key);
                  }).length;
                  const recursoPdfTema = obtenerPdfRelacionadoAction({ titulo: tema?.nombre_curso }, recursosTema);
                  const recursoPrincipalTema = recursosTema.find((recurso: any) => !isPdfMaterialAction(recurso)) || recursoPdfTema || recursosTema[0] || null;
                  const tituloRecursoPrincipal = recursoPrincipalTema
                    ? getMaterialCanonicalTitle(recursoPrincipalTema, tema?.nombre_curso) || tema?.nombre_curso || "Tema"
                    : tema?.nombre_curso || "Tema";

                  return (
                    <List.Item
                      key={temaId}
                      className={temaBloqueado ? "tema-bloqueado" : temaCompletado ? "tema-completado" : "tema-activo"}
                    >
                      <div className={`tema-card-layout ${vista === "plan" ? "" : "tema-card-layout--compact"}`.trim()}>
                        <div className={`tema-card-header ${vista === "plan" ? "" : "tema-card-header--compact"}`.trim()}>
                          <div className="tema-cover-wrap">
                            <img
                              src={temaImageSrc}
                              alt={tema?.nombre_curso || tema?.titulo || `Tema ${temaIndex + 1}`}
                              className="tema-cover-image"
                            />
                            <span
                              className="tema-cover-order"
                              style={{ background: colorAvatarTema, color: "#fff" }}
                            >
                              {tema.orden || temaIndex + 1}
                            </span>
                            <span
                              className="tema-cover-chip"
                              style={{ color: temaVisual.accent }}
                            >
                              {temaVisual.label}
                            </span>
                          </div>

                          <div className="tema-card-header-content">
                            <Text strong>{tema.nombre_curso || tema.titulo || `Tema ${temaIndex + 1}`}</Text>
                            {tema.descripcion ? (
                              <Text type="secondary">{tema.descripcion}</Text>
                            ) : null}
                          </div>
                        </div>

                        <div className="tema-card-body">
                          {temaBloqueado ? null : vista === "plan" ? (
                            <TemaMaterialActions
                              temaId={temaId}
                              temaNombre={tema?.nombre_curso || "Tema"}
                              recursoPrincipalTema={recursoPrincipalTema}
                              tituloRecursoPrincipal={tituloRecursoPrincipal}
                              presentacionesTema={presentacionesTema}
                              quizTema={quizTema}
                              notaQuizTema={notaQuizTema}
                              notaActividadTema={notaActividadTema}
                              materialIcon={recursoPrincipalTema ? getMaterialIconAction(recursoPrincipalTema) : <FilePdfOutlined />}
                              onWarnAction={(warnMessage) => onWarnAction(warnMessage)}
                              onOpenMaterialAction={onOpenMaterialAction}
                              onOpenQuizAction={onOpenQuizAction}
                            />
                          ) : insumosTema.length ? (
                            <Collapse
                              ghost
                              size="small"
                              style={{ marginTop: 4 }}
                              items={[{
                                key: temaId,
                                label: (
                                  <Space size={8}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                      {`${insumosTema.length} material${insumosTema.length !== 1 ? "es" : ""}`}
                                    </Text>
                                    {insumosMarcados > 0 && (
                                      <Tag color="green" style={{ fontSize: 11, padding: "0 5px" }}>
                                        {`${insumosMarcados}/${insumosTema.length} listos`}
                                      </Tag>
                                    )}
                                  </Space>
                                ),
                                children: (
                                  <Space direction="vertical" size={4} style={{ width: "100%", paddingLeft: 4 }}>
                                    {insumosTema.map((insumo: any, itemIndex: number) => {
                                      const key = buildChecklistKeyAction(
                                        String(matriculaSeleccionada.id),
                                        temaId,
                                        String(insumo.id || normalizarTexto(insumo.nombre_material))
                                      );
                                      const nombreInsumo = insumo.materiales_ciclo?.nombre || insumo.nombre_material;
                                      const cantidadInsumo = insumo.materiales_ciclo?.cantidad || insumo.cantidad;
                                      const etiquetaInsumo = `${nombreInsumo}${cantidadInsumo ? ` (${cantidadInsumo}${insumo.unidad ? ` ${insumo.unidad}` : ""})` : ""}`;
                                      return (
                                        <div key={`${temaId}-insumo-${itemIndex}`} style={{ width: "100%" }}>
                                          <div
                                            style={{
                                              display: "grid",
                                              gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) auto",
                                              alignItems: "center",
                                              gap: 8,
                                              width: "100%",
                                            }}
                                          >
                                            <Checkbox
                                              checked={isChecklistItemCheckedAction(key)}
                                              onChange={(event) => {
                                                setChecklistItemCheckedAction(key, event.target.checked);
                                                setTemaRutaIdAction(temaId);
                                                setCicloRutaIdAction(cicloId);
                                              }}
                                              style={{ width: "100%" }}
                                            >
                                              <Text type="secondary" style={{ fontSize: 12 }}>
                                                {etiquetaInsumo}
                                              </Text>
                                            </Checkbox>
                                            <span style={{ width: isMobile ? "100%" : 120, display: "flex", justifyContent: isMobile ? "flex-start" : "flex-end" }}>
                                              {renderCoverageTagForStudent(insumo, true)}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </Space>
                                ),
                              }]}
                            />
                          ) : (
                            <Text type="secondary" style={{ fontSize: 12 }}>Sin materiales registrados</Text>
                          )}
                        </div>
                      </div>
                    </List.Item>
                  );
                }}
              />
            ) : (
              <Empty description="No hay temas registrados en este ciclo." />
            ),
          };
        })}
      />
    </Card>
  );

  if (!showCertificates) {
    return routeContent;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {routeContent}

      <Card size="small" title="Certificados">
        {isMobile ? renderMobileListCardsAction(certificados, (r: any) => ({
          key: String(r?.id || Math.random()),
          title: construirNombreGrupo(r.cursos),
          extra: <Tag color="green">Disponible</Tag>,
          rows: [
            { label: "Nota Final", value: String(r?.nota_final ?? "-") },
          ],
          footer: <Button block icon={<DownloadOutlined />} onClick={() => onDownloadCertificadoAction(r)}>Descargar certificado</Button>,
        }), "No hay certificados disponibles") : <Table
          dataSource={certificados}
          rowKey="id"
          size="small"
          scroll={{ x: 520 }}
          pagination={{ pageSize: 5 }}
          locale={{ emptyText: "No hay certificados disponibles" }}
          columns={[
            { title: "Curso", render: (_, r: any) => construirNombreGrupo(r.cursos) },
            { title: "Nota Final", dataIndex: "nota_final" },
            { title: "Accion", render: (_, r: any) => <Button icon={<DownloadOutlined />} onClick={() => onDownloadCertificadoAction(r)}>Descargar</Button> },
          ]}
        />}
      </Card>
    </Space>
  );
};
"use client";

import React from "react";
import { Button, Card, Checkbox, Col, Collapse, Empty, List, Row, Space, Table, Tag, Typography } from "antd";
import { FilePdfOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { getMaterialCoverageDisplay, normalizeModalidadPago } from "@/types/payment-plans";
import { getMaterialCanonicalTitle } from "@/modules/portal-estudiante/utils";
import { construirNombreGrupo } from "@utils/grupos";
import { TemaMaterialActions } from "@/modules/portal-estudiante/components/TemaMaterialActions";

const { Text } = Typography;

type Props = {
  vista: "plan" | "kits" | "ciclo";
  isMobile: boolean;
  matriculas: any[];
  matriculasActivas: any[];
  matriculaSeleccionada: any;
  ciclosPrograma: any[];
  pagosConPendientes: any[];
  actividadPorTemaMatricula: Map<string, number>;
  renderMobileListCards: (items: any[], getCard: (item: any) => any, emptyText?: string) => React.ReactNode;
  setMatriculaRutaId: (value: string | null) => void;
  setCicloRutaId: (value: string | null) => void;
  setTemaRutaId: (value: string | null) => void;
  obtenerTemasCiclo: (ciclo: any) => any[];
  obtenerMaterialesCiclo: (cicloId: string) => any[];
  obtenerRecursosTema: (tema: any, cicloId?: string | null) => any[];
  obtenerInsumosTema: (tema: any, cicloId?: string | null) => any[];
  deduplicarLista: <T>(items: T[], resolverClave: (item: T) => string) => T[];
  isIframeMaterial: (material: any) => boolean;
  extractIframeSrc: (value?: string | null) => string;
  isTemaCompletadoByTemaId: (temaId: string) => boolean;
  getPrimerTemaPendienteIndex: (temasCiclo: any[]) => number;
  getPrimerCicloIncompletoIndex: (ciclos: any[], obtenerTemasCicloAction: (ciclo: any) => any[]) => number;
  getQuizByTemaId: (temaId: string) => any;
  getNotaByTemaId: (temaId: string) => number | null;
  resolveTemaVisual: (tema: any, cursoContext?: any) => { accent: string; label: string };
  buildTemaImageDataUri: (tema: any, cursoContext?: any) => string;
  buildChecklistKey: (matriculaId: string, temaId: string, insumoKey: string) => string;
  isChecklistItemChecked: (key: string) => boolean;
  setChecklistItemChecked: (key: string, checked: boolean) => void;
  obtenerPdfRelacionado: (material: any, recursosTema?: any[]) => any;
  isPdfMaterial: (material: any) => boolean;
  getMaterialIcon: (material: any) => React.ReactNode;
  abrirMaterialDidactico: (material: any, titulo: string, temaIdForQuiz?: string) => void;
  abrirQuiz: (quiz: any) => Promise<void> | void;
  warnAction: (message: string) => void;
  getVisiblePaymentStatusWithGrace: (pago: any) => string;
  getFechaVencimientoEfectiva: (pago: any) => dayjs.Dayjs | null;
  parseNumeroCuota: (pago: any) => number | null;
  cicloRutaId: string | null;
  normalizarTexto: (value?: string | null) => string;
};

export const PortalRutaAcademicaSection = ({
  vista,
  isMobile,
  matriculas,
  matriculasActivas,
  matriculaSeleccionada,
  ciclosPrograma,
  pagosConPendientes,
  actividadPorTemaMatricula,
  renderMobileListCards,
  setMatriculaRutaId,
  setCicloRutaId,
  setTemaRutaId,
  obtenerTemasCiclo,
  obtenerMaterialesCiclo,
  obtenerRecursosTema,
  obtenerInsumosTema,
  deduplicarLista,
  isIframeMaterial,
  extractIframeSrc,
  isTemaCompletadoByTemaId,
  getPrimerTemaPendienteIndex,
  getPrimerCicloIncompletoIndex,
  getQuizByTemaId,
  getNotaByTemaId,
  resolveTemaVisual,
  buildTemaImageDataUri,
  buildChecklistKey,
  isChecklistItemChecked,
  setChecklistItemChecked,
  obtenerPdfRelacionado,
  isPdfMaterial,
  getMaterialIcon,
  abrirMaterialDidactico,
  abrirQuiz,
  warnAction,
  getVisiblePaymentStatusWithGrace,
  getFechaVencimientoEfectiva,
  parseNumeroCuota,
  cicloRutaId,
  normalizarTexto,
}: Props) => {
  if (!matriculas.length) return <Empty description="No tienes cursos activos" />;

  const tituloPrincipal = vista === "plan"
    ? "Contenido del Curso - Pensum"
    : vista === "ciclo"
      ? "Materiales generales por ciclo"
      : "Materiales necesarios";
  const coloresCiclo = vista === "plan"
    ? ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a"]
    : ["#16a34a", "#0f766e", "#0284c7", "#7c3aed", "#ea580c"];
  const colorNumeroTema = vista === "plan" ? "#2563eb" : "#16a34a";

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
                {construirNombreGrupo(mat?.cursos) || `Curso ${mat.id}`}
              </Button>
            </Col>
          ))}
        </Row>
      </StepCard>
    );
  }

  const cicloActivo =
    cicloRutaId && ciclosPrograma.some((c: any) => String(c.id) === String(cicloRutaId))
      ? String(cicloRutaId)
      : String(ciclosPrograma[0]?.id || "");

  const modalidadMateriales = normalizeModalidadPago(matriculaSeleccionada?.modalidad_pago);
  const esPlanMensualSeleccionado = modalidadMateriales !== "POR_CLASE";
  const porClaseTieneMoraMatriculaSeleccionada = modalidadMateriales === "POR_CLASE"
    && pagosConPendientes.some((p: any) => {
      if (String(p?.matricula_id || "") !== String(matriculaSeleccionada?.id || "")) return false;
      if (String(p?.estado || "").toLowerCase() !== "pendiente") return false;
      const fecha = getFechaVencimientoEfectiva(p);
      return Boolean(fecha && dayjs().startOf("day").isAfter(fecha));
    });

  const ciclosMensualesPagados = esPlanMensualSeleccionado
    ? (() => {
        const cuotasPagadas = new Set<number>();

        (pagosConPendientes || []).forEach((pago: any) => {
          if (String(pago?.matricula_id || "") !== String(matriculaSeleccionada?.id || "")) return;

          const numeroCuota = parseNumeroCuota(pago);
          if (!numeroCuota || numeroCuota <= 0) return;

          if (getVisiblePaymentStatusWithGrace(pago) === "pagado") {
            cuotasPagadas.add(numeroCuota);
          }
        });

        let consecutivas = 0;
        while (cuotasPagadas.has(consecutivas + 1)) {
          consecutivas += 1;
        }

        return consecutivas;
      })()
    : 0;

  const renderCoverageTagForStudent = (materialRef: any, compact = false) => {
    const display = getMaterialCoverageDisplay({
      modalidadPago: matriculaSeleccionada?.modalidad_pago,
      porcentajeProductos: matriculaSeleccionada?.porcentaje_productos,
      coberturaMaterial: materialRef?.cobertura_material ?? materialRef?.materiales_ciclo?.cobertura_material,
      incluidoKit: materialRef?.incluido_kit ?? materialRef?.materiales_ciclo?.incluido_kit,
    });

    const visualByStatus = {
      included: {
        background: "#ecfdf3",
        borderColor: "#86efac",
        color: "#166534",
      },
      upgrade_required: {
        background: "#fffbeb",
        borderColor: "#fcd34d",
        color: "#92400e",
      },
      not_included: {
        background: "#f8fafc",
        borderColor: "#cbd5e1",
        color: "#475569",
      },
    } as const;

    const visual = visualByStatus[display.status];

    return (
      <Tag
        color={display.color}
        style={{
          fontSize: compact ? 12 : isMobile ? 12 : 13,
          padding: compact ? "2px 8px" : isMobile ? "4px 10px" : "4px 12px",
          marginInlineEnd: 0,
          borderRadius: 999,
          fontWeight: 600,
          border: `1px solid ${visual.borderColor}`,
          borderColor: visual.borderColor,
          color: visual.color,
          background: visual.background,
          whiteSpace: "nowrap",
          display: "inline-flex",
          justifyContent: "center",
          textAlign: "center",
          minWidth: compact ? 104 : undefined,
        }}
      >
        {compact ? display.shortLabel : isMobile ? display.shortLabel : display.label}
      </Tag>
    );
  };

  if (!ciclosPrograma.length) {
    return (
      <StepCard title={tituloPrincipal}>
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Button type="text" size="small" onClick={() => setMatriculaRutaId(null)}>Volver a cursos</Button>
          <Empty description="Este curso aun no tiene modulos/ciclos configurados" />
        </Space>
      </StepCard>
    );
  }

  const primerCicloIncompletoIndex = getPrimerCicloIncompletoIndex(ciclosPrograma, obtenerTemasCiclo);

  return (
    <Card
      title={tituloPrincipal}
      size={isMobile ? "small" : "default"}
    >
      <Space direction="vertical" size={12} style={{ width: "100%", marginBottom: 12 }}>
        <Text strong>Curso activo</Text>
        <Row gutter={[10, 10]}>
          {matriculasActivas.map((mat: any) => {
            const activo = String(mat?.id) === String(matriculaSeleccionada?.id);
            return (
              <Col xs={24} sm={12} lg={8} key={mat.id}>
                <Button
                  block
                  type={activo ? "primary" : "default"}
                  onClick={() => {
                    setMatriculaRutaId(String(mat.id));
                    setCicloRutaId(null);
                    setTemaRutaId(null);
                  }}
                >
                  {construirNombreGrupo(mat?.cursos) || `Curso ${mat.id}`}
                </Button>
              </Col>
            );
          })}
        </Row>
      </Space>

      <Collapse
        accordion
        expandIconPosition="end"
        activeKey={cicloActivo || undefined}
        onChange={(key) => {
          const value = Array.isArray(key) ? key[0] : key;
          setCicloRutaId(value ? String(value) : null);
        }}
        items={ciclosPrograma.map((ciclo: any, index: number) => {
          const cicloId = String(ciclo?.id || `ciclo-${index}`);
          const cicloNumero = ciclo?.numero_ciclo ?? ciclo?.orden ?? index + 1;
          const cicloNombre = ciclo?.nombre_ciclo || ciclo?.titulo || `Ciclo ${cicloNumero}`;
          const colorCiclo = coloresCiclo[index % coloresCiclo.length];
          const temasCiclo = obtenerTemasCiclo(ciclo);
          const materialesGenerales = obtenerMaterialesCiclo(cicloId);

          const cicloBloqueado = esPlanMensualSeleccionado
            ? index >= ciclosMensualesPagados
            : index > primerCicloIncompletoIndex;
          const primerIndexActual = cicloBloqueado ? 0 : getPrimerTemaPendienteIndex(temasCiclo);

          return {
            key: cicloId,
            collapsible: cicloBloqueado ? "disabled" : undefined,
            className: cicloBloqueado ? "ciclo-bloqueado" : "",
            label: (
              <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 16, opacity: cicloBloqueado ? 0.4 : 1, filter: cicloBloqueado ? "grayscale(0.7)" : undefined, minWidth: 0 }}>
                <div
                  className="ciclo-avatar"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 16,
                    background: cicloBloqueado ? "#d9d9d9" : colorCiclo,
                    color: cicloBloqueado ? "#a0a0a0" : "#f8fafc",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    fontWeight: 700,
                  }}
                >
                  {cicloNumero}
                </div>
                <div style={{ minWidth: 0 }}>
                  <Text strong style={{ fontSize: isMobile ? 14 : 16, color: cicloBloqueado ? "#bfbfbf" : undefined, whiteSpace: "normal" }}>{cicloNombre}</Text>
                  {vista === "kits" ? (
                    <div><Text type="secondary">Materiales por tema</Text></div>
                  ) : ciclo?.descripcion ? (
                    <div><Text type="secondary">{ciclo.descripcion}</Text></div>
                  ) : null}
                </div>
              </div>
            ),
            children: vista === "ciclo" ? (
              materialesGenerales.length ? (
                isMobile ? renderMobileListCards(materialesGenerales, (record: any) => ({
                  key: String(record?.id || record?.nombre),
                  title: <Text strong>{record?.nombre || "Producto"}</Text>,
                  extra: renderCoverageTagForStudent(record, true),
                  rows: [
                    { label: "Cantidad", value: record?.cantidad || "Cantidad por definir" },
                  ],
                })) : <Table
                  dataSource={materialesGenerales}
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
                      title: "Incluido en tu plan",
                      dataIndex: "cobertura_material",
                      align: "center",
                      render: (_value, record: any) => renderCoverageTagForStudent(record),
                    },
                  ]}
                />
              ) : (
                <Text type="secondary">No hay materiales generales registrados para este ciclo.</Text>
              )
            ) : temasCiclo.length ? (
              <List
                dataSource={temasCiclo}
                renderItem={(tema: any, temaIndex: number) => {
                  const temaId = String(tema?.id || `tema-${temaIndex}`);
                  const recursosTema = obtenerRecursosTema(tema, cicloId);
                  const presentacionesTema = deduplicarLista(
                    recursosTema.filter((recurso: any) => isIframeMaterial(recurso)),
                    (recurso: any) =>
                      String(
                        `${String(recurso?.pensum_id || "")}-${String(recurso?.pensum_curso_id || "")}-${extractIframeSrc(recurso?.url_archivo) || String(recurso?.id || recurso?.titulo || "")}`
                      ).toLowerCase()
                  )
                    .map((recurso: any, index2: number) => ({
                      id: String(recurso?.id || `gamma-${index2}`),
                      titulo: getMaterialCanonicalTitle(recurso, tema?.nombre_curso) || tema?.nombre_curso || "Material",
                      material: recurso,
                    }));
                  const insumosTema = obtenerInsumosTema(tema, cicloId);
                  const temaCompletado = isTemaCompletadoByTemaId(temaId);
                  const bloqueoTemaActualPorPagoPorClase = porClaseTieneMoraMatriculaSeleccionada
                    && temaIndex === primerIndexActual
                    && !temaCompletado;
                  const temaBloqueado = vista === "plan"
                    ? (cicloBloqueado || temaIndex > primerIndexActual || bloqueoTemaActualPorPagoPorClase)
                    : cicloBloqueado;
                  const quizTema = getQuizByTemaId(temaId);
                  const notaQuizTema = getNotaByTemaId(temaId);
                  const notaActividadTema = actividadPorTemaMatricula.get(`${matriculaSeleccionada?.id || ""}-${temaId}`) ?? null;
                  const colorAvatarTema = temaBloqueado ? "#bfbfbf" : temaCompletado ? "#16a34a" : colorNumeroTema;
                  const temaVisual = resolveTemaVisual(tema, matriculaSeleccionada?.cursos);
                  const temaImageSrc = buildTemaImageDataUri(tema, matriculaSeleccionada?.cursos);
                  const insumosMarcados = insumosTema.filter((insumo: any) => {
                    const key = buildChecklistKey(
                      String(matriculaSeleccionada.id),
                      temaId,
                      String(insumo.id || normalizarTexto(insumo.nombre_material))
                    );
                    return isChecklistItemChecked(key);
                  }).length;
                  const recursoPdfTema = obtenerPdfRelacionado({ titulo: tema?.nombre_curso }, recursosTema);
                  const recursoPrincipalTema = recursosTema.find((recurso: any) => !isPdfMaterial(recurso)) || recursoPdfTema || recursosTema[0] || null;
                  const tituloRecursoPrincipal = recursoPrincipalTema
                    ? getMaterialCanonicalTitle(recursoPrincipalTema, tema?.nombre_curso) || tema?.nombre_curso || "Tema"
                    : tema?.nombre_curso || "Tema";

                  return (
                    <List.Item
                      key={temaId}
                      className={temaBloqueado ? "tema-bloqueado" : temaCompletado ? "tema-completado" : "tema-activo"}
                    >
                      <div className={`tema-card-layout ${vista === "plan" ? "" : "tema-card-layout--compact"}`.trim()}>
                        <div className={`tema-card-header ${vista === "plan" ? "" : "tema-card-header--compact"}`.trim()}>
                          <div className="tema-cover-wrap">
                            <img
                              src={temaImageSrc}
                              alt={tema?.nombre_curso || tema?.titulo || `Tema ${temaIndex + 1}`}
                              className="tema-cover-image"
                            />
                            <span
                              className="tema-cover-order"
                              style={{ background: colorAvatarTema, color: "#fff" }}
                            >
                              {tema.orden || temaIndex + 1}
                            </span>
                            <span
                              className="tema-cover-chip"
                              style={{ color: temaVisual.accent }}
                            >
                              {temaVisual.label}
                            </span>
                          </div>

                          <div className="tema-card-header-content">
                            <Text strong>{tema.nombre_curso || tema.titulo || `Tema ${temaIndex + 1}`}</Text>
                            {tema.descripcion ? (
                              <Text type="secondary">{tema.descripcion}</Text>
                            ) : null}
                          </div>
                        </div>

                        <div className="tema-card-body">
                          {temaBloqueado ? null : vista === "plan" ? (
                            <TemaMaterialActions
                              temaId={temaId}
                              temaNombre={tema?.nombre_curso || "Tema"}
                              recursoPrincipalTema={recursoPrincipalTema}
                              tituloRecursoPrincipal={tituloRecursoPrincipal}
                              presentacionesTema={presentacionesTema}
                              quizTema={quizTema}
                              notaQuizTema={notaQuizTema}
                              notaActividadTema={notaActividadTema}
                              materialIcon={recursoPrincipalTema ? getMaterialIcon(recursoPrincipalTema) : <FilePdfOutlined />}
                              onWarnAction={warnAction}
                              onOpenMaterialAction={abrirMaterialDidactico}
                              onOpenQuizAction={abrirQuiz}
                            />
                          ) : insumosTema.length ? (
                            <Collapse
                              ghost
                              size="small"
                              style={{ marginTop: 4 }}
                              items={[{
                                key: temaId,
                                label: (
                                  <Space size={8}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                      {`${insumosTema.length} material${insumosTema.length !== 1 ? "es" : ""}`}
                                    </Text>
                                    {insumosMarcados > 0 && (
                                      <Tag color="green" style={{ fontSize: 11, padding: "0 5px" }}>
                                        {`${insumosMarcados}/${insumosTema.length} listos`}
                                      </Tag>
                                    )}
                                  </Space>
                                ),
                                children: (
                                  <Space direction="vertical" size={4} style={{ width: "100%", paddingLeft: 4 }}>
                                    {insumosTema.map((insumo: any, itemIndex: number) => {
                                      const key = buildChecklistKey(
                                        String(matriculaSeleccionada.id),
                                        temaId,
                                        String(insumo.id || normalizarTexto(insumo.nombre_material))
                                      );
                                      const nombreInsumo = insumo.materiales_ciclo?.nombre || insumo.nombre_material;
                                      const cantidadInsumo = insumo.materiales_ciclo?.cantidad || insumo.cantidad;
                                      const etiquetaInsumo = `${nombreInsumo}${cantidadInsumo ? ` (${cantidadInsumo}${insumo.unidad ? ` ${insumo.unidad}` : ""})` : ""}`;
                                      return (
                                        <div key={`${temaId}-insumo-${itemIndex}`} style={{ width: "100%" }}>
                                          <div
                                            style={{
                                              display: "grid",
                                              gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) auto",
                                              alignItems: "center",
                                              gap: 8,
                                              width: "100%",
                                            }}
                                          >
                                            <Checkbox
                                              checked={isChecklistItemChecked(key)}
                                              onChange={(event) => {
                                                setChecklistItemChecked(key, event.target.checked);
                                                setTemaRutaId(temaId);
                                                setCicloRutaId(cicloId);
                                              }}
                                              style={{ width: "100%" }}
                                            >
                                              <Text type="secondary" style={{ fontSize: 12 }}>
                                                {etiquetaInsumo}
                                              </Text>
                                            </Checkbox>
                                            <span style={{ width: isMobile ? "100%" : 120, display: "flex", justifyContent: isMobile ? "flex-start" : "flex-end" }}>
                                              {renderCoverageTagForStudent(insumo, true)}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </Space>
                                ),
                              }]}
                            />
                          ) : (
                            <Text type="secondary" style={{ fontSize: 12 }}>Sin materiales registrados</Text>
                          )}
                        </div>
                      </div>
                    </List.Item>
                  );
                }}
              />
            ) : (
              <Empty description="No hay temas registrados en este ciclo." />
            ),
          };
        })}
      />
    </Card>
  );
};
