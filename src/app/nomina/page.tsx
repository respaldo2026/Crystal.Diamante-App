"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
    Table, Card, Button, DatePicker, Row, Col, Typography, Select,
    Statistic, Tag, message, Modal, Space, Alert
} from "antd";
import { 
  CalculatorOutlined, DollarCircleOutlined, PayCircleOutlined 
} from "@ant-design/icons";
import dayjs from "dayjs";
import { formatDate } from "@utils/date";

// CORRECCIÓN: Usamos tu cliente configurado en utils, no creamos uno nuevo
import { useCurrentUser } from "@hooks/useCurrentUser";
import { supabaseBrowserClient } from "@utils/supabase/client";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

export default function NominaPage() {
  const { user } = useCurrentUser();
  const [loading, setLoading] = useState(false);
  const [profesores, setProfesores] = useState<any[]>([]);
  // Iniciamos con el mes actual por defecto
  const [rangoFechas, setRangoFechas] = useState<any>([dayjs().startOf('month'), dayjs().endOf('month')]);
  const [totalAPagar, setTotalAPagar] = useState(0);
  const [metodoNomina, setMetodoNomina] = useState<string>('Efectivo');
    const [clasesPendientes, setClasesPendientes] = useState<any[]>([]);
    const [pagandoClaseId, setPagandoClaseId] = useState<string | null>(null);

  // Modal Pagar
  const [modalVisible, setModalVisible] = useState(false);
  const [profesorSeleccionado, setProfesorSeleccionado] = useState<any>(null);

    const columnasNomina = useMemo(
        () => [
            { title: 'Profesor', dataIndex: 'nombre_completo' },
            {
                title: 'Valor Hora',
                dataIndex: 'valor_hora',
                render: (val: number) => val ? `$ ${Number(val).toLocaleString()}` : <Tag color="red">Sin definir</Tag>,
            },
            {
                title: 'Horas Trabajadas',
                dataIndex: 'total_horas',
                render: (val: number) => <Tag color="blue">{val} hrs</Tag>,
            },
            {
                title: 'A Pagar',
                dataIndex: 'total_pagado',
                render: (val: number) => <Text strong type="success">$ {Number(val).toLocaleString()}</Text>,
            },
            {
                title: 'Acción',
                render: (_: any, record: any) => (
                    <Button
                        type="primary"
                        icon={<PayCircleOutlined />}
                        disabled={record.total_pagado <= 0}
                        onClick={() => {
                            setProfesorSeleccionado(record);
                            setModalVisible(true);
                        }}
                    >
                        Pagar
                    </Button>
                ),
            },
        ],
        []
    );

    const columnasClases = useMemo(
        () => [
            {
                title: 'Fecha',
                dataIndex: 'fecha',
                render: (val: string) => formatDate(val),
            },
            {
                title: 'Profesor',
                dataIndex: 'profesor_id',
                render: (_: any, record: any) => record.perfiles?.nombre_completo || 'Sin nombre',
            },
            {
                title: 'Curso',
                dataIndex: 'curso_id',
                render: (_: any, record: any) => record.cursos?.nombre || '—',
            },
            {
                title: 'Tema',
                dataIndex: 'tema_visto',
                render: (val: string | null) => val || 'Sin tema',
            },
            {
                title: 'Horas',
                dataIndex: 'horas_dictadas',
                render: (val: number) => <Tag color="blue">{val} hrs</Tag>,
            },
            {
                title: 'Estado',
                dataIndex: 'estado_pago',
                render: (val: string) => {
                    if (val === 'pendiente') {
                        return <Tag color="orange">PENDIENTE</Tag>;
                    } else if (val === 'pagado') {
                        return <Tag color="green">✓ PAGADO</Tag>;
                    }
                    return <Tag>{val}</Tag>;
                },
            },
            {
                title: 'Valor Hora',
                dataIndex: 'valor_hora',
                render: (val: number) => val ? `$ ${Number(val).toLocaleString()}` : <Tag color="red">Sin definir</Tag>,
            },
            {
                title: 'A Pagar',
                dataIndex: 'total_estimado',
                render: (val: number) => <Text strong type="success">$ {Number(val || 0).toLocaleString()}</Text>,
            },
            {
                title: 'Acción',
                render: (_: any, record: any) => {
                    const estaPagado = record.estado_pago === 'pagado';
                    return (
                        <Button
                            type={estaPagado ? "text" : "default"}
                            size="small"
                            disabled={estaPagado || !record.total_estimado}
                            loading={pagandoClaseId === record.id}
                            onClick={() => pagarClaseIndividual(record)}
                        >
                            {estaPagado ? '✓ Pagado' : 'Pagar'}
                        </Button>
                    );
                },
            },
        ],
        [pagandoClaseId]
    );

  useEffect(() => {
    calcularNomina();
  }, [rangoFechas]);

  const calcularNomina = async () => {
    if (!rangoFechas) return;
    setLoading(true);

    const inicio = rangoFechas[0].format("YYYY-MM-DD");
    const fin = rangoFechas[1].format("YYYY-MM-DD");

    try {
        // 1. Obtener profesores y su valor hora
        let query = supabaseBrowserClient
            .from("perfiles")
            .select("id, nombre_completo, valor_hora")
            .eq("rol", "profesor");

        // Si es profesor, solo ve su propia información
        if (user?.rol === "profesor") {
            query = query.eq("id", user.id);
        }

        const { data: dataProfes } = await query;

        // 2. Obtener sesiones trabajadas en ese rango (AMBAS: pendiente y pagado)
        const { data: sesiones } = await supabaseBrowserClient
            .from("sesiones_clase")
            .select("id, profesor_id, curso_id, fecha, horas_dictadas, tema_visto, estado_pago, cursos(nombre), perfiles!sesiones_clase_profesor_id_fkey(nombre_completo, valor_hora)")
            .gte("fecha", inicio)
            .lte("fecha", fin)
            .order("fecha", { ascending: true });

                // 3. Cruzar información (Matemática de Nómina)
                // IMPORTANTE: Los profesores solo ven clases PENDIENTES para pagar
                const sesionesPendientes = sesiones?.filter((s: any) => s.estado_pago === 'pendiente') || [];
                const reporte = dataProfes?.map((prof: any) => {
                        const susClases = sesionesPendientes.filter((s: any) => s.profesor_id === prof.id) || [];
                        const totalHoras = susClases.reduce((sum: number, item: any) => sum + Number(item.horas_dictadas || 0), 0);
                        const aPagar = totalHoras * (prof.valor_hora || 0);

                        return {
                                ...prof,
                                total_horas: totalHoras,
                                total_pagado: aPagar,
                                detalles: susClases
                        };
                }).filter((p: any) => p.total_horas > 0 || true);

                // Enriquecer TODAS las sesiones (pendientes Y pagadas) para la tabla detallada
                const sesionesEnriquecidas = (sesiones || []).map((s: any) => {
                    const valorHora = Number(
                        s?.perfiles?.valor_hora ??
                        dataProfes?.find((p: any) => p.id === s.profesor_id)?.valor_hora ??
                        0
                    );
                    const totalEstimado = Number(s.horas_dictadas || 0) * (valorHora || 0);
                    return {
                        ...s,
                        valor_hora: valorHora,
                        total_estimado: totalEstimado,
                    };
                });

                setClasesPendientes(sesionesEnriquecidas);

        setProfesores(reporte || []);
        
        const totalGeneral = reporte?.reduce((acc: number, curr: any) => acc + curr.total_pagado, 0) || 0;
        setTotalAPagar(totalGeneral);

    } catch (error) {
        console.error(error);
        message.error("Error calculando nómina");
    } finally {
        setLoading(false);
    }
  };

  const procesarPago = async () => {
      if (!profesorSeleccionado) return;
      
      try {
        // 1. Guardar en historial de pagos (pagos_nomina)
        const { error: errPago } = await supabaseBrowserClient.from("pagos_nomina").insert({
            profesor_id: profesorSeleccionado.id,
            fecha_pago: dayjs().format("YYYY-MM-DD"),
            total_pagado: profesorSeleccionado.total_pagado,
            total_horas: profesorSeleccionado.total_horas,
            fecha_inicio_periodo: rangoFechas[0].format("YYYY-MM-DD"),
            fecha_fin_periodo: rangoFechas[1].format("YYYY-MM-DD"),
            observaciones: `Pago por ${profesorSeleccionado.total_horas} horas trabajadas del ${formatDate(rangoFechas[0])} al ${formatDate(rangoFechas[1])} - Método: ${metodoNomina}`
        });
        if (errPago) throw errPago;

        // 2. Marcar clases como PAGADAS
        const inicio = rangoFechas[0].format("YYYY-MM-DD");
        const fin = rangoFechas[1].format("YYYY-MM-DD");

        const { error: errUpdate } = await supabaseBrowserClient
            .from("sesiones_clase")
            .update({ estado_pago: 'pagado' })
            .eq("profesor_id", profesorSeleccionado.id)
            .gte("fecha", inicio)
            .lte("fecha", fin)
            .eq("estado_pago", "pendiente");

        if (errUpdate) throw errUpdate;

        message.success(`Pago registrado a ${profesorSeleccionado.nombre_completo}`);
        setModalVisible(false);
        calcularNomina(); // Refrescar pantalla

      } catch (error: any) {
          message.error("Error: " + error.message);
      }
  };

    const pagarClaseIndividual = async (clase: any) => {
        Modal.confirm({
            title: '¿Pagar esta clase?',
            content: (
                <div>
                    <p>Profesor: <b>{clase.perfiles?.nombre_completo}</b></p>
                    <p>Curso: <b>{clase.cursos?.nombre || '—'}</b></p>
                    <p>Fecha: <b>{formatDate(clase.fecha)}</b></p>
                    <p>Horas: <b>{clase.horas_dictadas}</b> | Total: <b>$ {Number(clase.total_estimado || 0).toLocaleString()}</b></p>
                </div>
            ),
            okText: 'Pagar clase',
            cancelText: 'Cancelar',
            onOk: async () => {
                try {
                    setPagandoClaseId(clase.id);
                    const valorHora = Number(clase.valor_hora || 0);
                    const monto = Number(clase.horas_dictadas || 0) * (valorHora || 0);

                    await supabaseBrowserClient.from("pagos_nomina").insert({
                        profesor_id: clase.profesor_id,
                        fecha_pago: dayjs().format("YYYY-MM-DD"),
                        total_pagado: monto,
                        total_horas: clase.horas_dictadas,
                        fecha_inicio_periodo: clase.fecha,
                        fecha_fin_periodo: clase.fecha,
                        observaciones: `Pago clase individual - ${clase.cursos?.nombre || 'Clase'} (${metodoNomina})`
                    });

                    await supabaseBrowserClient
                        .from("sesiones_clase")
                        .update({ estado_pago: 'pagado' })
                        .eq("id", clase.id)
                        .eq("estado_pago", "pendiente");

                    message.success("Clase pagada y descontada del pendiente");
                    calcularNomina();
                } catch (error: any) {
                    message.error("Error pagando clase: " + error.message);
                } finally {
                    setPagandoClaseId(null);
                }
            }
        });
    };

  return (
    <div style={{ padding: 24 }}>
        <Title level={3}><CalculatorOutlined /> Liquidación de Profesores</Title>
        
        <Card style={{ marginBottom: 20 }}>
            <Row gutter={16} align="middle">
                <Col span={12}>
                    <Text strong>Selecciona el Periodo:</Text><br/>
                    <RangePicker 
                        style={{ width: '100%', marginTop: 5 }} 
                        value={rangoFechas}
                        onChange={(dates) => setRangoFechas(dates)}
                        format="DD-MMM-YYYY"
                    />
                </Col>
                <Col span={12}>
                    <Statistic 
                        title="Total a Dispersar" 
                        value={totalAPagar} 
                        prefix={<DollarCircleOutlined />} 
                        precision={0}
                        valueStyle={{ color: '#3f8600' }}
                    />
                </Col>
            </Row>
        </Card>

        <Table 
            dataSource={profesores}
            rowKey="id"
            loading={loading}
            locale={{ emptyText: "No hay clases pendientes de pago en este rango de fechas" }}
            columns={columnasNomina}
        />

                <Card style={{ marginTop: 20 }} title="📋 Registro Diario Detallado de Clases Trabajadas">
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <Alert
                            message="Este es el registro DIARIO DETALLADO de cada clase dictada"
                            description="Cada fila representa una clase trabajada con fecha específica, profesor, curso, horas y tema. Este historial permanece incluso después de pagar."
                            type="info"
                            showIcon
                            style={{ marginBottom: 16 }}
                        />
                        <Table
                            dataSource={clasesPendientes}
                            rowKey="id"
                            loading={loading}
                            locale={{ emptyText: "No hay clases pendientes en este rango" }}
                            columns={columnasClases}
                            pagination={{ pageSize: 10 }}
                        />
                    </Space>
                </Card>

        <Modal
            title="Confirmar Pago de Nómina"
            open={modalVisible}
            onCancel={() => setModalVisible(false)}
            onOk={procesarPago}
            okText="Confirmar Pago"
        >
            {profesorSeleccionado && (
                <div>
                    <p>Vas a registrar el pago para: <b>{profesorSeleccionado.nombre_completo}</b></p>
                    <ul>
                        <li>Periodo: {formatDate(rangoFechas[0])} al {formatDate(rangoFechas[1])}</li>
                        <li>Horas: {profesorSeleccionado.total_horas}</li>
                        <li>Total: <b>$ {Number(profesorSeleccionado.total_pagado).toLocaleString()}</b></li>
                    </ul>
                    <div style={{marginTop: 16}}>
                        <Text strong>Método de Pago:</Text><br/>
                        <Select
                            value={metodoNomina}
                            onChange={(val) => setMetodoNomina(val)}
                            style={{width: '100%', marginTop: 8}}
                            options={[
                                { label: 'Efectivo', value: 'Efectivo' },
                                { label: 'Nequi', value: 'Nequi' },
                                { label: 'Bancolombia', value: 'Bancolombia' },
                                { label: 'Sistecredito', value: 'Sistecredito' }
                            ]}
                        />
                    </div>
                    <p style={{fontSize: 12, color: '#888', marginTop: 12}}>
                        Al confirmar, las clases se marcarán como pagadas.
                    </p>
                </div>
            )}
        </Modal>
    </div>
  );
}