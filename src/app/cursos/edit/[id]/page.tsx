"use client";

import React, { useState } from "react";
import { Edit, useForm } from "@refinedev/antd";
import { Form, Input, Select, InputNumber, Row, Col, DatePicker, message, Button, Modal, Space } from "antd";
import { DeleteOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { supabaseBrowserClient } from "@utils/supabase/client";

export default function CursoEdit() {
    const { formProps, saveButtonProps, queryResult } = useForm({
        redirect: "list"
    });
    const router = useRouter();
    const [deleting, setDeleting] = useState(false);
    const [modal, modalContextHolder] = Modal.useModal();
    const cursoId = queryResult?.data?.data?.id;

    const handleDeleteCurso = async () => {
        setDeleting(true);
        try {
            // Validar dependencias antes de eliminar
            const [matriculas, pagos, sesiones] = await Promise.all([
                supabaseBrowserClient
                    .from("matriculas")
                    .select("id")
                    .eq("curso_id", cursoId),
                supabaseBrowserClient
                    .from("pagos")
                    .select("id, matriculas(curso_id)")
                    .eq("matriculas.curso_id", cursoId),
                supabaseBrowserClient
                    .from("sesiones_clase")
                    .select("id")
                    .eq("curso_id", cursoId),
            ]);

            const matriculasCount = matriculas.data?.length || 0;
            const pagosCount = pagos.data?.length || 0;
            const sesionesCount = sesiones.data?.length || 0;

            // Si hay dependencias, mostrar advertencia en lugar de permitir eliminación
            if (matriculasCount > 0 || pagosCount > 0 || sesionesCount > 0) {
                let mensaje = "⚠️ No se puede eliminar este curso porque contiene:\n\n";
                if (matriculasCount > 0) mensaje += `• ${matriculasCount} matrícula(s) activa(s)\n`;
                if (pagosCount > 0) mensaje += `• ${pagosCount} pago(s) registrado(s)\n`;
                if (sesionesCount > 0) mensaje += `• ${sesionesCount} sesión(es) de clase\n`;
                
                mensaje += "\n✅ ALTERNATIVA: Cambiar el estado del curso a 'Finalizado' para archivarlo sin perder historial.";

                modal.info({
                    title: "No se puede eliminar el curso",
                    content: mensaje,
                    okText: "Entendido",
                });
                setDeleting(false);
                return;
            }

            // Si no hay dependencias, proceder a eliminar
            modal.confirm({
                title: "⚠️ Eliminar Curso",
                content: "Este curso no tiene datos asociados. ¿Estás seguro de que deseas eliminarlo? Esta acción no se puede deshacer.",
                okText: "Sí, eliminar",
                okType: "danger",
                cancelText: "Cancelar",
                onOk: async () => {
                    try {
                        const { error } = await supabaseBrowserClient
                            .from("cursos")
                            .delete()
                            .eq("id", cursoId);

                        if (error) throw error;

                        message.success("Curso eliminado correctamente");
                        router.push("/cursos");
                    } catch (error: any) {
                        console.error("Error eliminando curso:", error);
                        message.error("Error al eliminar el curso: " + (error?.message || "Desconocido"));
                        setDeleting(false);
                    }
                },
                onCancel: () => {
                    setDeleting(false);
                }
            });
        } catch (error: any) {
            console.error("Error validando dependencias:", error);
            message.error("Error al validar datos: " + (error?.message || "Desconocido"));
            setDeleting(false);
        }
    };

    return (
        <>
            {modalContextHolder}
            <Edit 
                saveButtonProps={saveButtonProps} 
                title="Editar Curso"
                headerButtons={() => (
                    <Space>
                        <Button 
                            icon={<ArrowLeftOutlined />} 
                            onClick={() => router.push("/cursos")}
                        >
                            Volver
                        </Button>
                        <Button 
                            danger 
                            icon={<DeleteOutlined />} 
                            onClick={handleDeleteCurso}
                            loading={deleting}
                            style={{ marginLeft: "auto" }}
                        >
                            Eliminar Curso
                        </Button>
                    </Space>
                )}
            >
            <Form 
                {...formProps} 
                layout="vertical" 
                onFinish={async (values) => {
                    try {
                        return await formProps.onFinish?.(values);
                    } catch (err: any) {
                        const msg = err?.message || (err && JSON.stringify(err)) || 'Error al guardar';
                        message.error(msg);
                        throw err;
                    }
                }}
            >
                
                <Row gutter={24}>
                    <Col span={16}>
                        <Form.Item
                            label="Nombre del Curso"
                            name="nombre"
                            rules={[{ required: true, message: "El nombre es obligatorio" }]}
                        >
                            <Input />
                        </Form.Item>
                    </Col>
                    
                    <Col span={8}>
                        <Form.Item
                            label="Estado"
                            name="estado"
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
                    label="Descripción"
                    name="descripcion"
                >
                    <Input.TextArea rows={3} />
                </Form.Item>

                <Row gutter={24}>
                    <Col span={8}>
                        <Form.Item
                            label="Precio Inscripción"
                            name="precio_inscripcion"
                        >
                            <InputNumber 
                                style={{ width: "100%" }} 
                                formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                parser={(value) => value?.replace(/\$\s?|(,*)/g, '') as unknown as number}
                            />
                        </Form.Item>
                    </Col>
                    
                    <Col span={8}>
                        <Form.Item
                            label="Valor Total / Mensualidad"
                            name="precio_mensualidad"
                            rules={[{ required: true }]}
                        >
                            <InputNumber 
                                style={{ width: "100%" }}
                                formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                parser={(value) => value?.replace(/\$\s?|(,*)/g, '') as unknown as number}
                            />
                        </Form.Item>
                    </Col>

                    {/* --- AQUÍ SE MODIFICA EL CUPO --- */}
                    <Col span={8}>
                        <Form.Item
                            label="Cupos Totales"
                            name="cupos"
                            rules={[{ required: true, message: "El cupo es obligatorio" }]}
                            help="Si reduces el cupo, asegúrate que no haya más inscritos que este número"
                        >
                            <InputNumber min={1} style={{ width: "100%" }} />
                        </Form.Item>
                    </Col>
                </Row>

                <Row gutter={24}>
                    <Col span={8}>
                         <Form.Item 
                            label="Fecha Inicio" 
                            name="fecha_inicio"
                            getValueProps={(value) => ({
                                value: value ? dayjs(value) : "",
                            })}
                            getValueFromEvent={(value) => {
                                // Convert Dayjs to ISO date string before submit
                                try {
                                    return value ? (value as dayjs.Dayjs).format("YYYY-MM-DD") : null;
                                } catch (e) {
                                    return value;
                                }
                            }}
                         >
                            <DatePicker style={{width: '100%'}} format="YYYY-MM-DD" />
                         </Form.Item>
                    </Col>
                    <Col span={8}>
                         <Form.Item label="Duración" name="duracion">
                            <Input />
                         </Form.Item>
                    </Col>
                </Row>

            </Form>
            </Edit>
        </>
    );
}