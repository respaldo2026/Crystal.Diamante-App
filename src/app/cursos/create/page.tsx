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

    const seSolapanHoras = (inicioA: string | null, finA: string | null, inicioB: string | null, finB: string | null) => {
        const startA = inicioA ? dayjs(inicioA, "HH:mm:ss") : null;
        const endA = finA ? dayjs(finA, "HH:mm:ss") : startA ? startA.add(1, "hour") : null;
        const startB = inicioB ? dayjs(inicioB, "HH:mm:ss") : null;
        const endB = finB ? dayjs(finB, "HH:mm:ss") : startB ? startB.add(1, "hour") : null;

        if (!startA || !startB || !endA || !endB) return false; // sin horarios definidos no validamos choque
        return startA.isBefore(endB) && startB.isBefore(endA);
    };

    const hayInterseccionDias = (diasA?: string[] | string | null, diasB?: string[] | string | null) => {
        const a = Array.isArray(diasA)
            ? diasA
            : (diasA ? diasA.split(",").map((d) => d.trim()) : []);
        const b = Array.isArray(diasB)
            ? diasB
            : (diasB ? diasB.split(",").map((d) => d.trim()) : []);
        const setA = new Set(a.map((d) => d.toLowerCase()));
        return b.some((d) => setA.has(d.toLowerCase()));
    };

    const validarConflictos = async (datos: any) => {
        if (!datos.fecha_inicio || !datos.dias_semana || !datos.hora_inicio) return; // sin info, no validamos

        const fechaInicio = dayjs(datos.fecha_inicio);
        const fechaFin = datos.fecha_fin ? dayjs(datos.fecha_fin) : fechaInicio.add(6, "month");

        const { data, error } = await supabaseBrowserClient
            .from("cursos")
            .select("id, nombre, fecha_inicio, fecha_fin, dias_semana, hora_inicio, hora_fin, estado")
            .in("estado", ["activo", "proximo"]);

        if (error) return;

        const conflicto = (data || []).find((c: any) => {
            // Rango de fechas se solapa
            const cInicio = c.fecha_inicio ? dayjs(c.fecha_inicio) : null;
            const cFin = c.fecha_fin ? dayjs(c.fecha_fin) : cInicio ? cInicio.add(6, "month") : null;
            if (!cInicio || !cFin) return false;
            const solapaFecha = cInicio.isBefore(fechaFin) && fechaInicio.isBefore(cFin);
            if (!solapaFecha) return false;

            // Días comparten
            if (!hayInterseccionDias(datos.dias_semana, c.dias_semana)) return false;

            // Horarios se solapan
            return seSolapanHoras(datos.hora_inicio, datos.hora_fin, c.hora_inicio, c.hora_fin);
        });

        if (conflicto) {
            throw new Error(`Conflicto con el grupo "${conflicto.nombre}" en horario y día. Ajusta la franja horaria o los días.`);
        }
    };

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

        try {
            await validarConflictos(datosLimpios);
        } catch (err: any) {
            message.error(err?.message || "Conflicto de horario detectado");
            throw err;
        }
        
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