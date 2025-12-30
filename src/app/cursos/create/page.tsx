"use client";

import React, { useState } from "react";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, Select, InputNumber, Row, Col, DatePicker, message, TimePicker } from "antd";
import { UserOutlined, BookOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

export default function CursoCreate() {
    const { formProps, saveButtonProps } = useForm({
        redirect: "list",
    });
    const [valorClase, setValorClase] = useState<number | null>(null);

    const calcularValorClase = (mensualidad?: number, total?: number) => {
        if (!mensualidad || !total || total === 0) {
            setValorClase(null);
            return;
        }
        setValorClase(Math.round(mensualidad / total));
    };

    const { selectProps: professorSelectProps } = useSelect({
        resource: "perfiles",
        optionLabel: "nombre_completo",
        optionValue: "id",
        filters: [
            { field: "rol", operator: "eq", value: "profesor" }
        ]
    });

    const { selectProps: programaSelectProps } = useSelect({
        resource: "programas",
        optionLabel: "nombre",
        optionValue: "id",
    });

    const handleOnFinish = async (values: any) => {
        // Convertir valores correctamente
        const datosLimpios = {
            ...values,
            fecha_inicio: values.fecha_inicio ? dayjs(values.fecha_inicio).format('YYYY-MM-DD') : null,
            dias_semana: Array.isArray(values.dias_semana) 
                ? values.dias_semana.join(', ')
                : (values.dias_semana || null),
            hora_inicio: values.hora_inicio 
                ? (dayjs.isDayjs(values.hora_inicio) 
                    ? values.hora_inicio.format('HH:mm:ss')
                    : values.hora_inicio)
                : null,
            hora_fin: values.hora_fin 
                ? (dayjs.isDayjs(values.hora_fin)
                    ? values.hora_fin.format('HH:mm:ss')
                    : values.hora_fin)
                : null,
            total_clases: values.total_clases ?? null,
        };
        
        // Llamar a la función onFinish de formProps (la que guarda en Refine/Supabase)
        return formProps.onFinish?.(datosLimpios);
    };

    return (
        <Create 
            saveButtonProps={saveButtonProps}
            title="Crear Nuevo Grupo/Cohorte"
        >
            <Form 
                {...formProps}
                layout="vertical" 
                onValuesChange={(changed, all) => {
                    calcularValorClase(all.precio_mensualidad, all.total_clases);
                }}
                onFinish={handleOnFinish}
            >
                
                <Row gutter={24}>
                    <Col span={12}>
                        <Form.Item
                            label="Programa Académico"
                            name="programa_id"
                            rules={[{ required: true, message: "Selecciona el programa" }]}
                        >
                            <Select 
                                {...programaSelectProps} 
                                placeholder="Selecciona el programa al que pertenece este grupo"
                                prefix={<BookOutlined />}
                                onChange={(value, option: any) => {
                                    const nombrePrograma = option?.label ?? "";
                                    // Prefija el nombre del grupo con el nombre del programa
                                    if (nombrePrograma) {
                                        formProps.form?.setFieldValue("nombre", nombrePrograma);
                                    }
                                }}
                            />
                        </Form.Item>
                    </Col>
                    
                    <Col span={12}>
                        <Form.Item
                            label="Nombre del Grupo/Cohorte"
                            name="nombre" 
                            rules={[{ required: true, message: "El nombre es obligatorio" }]}
                        >
                            <Input placeholder="Ej: Grupo A, Cohorte Mañana, Fin de Semana" />
                        </Form.Item>
                    </Col>
                </Row>

                <Row gutter={24}>
                    <Col span={8}>
                        <Form.Item
                            label="Precio Inscripción"
                            name="precio_inscripcion"
                        >
                            <InputNumber
                                style={{ width: "100%" }}
                                formatter={(value) => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                parser={(value) => value?.replace(/\$\s?|(,*)/g, '') as unknown as number}
                            />
                        </Form.Item>
                    </Col>
                    <Col span={8}>
                        <Form.Item
                            label="Mensualidad"
                            name="precio_mensualidad"
                            rules={[{ required: true, message: "Ingresa la mensualidad" }]}
                        >
                            <InputNumber
                                style={{ width: "100%" }}
                                formatter={(value) => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                parser={(value) => value?.replace(/\$\s?|(,*)/g, '') as unknown as number}
                            />
                        </Form.Item>
                    </Col>
                    <Col span={8}>
                        <Form.Item
                            label="Total de Clases"
                            name="total_clases"
                            rules={[{ required: true, message: "Ingresa el número de clases" }]}
                        >
                            <InputNumber min={1} style={{ width: "100%" }} />
                        </Form.Item>
                    </Col>
                </Row>

                <Row gutter={24}>
                    <Col span={8} offset={16}>
                        <div style={{
                            padding: '12px',
                            backgroundColor: '#f0f5ff',
                            border: '1px solid #b6c8db',
                            borderRadius: '4px',
                            textAlign: 'center'
                        }}>
                            <span style={{ fontSize: 12, color: '#666' }}>Valor por Clase</span>
                            <div style={{
                                fontSize: 18,
                                fontWeight: 'bold',
                                color: '#1890ff',
                                marginTop: 4
                            }}>
                                {valorClase !== null ? `$ ${valorClase.toLocaleString('es-CO')}` : '—'}
                            </div>
                        </div>
                    </Col>
                </Row>

                <Row gutter={24}>
                    <Col span={16}>
                        <Form.Item
                            label="Descripción/Notas del Grupo"
                            name="descripcion" 
                        >
                            <Input.TextArea rows={2} placeholder="Información adicional del grupo" />
                        </Form.Item>
                    </Col>
                    
                    <Col span={8}>
                        <Form.Item
                            label="Estado"
                            name="estado"
                            initialValue="activo"
                        >
                            <Select
                                options={[
                                    { label: "Activo", value: "activo" },
                                    { label: "Cerrado", value: "cerrado" },
                                    { label: "Finalizado", value: "finalizado" },
                                ]}
                            />
                        </Form.Item>
                    </Col>
                </Row>

                <Form.Item
                    label="Profesor Asignado"
                    name="profesor_id"
                    rules={[{ required: true, message: "Asigna un profesor" }]}
                >
                    <Select 
                        {...professorSelectProps}
                        placeholder="Buscar profesor..."
                        suffixIcon={<UserOutlined />}
                        showSearch
                        optionFilterProp="label"
                    />
                </Form.Item>

                <Row gutter={24}>
                    <Col span={8}>
                        <Form.Item
                            label="Cupos Disponibles"
                            name="cupos"
                            initialValue={20}
                            rules={[{ required: true }]}
                        >
                            <InputNumber min={1} style={{ width: "100%" }} />
                        </Form.Item>
                    </Col>

                    <Col span={8}>
                         <Form.Item 
                            label="Fecha Inicio" 
                            name="fecha_inicio"
                            rules={[{ required: true, message: "Selecciona la fecha de inicio" }]}
                         >
                            <DatePicker style={{width: '100%'}} format="YYYY-MM-DD" />
                         </Form.Item>
                    </Col>
                    <Col span={8}>
                         <Form.Item label="Fecha Fin" name="fecha_fin">
                            <DatePicker style={{width: '100%'}} format="YYYY-MM-DD" />
                         </Form.Item>
                    </Col>
                </Row>

                <Row gutter={24}>
                    <Col span={12}>
                        <Form.Item
                            label="Días de la Semana"
                            name="dias_semana"
                            help="Selecciona los días en que se dicta la clase"
                        >
                            <Select 
                                mode="multiple"
                                placeholder="Selecciona días..."
                                options={[
                                    { label: 'Lunes', value: 'Lunes' },
                                    { label: 'Martes', value: 'Martes' },
                                    { label: 'Miércoles', value: 'Miércoles' },
                                    { label: 'Jueves', value: 'Jueves' },
                                    { label: 'Viernes', value: 'Viernes' },
                                    { label: 'Sábado', value: 'Sábado' },
                                    { label: 'Domingo', value: 'Domingo' },
                                ]}
                            />
                        </Form.Item>
                    </Col>
                    <Col span={6}>
                        <Form.Item
                            label="Hora Inicio"
                            name="hora_inicio"
                            getValueFromEvent={(value) => {
                                return value ? value.format("HH:mm:ss") : null;
                            }}
                        >
                            <TimePicker style={{ width: '100%' }} format="HH:mm" />
                        </Form.Item>
                    </Col>
                    <Col span={6}>
                        <Form.Item
                            label="Hora Fin"
                            name="hora_fin"
                            getValueFromEvent={(value) => {
                                return value ? value.format("HH:mm:ss") : null;
                            }}
                        >
                            <TimePicker style={{ width: '100%' }} format="HH:mm" />
                        </Form.Item>
                    </Col>
                </Row>

            </Form>
        </Create>
    );
}