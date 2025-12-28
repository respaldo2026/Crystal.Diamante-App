"use client";

import React, { useState } from "react";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { Form, Select, DatePicker, Input, Card, Statistic, message, Alert, Button, Space, Divider, Modal } from "antd";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { UserOutlined, BookOutlined, SearchOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { enviarWhatsapp } from "@utils/whatsapp";

export default function MatriculaCreate() {
    const { formProps, saveButtonProps, onFinish } = useForm({
        redirect: "list"
    });
    const router = useRouter();

    const [cuposInfo, setCuposInfo] = useState<{ ocupados: number, total: number } | null>(null);
    const [checking, setChecking] = useState(false);
    const [searchingStudent, setSearchingStudent] = useState(false);
    const [studentFound, setStudentFound] = useState<any>(null);
    const [showCreateStudent, setShowCreateStudent] = useState(false);
    const [identificacionBuscar, setIdentificacionBuscar] = useState("");
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [createForm] = Form.useForm();

    // 1. Selector de Cursos
    const { selectProps: cursoSelectProps } = useSelect({
        resource: "cursos",
        optionLabel: "nombre",
        optionValue: "id",
        filters: [
             { field: "estado", operator: "eq", value: "activo" }
        ]
    });

    // 2. Buscar estudiante por identificación
    const handleBuscarEstudiante = async () => {
        if (!identificacionBuscar.trim()) {
            message.warning("Ingresa un número de identificación");
            return;
        }
        setSearchingStudent(true);
        setStudentFound(null);
        setShowCreateStudent(false);
        try {
            const { data, error } = await supabaseBrowserClient
                .from('perfiles')
                .select('*')
                .eq('identificacion', identificacionBuscar.trim())
                .eq('rol', 'estudiante')
                .maybeSingle();
            
            if (error) throw error;
            
            if (data) {
                setStudentFound(data);
                formProps.form?.setFieldValue('estudiante_id', data.id);
                message.success(`Estudiante encontrado: ${data.nombre_completo}`);
            } else {
                message.info("No se encontró estudiante con esa identificación");
                createForm.setFieldsValue({ identificacion: identificacionBuscar });
                setCreateModalOpen(true);
            }
        } catch (e: any) {
            message.error(e?.message || "Error buscando estudiante");
        } finally {
            setSearchingStudent(false);
        }
    };

    // 3. Crear estudiante inline
    const handleCrearEstudiante = async (values: any) => {
        try {
            // Validar duplicados
            const { count } = await supabaseBrowserClient
                .from('perfiles')
                .select('*', { count: 'exact', head: true })
                .eq('identificacion', values.identificacion);
            
            if ((count || 0) > 0) {
                message.error("Ya existe un estudiante con esa identificación");
                return;
            }

            const { data, error } = await supabaseBrowserClient
                .from('perfiles')
                .insert({
                    identificacion: values.identificacion,
                    nombre_completo: values.nombre_completo,
                    email: values.email,
                    telefono: values.telefono,
                    rol: 'estudiante',
                    activo: true,
                    notif_whatsapp: true,
                })
                .select()
                .single();

            if (error) throw error;
            
            setStudentFound(data);
            formProps.form?.setFieldValue('estudiante_id', data.id);
            setShowCreateStudent(false);
            setCreateModalOpen(false);
            createForm.resetFields();
            message.success("Estudiante creado correctamente");
        } catch (e: any) {
            message.error(e?.message || "Error creando estudiante");
        }
    };

    // 4. Función para verificar cupos en tiempo real al seleccionar curso
    const handleCursoChange = async (cursoId: string) => {
        if (!cursoId) return;
        setChecking(true);
        setCuposInfo(null);

        const supabase = supabaseBrowserClient;

        try {
            // A. Obtener límite del curso
            const { data: curso, error: errCurso } = await supabase
                .from('cursos')
                .select('cupos, nombre')
                .eq('id', cursoId)
                .single();
            
            if (errCurso) throw errCurso;

            // B. Contar inscritos actuales
            const { count, error: errCount } = await supabase
                .from('matriculas')
                .select('*', { count: 'exact', head: true })
                .eq('curso_id', cursoId);

            if (errCount) throw errCount;

            setCuposInfo({
                ocupados: count || 0,
                total: curso.cupos || 20 // 20 por defecto si es nulo
            });

        } catch (error) {
            console.error("Error verificando cupos:", error);
        } finally {
            setChecking(false);
        }
    };

    // 5. Interceptamos el guardado para evitar matrícula si está lleno
    const handleOnFinish = async (values: any) => {
        const { estudiante_id, curso_id } = values || {};

        if (cuposInfo && cuposInfo.ocupados >= cuposInfo.total) {
            message.error("⛔ ¡El curso está lleno! No se puede matricular.");
            return;
        }

        // Prevenir duplicados: misma persona inscrita al mismo curso
        if (estudiante_id && curso_id) {
            const { count } = await supabaseBrowserClient
                .from('matriculas')
                .select('*', { count: 'exact', head: true })
                .eq('estudiante_id', estudiante_id)
                .eq('curso_id', curso_id);

            if ((count || 0) > 0) {
                message.error("⚠️ Ya existe una matrícula para este estudiante en este curso.");
                return;
            }
        }

        // Si hay espacio y no hay duplicados, procedemos con el guardado normal de Refine
        await onFinish(values);

        // Notificación automática por WhatsApp si el perfil lo permite
        try {
            const supabase = supabaseBrowserClient;
            const { data: perfil } = await supabase
                .from('perfiles')
                .select('nombre_completo, telefono, notif_whatsapp')
                .eq('id', estudiante_id)
                .single();

            const { data: curso } = await supabase
                .from('cursos')
                .select('nombre')
                .eq('id', curso_id)
                .single();

            if (perfil?.telefono && (perfil?.notif_whatsapp ?? true)) {
                enviarWhatsapp(
                    perfil.telefono,
                    `Hola ${perfil.nombre_completo}, tu matrícula al curso \"${curso?.nombre ?? 'Curso'}\" fue registrada. ¡Bienvenido!`
                );
            }
        } catch (e) {
            // Silencioso: no bloquear flujo por fallo de notificación
            console.warn('No se pudo enviar WhatsApp:', e);
        }
    };

    // Calcular estado visual
    const isFull = cuposInfo ? cuposInfo.ocupados >= cuposInfo.total : false;
    const disponibilidad = cuposInfo ? (cuposInfo.total - cuposInfo.ocupados) : 0;

    return (
        <Create saveButtonProps={{...saveButtonProps, onClick: () => formProps.form?.submit()}} title="Nueva Matrícula">
            
            {/* ALERTAS VISUALES DE CUPO */}
            {cuposInfo && (
                <div style={{ marginBottom: 20 }}>
                    {isFull ? (
                        <Alert 
                            message="CURSO LLENO" 
                            description={`Ya hay ${cuposInfo.ocupados} de ${cuposInfo.total} estudiantes inscritos.`} 
                            type="error" 
                            showIcon 
                        />
                    ) : (
                        <Alert 
                            message="Cupos Disponibles" 
                            description={`Quedan ${disponibilidad} lugares disponibles (Inscritos: ${cuposInfo.ocupados}/${cuposInfo.total})`} 
                            type="success" 
                            showIcon 
                        />
                    )}
                </div>
            )}

            <Form {...formProps} form={formProps.form} layout="vertical" onFinish={handleOnFinish}>
                
                <Card title="1. Buscar o Crear Estudiante" variant="outlined" style={{ marginBottom: 20 }}>
                    <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
                        <Input
                            placeholder="Número de identificación"
                            value={identificacionBuscar}
                            onChange={(e) => setIdentificacionBuscar(e.target.value)}
                            onPressEnter={handleBuscarEstudiante}
                            prefix={<SearchOutlined />}
                        />
                        <Button type="primary" onClick={handleBuscarEstudiante} loading={searchingStudent}>
                            Buscar
                        </Button>
                    </Space.Compact>

                    {studentFound && (
                        <Alert
                            type="success"
                            message={`Estudiante: ${studentFound.nombre_completo}`}
                            description={`ID: ${studentFound.identificacion} · Tel: ${studentFound.telefono || 'N/A'} · Email: ${studentFound.email || 'N/A'}`}
                            showIcon
                        />
                    )}



                    <Form.Item name="estudiante_id" hidden>
                        <Input />
                    </Form.Item>
                </Card>

                <Divider />

                <Card title="2. Seleccionar Curso" variant="outlined" style={{ marginBottom: 20 }}>

                <Form.Item
                    label="Curso a inscribir"
                    name="curso_id"
                    rules={[{ required: true, message: "Selecciona un curso" }]}
                >
                    <Select 
                        {...cursoSelectProps} 
                        placeholder="Selecciona el curso..."
                        onChange={handleCursoChange}
                        loading={checking}
                        suffixIcon={<BookOutlined />}
                    />
                </Form.Item>
                </Card>

                <div style={{ display: 'flex', gap: 20 }}>
                    <Form.Item
                        label="Fecha de Inicio"
                        name="fecha_inicio"
                        initialValue={dayjs()}
                        style={{ flex: 1 }}
                        normalize={(value) => {
                            if (!value) return null;
                            return dayjs.isDayjs(value) ? value : dayjs(value);
                        }}
                        getValueFromEvent={(value) => {
                            if (!value) return null;
                            return dayjs.isDayjs(value) ? value.format("YYYY-MM-DD") : value;
                        }}
                    >
                        <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                    </Form.Item>

                    <Form.Item
                        label="Estado de Matrícula"
                        name="estado"
                        initialValue="activo"
                        style={{ flex: 1 }}
                    >
                        <Select options={[
                            { label: 'Activo', value: 'activo' },
                            { label: 'Pendiente Pago', value: 'pendiente' },
                            { label: 'Congelada', value: 'congelada' }
                        ]} />
                    </Form.Item>
                </div>

                <Form.Item label="Observaciones / Notas" name="observaciones">
                    <Input.TextArea rows={2} placeholder="Ej: Trae documentos pendientes..." />
                </Form.Item>

            </Form>

            <Modal
                title="Crear Nuevo Estudiante"
                open={createModalOpen}
                onCancel={() => {
                    setCreateModalOpen(false);
                    createForm.resetFields();
                }}
                footer={null}
            >
                <Form form={createForm} layout="vertical" onFinish={handleCrearEstudiante}>
                    <Form.Item name="identificacion" label="Identificación" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="nombre_completo" label="Nombre Completo" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="email" label="Email">
                        <Input type="email" />
                    </Form.Item>
                    <Form.Item name="telefono" label="Teléfono" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item>
                        <Space>
                            <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
                                Crear Estudiante
                            </Button>
                            <Button onClick={() => {
                                setCreateModalOpen(false);
                                createForm.resetFields();
                            }}>
                                Cancelar
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </Create>
    );
}