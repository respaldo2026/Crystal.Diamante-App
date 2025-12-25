"use client";

import React, { useState, useEffect } from "react";
import { List, useTable, EditButton, DeleteButton, useSelect, CreateButton } from "@refinedev/antd";
import { Table, Space, Tag, Card, Row, Col, Select, Progress, Typography, Statistic, Alert, Button } from "antd";
import { 
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, 
  InfoCircleOutlined, WarningOutlined, TrophyOutlined, UserOutlined,
  ReloadOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { supabaseBrowserClient } from "@utils/supabase/client";

const { Text } = Typography;

export default function ListAsistencias() {
  const [cursoSeleccionado, setCursoSeleccionado] = useState<number | null>(null);
  const [estadisticas, setEstadisticas] = useState<any[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);

  const { tableProps } = useTable({
    resource: "asistencias",
    sorters: { initial: [{ field: "fecha", order: "desc" }] },
    meta: {
      select: "*, matriculas(id, perfiles(nombre_completo), cursos(nombre, porcentaje_minimo))"
    },
    filters: {
      permanent: cursoSeleccionado ? [
        { field: "matriculas.curso_id", operator: "eq", value: cursoSeleccionado }
      ] : []
    }
  });

  // Selector de cursos
  const { selectProps: cursoSelect } = useSelect({
    resource: "cursos",
    optionLabel: "nombre",
    optionValue: "id",
  });

  // Calcular estadísticas por estudiante
  const calcularEstadisticas = async () => {
    if (!cursoSeleccionado) return;
    
    setLoadingStats(true);
    try {
      // 1. Obtener todas las matrículas del curso
      const { data: matriculas } = await supabaseBrowserClient
        .from("matriculas")
        .select("id, estudiante_id, perfiles(nombre_completo), cursos(nombre, porcentaje_minimo, total_clases)")
        .eq("curso_id", cursoSeleccionado)
        .eq("estado", "activo");

      // 2. Obtener todas las asistencias de estas matrículas
      const matriculaIds = matriculas?.map(m => m.id) || [];
      
      const { data: asistencias } = await supabaseBrowserClient
        .from("asistencias")
        .select("matricula_id, estado")
        .in("matricula_id", matriculaIds);

      // 3. Calcular porcentaje por estudiante
      const stats = matriculas?.map(matricula => {
        const asistenciasAlumno = asistencias?.filter(a => a.matricula_id === matricula.id) || [];
        const totalClases = asistenciasAlumno.length;
        const presentes = asistenciasAlumno.filter(a => a.estado === 'presente').length;
        const porcentaje = totalClases > 0 ? (presentes / totalClases) * 100 : 0;
        const minimoRequerido = matricula.cursos?.porcentaje_minimo || 80;

        return {
          matricula_id: matricula.id,
          estudiante: matricula.perfiles?.nombre_completo || "Sin nombre",
          totalClases,
          presentes,
          ausentes: totalClases - presentes,
          porcentaje: Math.round(porcentaje),
          minimoRequerido,
          cumple: porcentaje >= minimoRequerido,
          estado: porcentaje >= minimoRequerido ? 'ok' : porcentaje >= (minimoRequerido - 10) ? 'warning' : 'danger'
        };
      }) || [];

      setEstadisticas(stats);
    } catch (error) {
      console.error("Error calculando estadísticas:", error);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (cursoSeleccionado) {
      calcularEstadisticas();
    } else {
      setEstadisticas([]);
    }
  }, [cursoSeleccionado]);

  // Calcular resumen general
  const estudiantesEnRiesgo = estadisticas.filter(e => !e.cumple).length;
  const promedioAsistencia = estadisticas.length > 0 
    ? Math.round(estadisticas.reduce((sum, e) => sum + e.porcentaje, 0) / estadisticas.length)
    : 0;

  return (
    <List 
      title="Control de Asistencias"
      headerButtons={
        <Space>
          <CreateButton type="primary">Tomar Asistencia</CreateButton>
        </Space>
      }
    >
      {/* FILTROS Y SELECTOR DE CURSO */}
      <Card style={{ marginBottom: 20 }}>
        <Row gutter={16} align="middle">
          <Col xs={24} md={12}>
            <Text strong>Filtrar por Curso:</Text>
            <Select 
              {...cursoSelect}
              style={{ width: '100%', marginTop: 8 }}
              placeholder="Selecciona un curso para ver estadísticas..."
              onChange={(val) => setCursoSeleccionado(val)}
              value={cursoSeleccionado}
              allowClear
            />
          </Col>
          <Col xs={24} md={12}>
            {cursoSeleccionado && (
              <Button 
                icon={<ReloadOutlined />} 
                onClick={calcularEstadisticas}
                loading={loadingStats}
              >
                Actualizar Estadísticas
              </Button>
            )}
          </Col>
        </Row>
      </Card>

      {/* TARJETAS DE RESUMEN */}
      {cursoSeleccionado && estadisticas.length > 0 && (
        <Row gutter={16} style={{ marginBottom: 20 }}>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Promedio de Asistencia"
                value={promedioAsistencia}
                suffix="%"
                valueStyle={{ color: promedioAsistencia >= 80 ? '#3f8600' : '#cf1322' }}
                prefix={<TrophyOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Estudiantes en Riesgo"
                value={estudiantesEnRiesgo}
                valueStyle={{ color: estudiantesEnRiesgo > 0 ? '#cf1322' : '#3f8600' }}
                prefix={<WarningOutlined />}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                No cumplen % mínimo
              </Text>
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Total Estudiantes"
                value={estadisticas.length}
                prefix={<UserOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* TABLA DE ESTADÍSTICAS POR ESTUDIANTE */}
      {cursoSeleccionado && estadisticas.length > 0 && (
        <Card title="📊 Estadísticas de Asistencia por Estudiante" style={{ marginBottom: 20 }}>
          <Table 
            dataSource={estadisticas}
            rowKey="matricula_id"
            loading={loadingStats}
            pagination={{ pageSize: 10 }}
          >
            <Table.Column
              title="Estudiante"
              dataIndex="estudiante"
              render={(nombre, record: any) => (
                <Space>
                  {record.estado === 'danger' && <WarningOutlined style={{ color: '#ff4d4f' }} />}
                  <Text strong={record.estado === 'danger'}>{nombre}</Text>
                </Space>
              )}
            />
            <Table.Column
              title="Clases Totales"
              dataIndex="totalClases"
              align="center"
            />
            <Table.Column
              title="Presentes"
              dataIndex="presentes"
              align="center"
              render={(val) => <Tag color="green">{val}</Tag>}
            />
            <Table.Column
              title="Ausentes"
              dataIndex="ausentes"
              align="center"
              render={(val) => <Tag color="red">{val}</Tag>}
            />
            <Table.Column
              title="% Asistencia"
              dataIndex="porcentaje"
              align="center"
              render={(val, record: any) => (
                <div style={{ minWidth: 100 }}>
                  <Progress 
                    percent={val} 
                    size="small"
                    status={record.estado === 'ok' ? 'success' : record.estado === 'warning' ? 'normal' : 'exception'}
                    format={(percent) => `${percent}%`}
                  />
                </div>
              )}
              sorter={(a, b) => a.porcentaje - b.porcentaje}
            />
            <Table.Column
              title="Estado"
              dataIndex="cumple"
              align="center"
              render={(cumple, record: any) => {
                if (cumple) {
                  return <Tag color="success" icon={<CheckCircleOutlined />}>APTO</Tag>;
                }
                return (
                  <Tag color="error" icon={<WarningOutlined />}>
                    RIESGO ({record.porcentaje}% &lt; {record.minimoRequerido}%)
                  </Tag>
                );
              }}
              filters={[
                { text: 'Apto', value: true },
                { text: 'En Riesgo', value: false }
              ]}
              onFilter={(value, record) => record.cumple === value}
            />
          </Table>

          {estudiantesEnRiesgo > 0 && (
            <Alert
              message="⚠️ Acción Requerida"
              description={`${estudiantesEnRiesgo} estudiante(s) no cumplen con el porcentaje mínimo de asistencia. No podrán certificarse hasta mejorar su asistencia.`}
              type="warning"
              showIcon
              style={{ marginTop: 16 }}
            />
          )}
        </Card>
      )}

      {/* TABLA DE ASISTENCIAS (HISTÓRICO) */}
      <Card title="📋 Histórico de Asistencias"
        extra={
          cursoSeleccionado && (
            <Text type="secondary">Mostrando: Curso seleccionado</Text>
          )
        }
      >
      {/* TABLA DE ASISTENCIAS (HISTÓRICO) */}
      <Card title="📋 Histórico de Asistencias"
        extra={
          cursoSeleccionado && (
            <Text type="secondary">Mostrando: Curso seleccionado</Text>
          )
        }
      >
      <Table {...tableProps} rowKey="id">
        
        {/* FECHA */}
        <Table.Column 
            title="Fecha" 
            dataIndex="fecha" 
            render={(val) => dayjs(val).format("DD/MM/YYYY")}
            sorter
        />

        {/* ESTUDIANTE */}
        <Table.Column
          title="Estudiante"
          render={(_, record: any) => (
            <Text strong>{record.matriculas?.perfiles?.nombre_completo || "Desconocido"}</Text>
          )}
        />

        {/* CURSO */}
        <Table.Column
          title="Curso"
          render={(_, record: any) => (
            <Tag color="purple">{record.matriculas?.cursos?.nombre || "N/A"}</Tag>
          )}
        />

        {/* ESTADO (Visualmente claro) */}
        <Table.Column 
            title="Estado" 
            dataIndex="estado" 
            render={(val) => {
                if(val === 'presente') return <Tag color="green" icon={<CheckCircleOutlined/>}>Presente</Tag>
                if(val === 'ausente') return <Tag color="red" icon={<CloseCircleOutlined/>}>Ausente</Tag>
                if(val === 'tarde') return <Tag color="orange" icon={<ClockCircleOutlined/>}>Tarde</Tag>
                return <Tag color="blue" icon={<InfoCircleOutlined/>}>Excusa</Tag>
            }}
        />

        {/* OBSERVACIONES */}
        <Table.Column title="Notas" dataIndex="observaciones" />

        {/* ACCIONES */}
        <Table.Column
          title="Acciones"
          dataIndex="actions"
          render={(_, record: any) => (
            <Space>
              <EditButton hideText size="small" recordItemId={record.id} />
              <DeleteButton hideText size="small" recordItemId={record.id} />
            </Space>
          )}
        />
      </Table>
      </Card>
    </List>
  );
}