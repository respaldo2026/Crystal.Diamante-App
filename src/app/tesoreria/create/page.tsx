"use client";

import React, { useEffect, useState } from "react";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, Select, InputNumber, DatePicker, Row, Col, Divider, message, Card, Alert } from "antd";
import dayjs from "dayjs";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { UserOutlined, DollarCircleOutlined, SolutionOutlined } from "@ant-design/icons";
import { useSearchParams } from "next/navigation";

export default function PagoCreate() {
    const { formProps, saveButtonProps, onFinish } = useForm({ redirect: "list" });
    const searchParams = useSearchParams();
    
    // Estado para guardar los cursos del estudiante seleccionado
    const [cursosDelEstudiante, setCursosDelEstudiante] = useState<any[]>([]);
    const [buscandoCursos, setBuscandoCursos] = useState(false);

    // 1. Selector de Estudiantes (Buscamos en Perfiles donde rol = estudiante)
    const { selectProps: allEstudianteSelectProps } = useSelect({
        resource: "perfiles",
        optionLabel: "nombre_completo",
        optionValue: "id",
        filters: [{ field: "rol", operator: "eq", value: "estudiante" }],
        sorters: [{ field: "nombre_completo", order: "asc" }]
    });

    const estudianteSelectProps = {
        options: allEstudianteSelectProps.options,
        loading: allEstudianteSelectProps.loading
    };

    // 2. Cuando eliges un estudiante, buscamos sus matrículas activas
    const handleEstudianteChange = async (estudianteId: string) => {
        if (!estudianteId) return;
        setBuscandoCursos(true);
        setCursosDelEstudiante([]); // Limpiar anterior
        
        // Hacemos la consulta a Supabase
        const { data, error } = await supabaseBrowserClient
            .from("matriculas")
            .select("id, cursos(nombre, precio_mensualidad)") // Traemos info del curso (precio_mensualidad)
            .eq("estudiante_id", estudianteId); // Quitamos filtro de estado para ver todo por ahora
        
        if (error) {
            message.error("Error buscando cursos del estudiante");
        } else if (data) {
            setCursosDelEstudiante(data);
            
            // Si tiene solo un curso, lo pre-seleccionamos para agilizar
            if (data.length === 1) {
                formProps.form?.setFieldValue("matricula_id", data[0].id);
                // Sugerimos el precio mensualidad como monto a pagar
                const cursoInfo = Array.isArray(data[0].cursos) ? data[0].cursos[0] : data[0].cursos;
                const precioSugerido = (cursoInfo as any)?.precio_mensualidad || 0;
                formProps.form?.setFieldValue("monto", precioSugerido);
            }
        }
        setBuscandoCursos(false);
    };

    // Al seleccionar el curso, autocompletar el monto sugerido
    const handleCursoChange = (matriculaId: string) => {
        const matricula = cursosDelEstudiante.find(m => m.id === matriculaId);
        if (matricula) {
            const cursoInfo = Array.isArray(matricula.cursos) ? matricula.cursos[0] : matricula.cursos;
            if ((cursoInfo as any)?.precio_mensualidad) {
                formProps.form?.setFieldValue("monto", (cursoInfo as any).precio_mensualidad);
            }
        }
    };

    const handleOnFinish = (values: any) => {
        // Preparamos datos finales
        const datos = {
            ...values,
            fecha_pago: values.fecha_pago ? values.fecha_pago.format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD"),
        };
        onFinish(datos);
    };

    // Prefill desde query params: estudiante_id y matricula_id
    useEffect(() => {
        const estudianteId = searchParams.get('estudiante_id');
        const matriculaId = searchParams.get('matricula_id');
        if (estudianteId) {
            formProps.form?.setFieldValue('estudiante_id', estudianteId);
            // Dispara búsqueda de matrículas y luego preselecciona
            handleEstudianteChange(estudianteId);
        }
        if (matriculaId) {
            // Intentamos setear después de que carguen los cursos
            const timeout = setTimeout(() => {
                formProps.form?.setFieldValue('matricula_id', matriculaId);
                const m = cursosDelEstudiante.find(m => String(m.id) === String(matriculaId));
                if (m?.cursos?.precio_mensualidad) {
                    formProps.form?.setFieldValue('monto', m.cursos.precio_mensualidad);
                }
            }, 400);
            return () => clearTimeout(timeout);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

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
                initialValues={{ metodo_pago: 'Efectivo', fecha_pago: dayjs() }}
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
                        <Form.Item 
                            label="Curso a Pagar (Matrícula)" 
                            name="matricula_id" 
                            rules={[{ required: true, message: "Selecciona el curso" }]}
                            help={cursosDelEstudiante.length === 0 && !buscandoCursos ? "Selecciona un estudiante primero" : ""}
                        >
                            <Select 
                                placeholder="Selecciona el curso"
                                loading={buscandoCursos}
                                onChange={handleCursoChange}
                                disabled={cursosDelEstudiante.length === 0}
                            >
                                {cursosDelEstudiante.map((m: any) => (
                                    <Select.Option key={m.id} value={m.id}>
                                        {m.cursos?.nombre || "Curso sin nombre"}
                                    </Select.Option>
                                ))}
                            </Select>
                        </Form.Item>
                    </Col>
                </Row>

                {cursosDelEstudiante.length === 0 && !buscandoCursos && (
                     <Alert style={{marginBottom: 20}} type="info" message="Nota: Selecciona un estudiante para ver sus cursos inscritos." />
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
                            <Select options={[
                                { label: 'Efectivo', value: 'Efectivo' },
                                { label: 'Nequi', value: 'Nequi' },
                                { label: 'Bancolombia', value: 'Bancolombia' },
                                { label: 'Sistecredito', value: 'Sistecredito' }
                            ]} />
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