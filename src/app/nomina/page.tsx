"use client";

import React, { useState, useEffect } from "react";
import { 
  Table, Card, Button, DatePicker, Row, Col, Typography, 
  Statistic, Tag, message, Modal, Input, Divider 
} from "antd";
import { 
  CalculatorOutlined, DollarCircleOutlined, CalendarOutlined, PayCircleOutlined 
} from "@ant-design/icons";
import { createClient } from "@supabase/supabase-js";
import dayjs from "dayjs";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function NominaPage() {
  const [loading, setLoading] = useState(false);
  const [profesores, setProfesores] = useState<any[]>([]);
  const [rangoFechas, setRangoFechas] = useState<any>([dayjs().startOf('month'), dayjs()]);
  
  // Totales
  const [totalAPagar, setTotalAPagar] = useState(0);

  // Modal Pagar
  const [modalVisible, setModalVisible] = useState(false);
  const [profesorSeleccionado, setProfesorSeleccionado] = useState<any>(null);

  useEffect(() => {
    calcularNomina();
  }, [rangoFechas]); // Recalcular si cambian las fechas

  const calcularNomina = async () => {
    if (!rangoFechas) return;
    setLoading(true);

    const inicio = rangoFechas[0].format("YYYY-MM-DD");
    const fin = rangoFechas[1].format("YYYY-MM-DD");

    try {
        // 1. Obtener todos los profesores con su valor hora
        // (Asegúrate de haber agregado la columna valor_hora en la tabla perfiles)
        const { data: dataProfes } = await supabase
            .from("perfiles")
            .select("id, nombre_completo, valor_hora");
            // .eq("rol", "profesor") // Descomenta si usas roles

        // 2. Obtener sesiones dictadas en el rango y PENDIENTES de pago
        const { data: sesiones } = await supabase
            .from("sesiones_clase")
            .select("profesor_id, horas_dictadas, fecha, cursos(nombre)")
            .gte("fecha", inicio)
            .lte("fecha", fin)
            .eq("estado_pago", "pendiente");

        // 3. Cruzar datos
        const reporte = dataProfes?.map(prof => {
            const susClases = sesiones?.filter(s => s.profesor_id === prof.id) || [];
            const totalHoras = susClases.reduce((sum, item) => sum + Number(item.horas_dictadas), 0);
            const aPagar = totalHoras * (prof.valor_hora || 0);

            return {
                ...prof,
                total_horas: totalHoras,
                total_pagado: aPagar,
                detalles: susClases
            };
        }).filter(p => p.total_horas > 0); // Solo mostrar los que trabajaron

        setProfesores(reporte || []);
        
        const totalGeneral = reporte?.reduce((acc, curr) => acc + curr.total_pagado, 0) || 0;
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
        // 1. Guardar registro en historial de pagos
        const { error: errPago } = await supabase.from("pagos_nomina").insert({
            profesor_id: profesorSeleccionado.id,
            fecha_pago: dayjs().format("YYYY-MM-DD"),
            fecha_inicio_periodo: rangoFechas[0].format("YYYY-MM-DD"),
            fecha_fin_periodo: rangoFechas[1].format("YYYY-MM-DD"),
            total_horas: profesorSeleccionado.total_horas,
            total_pagado: profesorSeleccionado.total_pagado,
            observaciones: "Pago de quincena"
        });
        if (errPago) throw errPago;

        // 2. Actualizar las sesiones a "pagado" para que no salgan la próxima vez
        // Buscamos las sesiones de este profesor en este rango
        const inicio = rangoFechas[0].format("YYYY-MM-DD");
        const fin = rangoFechas[1].format("YYYY-MM-DD");

        const { error: errUpdate } = await supabase
            .from("sesiones_clase")
            .update({ estado_pago: 'pagado' })
            .eq("profesor_id", profesorSeleccionado.id)
            .gte("fecha", inicio)
            .lte("fecha", fin)
            .eq("estado_pago", "pendiente");

        if (errUpdate) throw errUpdate;

        message.success(`Pago registrado a ${profesorSeleccionado.nombre_completo}`);
        setModalVisible(false);
        calcularNomina(); // Refrescar tabla

      } catch (error: any) {
          message.error("Error: " + error.message);
      }
  };

  return (
    <div style={{ padding: 24 }}>
        <Title level={3}><CalculatorOutlined /> Liquidación de Profesores</Title>
        
        <Card style={{ marginBottom: 20 }}>
            <Row gutter={16} align="middle">
                <Col span={12}>
                    <Text strong>Selecciona el Periodo (Quincena):</Text><br/>
                    <RangePicker 
                        style={{ width: '100%', marginTop: 5 }} 
                        value={rangoFechas}
                        onChange={(dates) => setRangoFechas(dates)}
                        format="DD/MM/YYYY"
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
            columns={[
                { title: 'Profesor', dataIndex: 'nombre_completo' },
                { 
                    title: 'Valor Hora', 
                    dataIndex: 'valor_hora',
                    render: (val) => `$ ${Number(val).toLocaleString()}` 
                },
                { 
                    title: 'Horas Trabajadas', 
                    dataIndex: 'total_horas',
                    render: (val) => <Tag color="blue">{val} hrs</Tag>
                },
                { 
                    title: 'A Pagar', 
                    dataIndex: 'total_pagado',
                    render: (val) => <Text strong type="success">$ {Number(val).toLocaleString()}</Text>
                },
                {
                    title: 'Acción',
                    render: (_, record) => (
                        <Button type="primary" icon={<PayCircleOutlined />} onClick={() => {
                            setProfesorSeleccionado(record);
                            setModalVisible(true);
                        }}>
                            Pagar
                        </Button>
                    )
                }
            ]}
        />

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
                        <li>Periodo: {rangoFechas[0].format("DD/MM")} al {rangoFechas[1].format("DD/MM")}</li>
                        <li>Horas: {profesorSeleccionado.total_horas}</li>
                        <li>Total: <b>$ {Number(profesorSeleccionado.total_pagado).toLocaleString()}</b></li>
                    </ul>
                    <p style={{fontSize: 12, color: '#888'}}>
                        Al confirmar, las clases de este periodo se marcarán como "pagadas" y no volverán a aparecer en la liquidación.
                    </p>
                </div>
            )}
        </Modal>
    </div>
  );
}