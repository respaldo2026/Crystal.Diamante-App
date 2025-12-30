"use client";

import React, { useState, useEffect } from "react";
import { Create, useForm } from "@refinedev/antd";
import { Form, Input, Select, InputNumber, Row, Col, DatePicker, message, TimePicker } from "antd";
import { UserOutlined, BookOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { supabaseBrowserClient } from "@utils/supabase/client";

export default function CursoCreate() {
    const { formProps, saveButtonProps } = useForm({
        redirect: "list",
    });
    
    const [profesores, setProfesores] = useState<any[]>([]);
    const [programas, setProgramas] = useState<any[]>([]);
    
    useEffect(() => {
        const cargarDatos = async () => {
            const [profesoresRes, programasRes] = await Promise.all([
                supabaseBrowserClient
                    .from("perfiles")
                    .select("id, nombre_completo")
                    .eq("rol", "profesor")
                    .order("nombre_completo"),
                supabaseBrowserClient
                    .from("programas")
                    .select("id, nombre")
                    .eq("activo", true)
                    .order("nombre")
            ]);
            
            if (profesoresRes.data) setProfesores(profesoresRes.data);
            if (programasRes.data) setProgramas(programasRes.data);
        };
        cargarDatos();
    }, []);

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
                                placeholder="Selecciona el programa al que pertenece este grupo"
                                showSearch
                                filterOption={(input, option) =>
                                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                }
                                options={programas.map(p => ({ 
                                    label: p.nombre, 
                                    value: p.id 
                                }))}
                                onChange={(value) => {
                                    const programa = programas.find(p => p.id === value);
                                    if (programa) {
                                        formProps.form?.setFieldValue("nombre", programa.nombre);
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
                        placeholder="Buscar profesor..."
                        showSearch
                        filterOption={(input, option) =>
                            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                        options={profesores.map(p => ({ 
                            label: p.nombre_completo, 
                            value: p.id 
                        }))}
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