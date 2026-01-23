"use client";

import React, { useEffect, useState } from "react";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, Select, InputNumber, DatePicker, Row, Col, Divider, message, Card, Alert } from "antd";
import dayjs from "dayjs";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { formatDate, formatTime } from "@utils/date";
import { UserOutlined, DollarCircleOutlined, SolutionOutlined } from "@ant-design/icons";
import { useSearchParams } from "next/navigation";

export default function PagoCreate() {
        // Handler para el submit del formulario
        const handleOnFinish = async (values: any) => {
            const { cuota_id, monto } = values;
            if (!cuota_id) {
                message.error("Debes seleccionar una cuota a pagar");
                return;
            }
            const montoNumero = Number(monto || 0);
            if (Number.isNaN(montoNumero) || montoNumero <= 0) {
                message.error("El monto debe ser mayor a 0");
                return;
            }
            if (montoNumero > 999999999) {
                message.error("El monto es demasiado alto");
                return;
            }
            // Aquí puedes agregar la lógica para guardar el pago en la base de datos
            message.success("Pago registrado correctamente (simulado)");
        };
    const { formProps, saveButtonProps, onFinish } = useForm({ redirect: "list" });
    const searchParams = useSearchParams();
    
    // Estado para guardar los cursos del estudiante seleccionado
    const [cursosDelEstudiante, setCursosDelEstudiante] = useState<any[]>([]);
    const [buscandoCursos, setBuscandoCursos] = useState(false);
    const [cuotasPendientes, setCuotasPendientes] = useState<any[]>([]);
    const [cargandoCuotas, setCargandoCuotas] = useState(false);

    // 1. Selector de Estudiantes (Buscamos en Perfiles donde rol = estudiante Y activo = true)
    const { selectProps: allEstudianteSelectProps } = useSelect({
        resource: "perfiles",
        optionLabel: "nombre_completo",
        optionValue: "id",
        filters: [
            { field: "rol", operator: "eq", value: "estudiante" },
            { field: "activo", operator: "eq", value: true }
        ],
        sorters: [{ field: "nombre_completo", order: "asc" }]
    });

    const estudianteSelectProps = {
        options: allEstudianteSelectProps.options,
        loading: allEstudianteSelectProps.loading
    };

    // 2. Cuando eliges un estudiante, buscamos sus matrículas activas y cuotas pendientes
    const handleEstudianteChange = async (estudianteId: string) => {
        if (!estudianteId) return;
        setBuscandoCursos(true);
        setCursosDelEstudiante([]); // Limpiar anterior
        setCuotasPendientes([]);
        
        // Hacemos la consulta a Supabase para traer las matrículas
        const { data, error } = await supabaseBrowserClient
            .from("matriculas")
            .select("id, cursos(nombre, precio_mensualidad)") 
            .eq("estudiante_id", estudianteId);
        
        if (error) {
            message.error("Error buscando cursos del estudiante");
        } else if (data) {
            setCursosDelEstudiante(data);
            
            // Si tiene solo un curso, lo pre-seleccionamos
            if (data.length === 1) {
                formProps.form?.setFieldValue("matricula_id", data[0].id);
                await cargarCuotasPendientes(data[0].id);
            }
        }
        setBuscandoCursos(false);
    };

    // 3. Cuando se selecciona una matrícula, cargar sus cuotas pendientes
    const cargarCuotasPendientes = async (matriculaId: string) => {
        if (!matriculaId) return;
        setCargandoCuotas(true);
        
        const { data, error } = await supabaseBrowserClient
            .from("pagos")
            .select("*")
            .eq("matricula_id", matriculaId)
            .in("estado", ["pendiente", "vencido"]) // Solo cuotas no pagadas
            .order("numero_cuota", { ascending: true });
        
        if (error) {
            message.error("Error cargando cuotas pendientes");
            setCuotasPendientes([]);
        } else {
            setCuotasPendientes(data || []);
            // Pre-seleccionar la primera cuota pendiente
            if (data && data.length > 0) {
                formProps.form?.setFieldValue("cuota_id", data[0].id);
                formProps.form?.setFieldValue("monto", data[0].monto);
            }
        }
        setCargandoCuotas(false);
    };

    // Al seleccionar el curso, cargar sus cuotas pendientes
    const handleCursoChange = (matriculaId: string) => {
        cargarCuotasPendientes(matriculaId);
    };

    // Al seleccionar una cuota específica, autocompletar el monto
    const handleCuotaChange = (cuotaId: string) => {
        const cuota = cuotasPendientes.find(c => c.id === cuotaId);
        if (cuota) {
            formProps.form?.setFieldValue("monto", cuota.monto);
        }
    };

    // Definir parser fuera del JSX para evitar error de sintaxis
    const montoParser = (value: string | undefined): number => {
        const parsed = value?.replace(/\$\s?|(,*)/g, '');
        return parsed ? parseInt(parsed, 10) : 0;
    };

    return (
        <Create 
            saveButtonProps={{ ...saveButtonProps, onClick: () => formProps.form?.submit() }} 
            title="Registrar Nuevo Ingreso"
        >
            <Form 
                {...formProps} 
                form={formProps.form}
                layout="vertical" 
                onFinish={handleOnFinish} 
                initialValues={{ metodo_pago: 'efectivo', fecha_pago: dayjs() }}
            >
                <Row gutter={24}>
                    <Col span={12}>
                        <Form.Item label="Estudiante" name="estudiante_id" rules={[{ required: true, message: "Selecciona un estudiante" }]}> 
                            <Select 
                                {...estudianteSelectProps} 
                                placeholder="Escribe para buscar..." 
                                showSearch
                                optionFilterProp="label"
                                onChange={handleEstudianteChange}
                                suffixIcon={<UserOutlined />}
                            />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item label="Curso" name="matricula_id" rules={[{ required: true, message: "Selecciona un curso" }]}> 
                            <Select 
                                options={cursosDelEstudiante.map(m => ({ label: m.cursos?.nombre, value: m.id }))}
                                loading={buscandoCursos}
                                placeholder="Selecciona un curso"
                                onChange={handleCursoChange}
                                allowClear
                                suffixIcon={<SolutionOutlined />}
                            />
                        </Form.Item>
                    </Col>
                </Row>
                <Row gutter={24}>
                    <Col span={12}>
                        <Form.Item label="Cuota" name="cuota_id" rules={[{ required: true, message: "Selecciona una cuota" }]}> 
                            <Select 
                                options={cuotasPendientes.map(c => ({ label: `Cuota #${c.numero_cuota} - $${c.monto}`, value: c.id }))}
                                loading={cargandoCuotas}
                                placeholder="Selecciona una cuota"
                                onChange={handleCuotaChange}
                                allowClear
                                suffixIcon={<DollarCircleOutlined />}
                            />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item label="Monto a pagar" name="monto" rules={[{ required: true, message: "Ingresa el monto" }]}> 
                            <InputNumber 
                                min={0}
                                max={999999999}
                                style={{ width: "100%" }}
                                parser={montoParser}
                                prefix={<DollarCircleOutlined />}
                                placeholder="Monto"
                            />
                        </Form.Item>
                    </Col>
                </Row>
                <Row gutter={24}>
                    <Col span={12}>
                        <Form.Item label="Método de pago" name="metodo_pago" rules={[{ required: true, message: "Selecciona el método de pago" }]}> 
                            <Select
                                options={[
                                    { label: "Efectivo", value: "efectivo" },
                                    { label: "Transferencia", value: "transferencia" },
                                    { label: "Tarjeta", value: "tarjeta" },
                                    { label: "Otro", value: "otro" },
                                ]}
                                placeholder="Selecciona el método de pago"
                            />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item label="Fecha de pago" name="fecha_pago" rules={[{ required: true, message: "Selecciona la fecha de pago" }]}> 
                            <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
                        </Form.Item>
                    </Col>
                </Row>
                <Row gutter={24}>
                    <Col span={12}>
                        <Form.Item label="Referencia" name="referencia"> 
                            <Input placeholder="Referencia o número de comprobante" />
                        </Form.Item>
                    </Col>
                </Row>

                {cursosDelEstudiante.length === 0 && !buscandoCursos && (
                    <Alert style={{marginBottom: 20}} type="info" message="Nota: Selecciona un estudiante para ver sus cursos inscritos." />
                )}

                {cuotasPendientes.length === 0 && !cargandoCuotas && cursosDelEstudiante.length > 0 && (
                    <Alert style={{marginBottom: 20}} type="warning" message="Este estudiante no tiene cuotas pendientes de pago." />
                )}

                {cuotasPendientes.length > 0 && (
                    <Card style={{ marginBottom: 20, background: '#f0f5ff' }}>
                        <Form.Item 
                            label="Cuota a Pagar" 
                            name="cuota_id" 
                            rules={[{ required: true, message: "Selecciona la cuota a pagar" }]}
                        >
                            <Select 
                                placeholder="Selecciona la cuota a pagar"
                                loading={cargandoCuotas}
                                onChange={handleCuotaChange}
                            >
                                {cuotasPendientes.map((cuota: any) => {
                                    const esVencida = cuota.estado === 'vencido';
                                    const labelEstado = esVencida ? ' 🔴 VENCIDA' : '';
                                    const vencimiento = cuota.fecha_vencimiento ? ` - Vence: ${formatDate(cuota.fecha_vencimiento)}` : '';
                                    return (
                                        <Select.Option key={cuota.id} value={cuota.id}>
                                            {`${cuota.periodo_pagado} - $${cuota.monto?.toLocaleString() || 0}${vencimiento}${labelEstado}`}
                                        </Select.Option>
                                    );
                                })}
                            </Select>
                        </Form.Item>
                    </Card>
                )}

                <Divider orientation="left">Detalles del Pago</Divider>

                <Row gutter={24}>
                    <Col span={8}>
                        <Form.Item label="Monto Recibido" name="monto" rules={[{ required: true, message: "Ingresa el valor" }]}> 
                            <InputNumber 
                                style={{ width: '100%', fontSize: '16px', fontWeight: 'bold' }} 
                                prefix="$"
                                min={0}
                                formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                parser={((value: string | undefined): number => {
                                    const parsed = value?.replace(/\$\s?|(,*)/g, '');
                                    return parsed ? parseInt(parsed, 10) : 0;
                                }) as any}
                            />
                        </Form.Item>
                    </Col>
                    <Col span={8}>
                        <Form.Item label="Método de Pago" name="metodo_pago">
                            <Select 
                                options={[
                                    { label: 'Efectivo', value: 'efectivo' },
                                    { label: 'Transferencia (Nequi/Banco)', value: 'transferencia' },
                                    { label: 'Tarjeta', value: 'tarjeta' },
                                    { label: 'Otro', value: 'otro' }
                                ]}
                            />
                        </Form.Item>
                    </Col>
                    <Col span={8}>
                        <Form.Item label="Fecha" name="fecha_pago">
                            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" allowClear={false} />
                        </Form.Item>
                    </Col>
                </Row>

                <Row>
                    <Col span={24}>
                        <Form.Item label="Referencia / Observación" name="referencia">
                            <Input placeholder="Ej: Pago mes Noviembre - Comprobante #1234" prefix={<SolutionOutlined />} />
                        </Form.Item>
                    </Col>
                </Row>
            </Form>
        </Create>
    );
}