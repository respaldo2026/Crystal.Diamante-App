"use client";

import React, { useState, useEffect } from "react";
import { Edit, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, Select, InputNumber, Row, Col, DatePicker, message, Button, Modal, Space, TimePicker, Typography, Tag } from "antd";
import { DeleteOutlined, ArrowLeftOutlined, BookOutlined } from "@ant-design/icons";
import { useRouter, useParams } from "next/navigation";
import dayjs from "dayjs";
import { supabaseBrowserClient } from "@utils/supabase/client";

export default function CursoEdit() {
    const { formProps, saveButtonProps } = useForm({
        redirect: "list"
    });
    const router = useRouter();
    const params = useParams();
    const [deleting, setDeleting] = useState(false);
    const [modal, modalContextHolder] = Modal.useModal();
    const [estadoActual, setEstadoActual] = useState<string | undefined>(undefined);
    const [activosCount, setActivosCount] = useState<number>(0);
    const rawCursoId = params?.id as string;
    const cursoId = rawCursoId ? Number(rawCursoId) : undefined;
        useEffect(() => {
            const cargarEstado = async () => {
                if (!cursoId || Number.isNaN(cursoId)) return;
                const { data } = await supabaseBrowserClient
                    .from("cursos")
                    .select("estado")
                    .eq("id", cursoId)
                    .single();
                setEstadoActual(data?.estado);

                const { data: matriculas } = await supabaseBrowserClient
                    .from("matriculas")
                    .select("id")
                    .eq("curso_id", cursoId)
                    .eq("estado", "activo");
                setActivosCount((matriculas || []).length);
            };
            cargarEstado();
        }, [cursoId]);

        const handleToggleEstadoGrupo = async () => {
            if (!cursoId || Number.isNaN(cursoId)) {
                message.error("No se pudo identificar el curso");
                return;
            }
            const esActivo = (estadoActual || "activo") === "activo";
            const nuevoEstado = esActivo ? "finalizado" : "activo";
            const accion = esActivo ? "finalizar" : "reactivar";

            try {
                if (esActivo) {
                    const { data: matriculasActivas, error: errorMatriculas } = await supabaseBrowserClient
                        .from("matriculas")
                        .select("id, estado, perfiles (nombre_completo)")
                        .eq("curso_id", cursoId)
                        .eq("estado", "activo");

                    if (errorMatriculas) throw errorMatriculas;

                    if (matriculasActivas && matriculasActivas.length > 0) {
                        const lista = (
                            <ul>
                                {matriculasActivas.slice(0, 5).map((m: any) => (
                                    <li key={m.id}>{m.perfiles?.nombre_completo || "Sin nombre"}</li>
                                ))}
                                {matriculasActivas.length > 5 && <li>... y {matriculasActivas.length - 5} más</li>}
                            </ul>
                        );

                        modal.warning({
                            title: "No se puede finalizar el grupo",
                            content: (
                                <div>
                                    <Typography.Paragraph>
                                        Este grupo tiene <strong>{matriculasActivas.length} estudiantes activos</strong>. Antes de finalizarlo debes:
                                    </Typography.Paragraph>
                                    <ol>
                                        <li>Ir a Gestionar del grupo o a la lista de matrículas</li>
                                        <li>Marcar cada matrícula como completada, cancelada o retirada</li>
                                        <li>Cuando todas estén cerradas, podrás finalizar el grupo</li>
                                    </ol>
                                    <Typography.Paragraph><strong>Estudiantes activos:</strong></Typography.Paragraph>
                                    {lista}
                                </div>
                            ),
                            okText: "Entendido",
                        });
                        return;
                    }
                }

                modal.confirm({
                    title: esActivo ? "¿Finalizar este grupo/cohorte?" : "¿Reactivar este grupo/cohorte?",
                    content: esActivo ? (
                        <div>
                            <p>Estás a punto de <strong>finalizar</strong> el grupo.</p>
                            <ul>
                                <li>Desaparecerá de la lista principal</li>
                                <li>No estará disponible para nuevas matrículas</li>
                                <li>Se mantiene todo el historial</li>
                                <li>Podrás reactivarlo cuando lo necesites</li>
                            </ul>
                        </div>
                    ) : (
                        <div>
                            <p>Estás a punto de <strong>reactivar</strong> el grupo.</p>
                            <p>Volverá a estar disponible para nuevas inscripciones.</p>
                        </div>
                    ),
                    okText: esActivo ? "Sí, finalizar" : "Sí, reactivar",
                    okType: esActivo ? "default" : "primary",
                    cancelText: "Cancelar",
                    onOk: async () => {
                        const { error } = await supabaseBrowserClient
                            .from("cursos")
                            .update({ estado: nuevoEstado })
                            .eq("id", cursoId);
                        if (error) throw error;
                        message.success(`Grupo ${nuevoEstado === 'activo' ? 'reactivado' : 'finalizado'} correctamente`);
                        router.push(`/cursos/show/${cursoId}`);
                    },
                });
            } catch (error: any) {
                message.error(`Error al ${accion} el grupo`);
                console.error(error);
            }
        };
    

    const { selectProps: programaSelectProps } = useSelect({
        resource: "programas",
        optionLabel: "nombre",
        optionValue: "id",
    });

    const handleDeleteCurso = async () => {
        if (!cursoId || Number.isNaN(cursoId)) {
            message.error("No se pudo identificar el curso a eliminar");
            return;
        }

        setDeleting(true);
        try {
            // Validar dependencias antes de eliminar
            const [matriculas, sesiones] = await Promise.all([
                supabaseBrowserClient
                    .from("matriculas")
                    .select("id")
                    .eq("curso_id", cursoId),
                supabaseBrowserClient
                    .from("sesiones_clase")
                    .select("id")
                    .eq("curso_id", cursoId),
            ]);

            const matriculasCount = matriculas.data?.length || 0;
            const sesionesCount = sesiones.data?.length || 0;

            // Calcular pagos a partir de IDs de matrícula (evita falsos positivos)
            let pagosCount = 0;
            const matriculaIds = (matriculas.data || []).map((m: any) => m.id);
            if (matriculaIds.length > 0) {
                const pagosRes = await supabaseBrowserClient
                    .from("pagos")
                    .select("id")
                    .in("matricula_id", matriculaIds);
                pagosCount = pagosRes.data?.length || 0;
            }

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
                title="Editar Grupo/Cohorte"
                headerButtons={() => (
                    <Space>
                        <Button 
                            icon={<ArrowLeftOutlined />} 
                            onClick={() => router.push("/cursos")}
                        >
                            Volver
                        </Button>
                        <Button 
                            type={estadoActual === 'activo' ? 'default' : 'primary'}
                            danger={estadoActual === 'activo'}
                            onClick={handleToggleEstadoGrupo}
                        >
                            {estadoActual === 'activo' ? 'Finalizar Grupo' : 'Reactivar Grupo'}
                        </Button>
                        {estadoActual === 'activo' && (
                            <Tag color="blue">{activosCount} activos</Tag>
                        )}
                        <Button 
                            danger 
                            icon={<DeleteOutlined />} 
                            onClick={handleDeleteCurso}
                            loading={deleting}
                            disabled={!cursoId || deleting}
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
                        // Construir objeto de actualización limpio
                        const datosActualizacion: any = {};
                        const v: any = values;
                        
                        // Solo agregar campos que existen y tienen valor
                        if (v.programa_id !== undefined) datosActualizacion.programa_id = v.programa_id;
                        if (v.nombre !== undefined) datosActualizacion.nombre = v.nombre;
                        if (v.estado !== undefined) datosActualizacion.estado = v.estado;
                        if (v.profesor_id !== undefined) datosActualizacion.profesor_id = v.profesor_id;
                        if (v.descripcion !== undefined) datosActualizacion.descripcion = v.descripcion;
                        if (v.precio_inscripcion !== undefined) datosActualizacion.precio_inscripcion = v.precio_inscripcion;
                        if (v.precio_mensualidad !== undefined) datosActualizacion.precio_mensualidad = v.precio_mensualidad;
                        if (v.cupos !== undefined) datosActualizacion.cupos = v.cupos;
                        
                        // Convertir fecha correctamente
                        if (v.fecha_inicio !== undefined) {
                            datosActualizacion.fecha_inicio = v.fecha_inicio 
                                ? dayjs(v.fecha_inicio).format('YYYY-MM-DD') 
                                : null;
                        }
                        
                        if (v.duracion !== undefined) datosActualizacion.duracion = v.duracion;
                        
                        // Convertir días de array a string
                        if (v.dias_semana !== undefined) {
                            datosActualizacion.dias_semana = Array.isArray(v.dias_semana) 
                                ? v.dias_semana.join(', ')
                                : (v.dias_semana || '');
                        }
                        
                        // Convertir horas correctamente
                        if (v.hora_inicio !== undefined) {
                            datosActualizacion.hora_inicio = v.hora_inicio 
                                ? (dayjs.isDayjs(v.hora_inicio) 
                                    ? v.hora_inicio.format('HH:mm:ss')
                                    : v.hora_inicio)
                                : null;
                        }
                        
                        if (v.hora_fin !== undefined) {
                            datosActualizacion.hora_fin = v.hora_fin 
                                ? (dayjs.isDayjs(v.hora_fin)
                                    ? v.hora_fin.format('HH:mm:ss')
                                    : v.hora_fin)
                                : null;
                        }
                        
                        // Actualizar con Supabase (sin .select() para evitar triggers innecesarios)
                        const { error } = await supabaseBrowserClient
                            .from('cursos')
                            .update(datosActualizacion)
                            .eq('id', cursoId);
                        
                        if (error) {
                            console.error('Error Supabase:', error);
                            throw error;
                        }
                        
                        message.success('Curso actualizado correctamente');
                        router.push('/cursos');
                    } catch (err: any) {
                        console.error('Error completo:', err);
                        const msg = err?.message || 'Error al guardar';
                        message.error(msg);
                    }
                }}
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
                                placeholder="Selecciona el programa"
                                prefix={<BookOutlined />}
                            />
                        </Form.Item>
                    </Col>
                    
                    <Col span={12}>
                        <Form.Item
                            label="Nombre del Grupo/Cohorte"
                            name="nombre"
                            rules={[{ required: true, message: "El nombre es obligatorio" }]}
                        >
                            <Input placeholder="Ej: Grupo A, Cohorte Mañana" />
                        </Form.Item>
                    </Col>
                </Row>

                <Row gutter={24}>
                    <Col span={16}>
                        <Form.Item
                            label="Descripción/Notas"
                            name="descripcion"
                        >
                            <Input.TextArea rows={2} />
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
                                    { label: "Finalizado", value: "finalizado" },
                                ]}
                            />
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
                                value: value ? dayjs(value) : null,
                            })}
                         >
                            <DatePicker style={{width: '100%'}} format="YYYY-MM-DD" />
                         </Form.Item>
                    </Col>
                    <Col span={8}>
                         <Form.Item 
                            label="Fecha Fin" 
                            name="fecha_fin"
                            getValueProps={(value) => ({
                                value: value ? dayjs(value) : null,
                            })}
                         >
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
                            getValueProps={(value) => ({
                                value: typeof value === 'string' && value
                                    ? value.split(',').map((d: string) => d.trim())
                                    : value || []
                            })}
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
                            getValueProps={(value) => ({
                                value: value ? dayjs(value, "HH:mm:ss") : undefined,
                            })}
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
                            getValueProps={(value) => ({
                                value: value ? dayjs(value, "HH:mm:ss") : undefined,
                            })}
                            getValueFromEvent={(value) => {
                                return value ? value.format("HH:mm:ss") : null;
                            }}
                        >
                            <TimePicker style={{ width: '100%' }} format="HH:mm" />
                        </Form.Item>
                    </Col>
                </Row>

            </Form>
            </Edit>
        </>
    );
}