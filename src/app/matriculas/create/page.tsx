"use client";

import React, { useEffect, useState } from "react";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { Form, Select, DatePicker, Input, Card, message, Alert, Button, Space, Divider, Modal, Col, Row } from "antd";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { BookOutlined, SearchOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { enviarWhatsapp } from "@utils/whatsapp";
import { formatDate } from "@utils/date";

export default function MatriculaCreate() {
    const { formProps, saveButtonProps, onFinish } = useForm({ redirect: "list" });

    const [cuposInfo, setCuposInfo] = useState<{ ocupados: number; total: number } | null>(null);
    const [checking, setChecking] = useState(false);
    const [searchingStudent, setSearchingStudent] = useState(false);
    const [studentFound, setStudentFound] = useState<any>(null);
    const [identificacionBuscar, setIdentificacionBuscar] = useState("");
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [programaSeleccionado, setProgramaSeleccionado] = useState<string | undefined>(undefined);
    const [createForm] = Form.useForm();
    const [cursoOptions, setCursoOptions] = useState<{ label: string; value: string | number; disabled?: boolean }[]>([]);
    const [cursosLoading, setCursosLoading] = useState(false);

    const { selectProps: programaSelectProps } = useSelect({
        resource: "programas",
        optionLabel: "nombre",
        optionValue: "id",
        filters: [{ field: "activo", operator: "eq", value: true }],
    });
    useEffect(() => {
        const loadCursos = async () => {
            if (!programaSeleccionado) {
                setCursoOptions([]);
                return;
            }

            setCursosLoading(true);
            try {
                const todayString = dayjs().format("YYYY-MM-DD");
                const { data, error } = await supabaseBrowserClient
                    .from("cursos")
                    .select("id, nombre, cupos, fecha_inicio, estado, programa_id, matriculas(count)")
                    .eq("programa_id", programaSeleccionado)
                    .in("estado", ["activo", "proximo"])
                    .or(`fecha_inicio.is.null,fecha_inicio.gte.${todayString}`)
                    .order("fecha_inicio", { ascending: true, nullsFirst: true });

                if (error) throw error;

                const today = dayjs();
                const mapped = (data || [])
                    .map((curso: any) => {
                        const inscritos = curso?.matriculas?.[0]?.count ?? 0;
                        const cupos = curso?.cupos ?? 0;
                        const disponibles = cupos - inscritos;
                        if (disponibles <= 0) return null;

                        const fechaLabel = curso?.fecha_inicio ? formatDate(curso.fecha_inicio) : "Sin fecha";
                        const esProximo = curso?.fecha_inicio && dayjs(curso.fecha_inicio).diff(today, "day") <= 14;
                        const badge = esProximo ? "[Próximo] " : "";
                        return {
                            value: curso.id,
                            label: `${badge}${curso.nombre} · ${fechaLabel} · cupos ${disponibles}`,
                        };
                    })
                    .filter(Boolean) as { label: string; value: string | number }[];

                setCursoOptions(mapped);
            } catch (err) {
                console.error("No se pudieron cargar los cursos disponibles", err);
                setCursoOptions([]);
            } finally {
                setCursosLoading(false);
            }
        };

        loadCursos();
    }, [programaSeleccionado]);

    const handleBuscarEstudiante = async () => {
        if (!identificacionBuscar.trim()) {
            message.warning("Ingresa un número de identificación");
            return;
        }

        setSearchingStudent(true);
        setStudentFound(null);

        try {
            const { data, error } = await supabaseBrowserClient
                .from("perfiles")
                .select("*")
                .eq("identificacion", identificacionBuscar.trim())
                .eq("rol", "estudiante")
                .maybeSingle();

            if (error) throw error;

            if (data) {
                setStudentFound(data);
                formProps.form?.setFieldValue("estudiante_id", data.id);
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

    const handleCrearEstudiante = async (values: any) => {
        try {
            const { count } = await supabaseBrowserClient
                .from("perfiles")
                .select("*", { count: "exact", head: true })
                .eq("identificacion", values.identificacion);

            if ((count || 0) > 0) {
                message.error("Ya existe un estudiante con esa identificación");
                return;
            }

            const { data, error } = await supabaseBrowserClient
                .from("perfiles")
                .insert({
                    identificacion: values.identificacion,
                    nombre_completo: values.nombre_completo,
                    email: values.email,
                    telefono: values.telefono,
                    rol: "estudiante",
                    activo: true,
                    notif_whatsapp: true,
                })
                .select()
                .single();

            if (error) throw error;

            setStudentFound(data);
            formProps.form?.setFieldValue("estudiante_id", data.id);
            setCreateModalOpen(false);
            createForm.resetFields();
            message.success("Estudiante creado correctamente");
        } catch (e: any) {
            message.error(e?.message || "Error creando estudiante");
        }
    };

    const handleCursoChange = async (cursoId: string | number) => {
        if (!cursoId) return;

        const cursoIdNumber = typeof cursoId === "string" ? Number(cursoId) : cursoId;

        setChecking(true);
        setCuposInfo(null);

        try {
            const { data: curso, error: errCurso } = await supabaseBrowserClient
                .from("cursos")
                .select("cupos, nombre, programa_id")
                .eq("id", cursoIdNumber)
                .single();

            if (errCurso) throw errCurso;

            if (curso?.programa_id) {
                setProgramaSeleccionado(String(curso.programa_id));
                formProps.form?.setFieldValue("programa_id", curso.programa_id);
            }

            const { count, error: errCount } = await supabaseBrowserClient
                .from("matriculas")
                .select("*", { count: "exact", head: true })
                .eq("curso_id", cursoIdNumber);

            if (errCount) throw errCount;

            setCuposInfo({
                ocupados: count || 0,
                total: curso?.cupos || 20,
            });
        } catch (error) {
            console.error("Error verificando cupos:", error);
        } finally {
            setChecking(false);
        }
    };

    const handleOnFinish = async (values: any) => {
        const { estudiante_id, curso_id, fecha_inicio, estado, observaciones } = values || {};

        if (cuposInfo && cuposInfo.ocupados >= cuposInfo.total) {
            message.error("⛔ ¡El curso está lleno! No se puede matricular.");
            return;
        }

        if (estudiante_id && curso_id) {
            const { count } = await supabaseBrowserClient
                .from("matriculas")
                .select("id", { count: "exact", head: true })
                .eq("estudiante_id", estudiante_id)
                .eq("curso_id", curso_id);

            if ((count || 0) > 0) {
                message.error("⚠️ Ya existe una matrícula para este estudiante en este curso.");
                return;
            }
        }

        // Solo enviar los campos que existen en la tabla matriculas
        const payload = { estudiante_id, curso_id, fecha_inicio, estado, observaciones };
        
        await onFinish(payload);

        try {
            const { data: perfil } = await supabaseBrowserClient
                .from("perfiles")
                .select("nombre_completo, telefono, notif_whatsapp")
                .eq("id", estudiante_id)
                .single();

            const { data: curso } = await supabaseBrowserClient
                .from("cursos")
                .select("nombre")
                .eq("id", curso_id)
                .single();

            if (perfil?.telefono && (perfil?.notif_whatsapp ?? true)) {
                enviarWhatsapp(
                    perfil.telefono,
                    `Hola ${perfil.nombre_completo}, tu matrícula al curso "${curso?.nombre ?? "Curso"}" fue registrada. ¡Bienvenido!`
                );
            }
        } catch (e) {
            console.warn("No se pudo enviar WhatsApp:", e);
        }
    };

    const isFull = cuposInfo ? cuposInfo.ocupados >= cuposInfo.total : false;
    const disponibilidad = cuposInfo ? cuposInfo.total - cuposInfo.ocupados : 0;

    return (
        <Create saveButtonProps={{ ...saveButtonProps, onClick: () => formProps.form?.submit() }} title="Nueva Matrícula">
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
                    <Space.Compact style={{ width: "100%", marginBottom: 16 }}>
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
                            description={`ID: ${studentFound.identificacion} · Tel: ${studentFound.telefono || "N/A"} · Email: ${studentFound.email || "N/A"}`}
                            showIcon
                        />
                    )}

                    <Form.Item name="estudiante_id" hidden>
                        <Input />
                    </Form.Item>
                </Card>

                <Divider />

                <Card title="2. Seleccionar Programa y Curso" variant="outlined" style={{ marginBottom: 20 }}>
                    <Row gutter={16}>
                        <Col xs={24} md={12}>
                            <Form.Item
                                label="Programa"
                                name="programa_id"
                                rules={[{ required: true, message: "Selecciona un programa" }]}
                            >
                                <Select
                                    {...programaSelectProps}
                                    placeholder="Selecciona el programa..."
                                    notFoundContent="No hay programas activos o próximos"
                                    onChange={(value) => {
                                        setProgramaSeleccionado(value as string);
                                        setCuposInfo(null);
                                        formProps.form?.setFieldValue("curso_id", undefined);
                                        programaSelectProps?.onChange?.(value);
                                    }}
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item
                                label="Curso a inscribir"
                                name="curso_id"
                                rules={[{ required: true, message: "Selecciona un curso" }]}
                            >
                                <Select
                                    options={cursoOptions}
                                    loading={cursosLoading || checking}
                                    placeholder={programaSeleccionado ? "Selecciona el curso..." : "Primero elige un programa"}
                                    notFoundContent={programaSeleccionado ? "No hay cursos activos o próximos disponibles" : "Primero elige un programa"}
                                    disabled={!programaSeleccionado}
                                    onChange={(val) => {
                                        formProps.form?.setFieldValue("curso_id", val);
                                        handleCursoChange(val as string);
                                    }}
                                    suffixIcon={<BookOutlined />}
                                    showSearch
                                    optionFilterProp="label"
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                </Card>

                <Card title="3. Detalles de Matrícula" variant="outlined">
                    <Row gutter={16}>
                        <Col xs={24} md={12}>
                            <Form.Item
                                label="Fecha de Inicio"
                                name="fecha_inicio"
                                initialValue={dayjs()}
                                normalize={(value) => {
                                    if (!value) return null;
                                    return dayjs.isDayjs(value) ? value : dayjs(value);
                                }}
                                getValueFromEvent={(value) => {
                                    if (!value) return null;
                                    return dayjs.isDayjs(value) ? value.format("YYYY-MM-DD") : value;
                                }}
                            >
                                <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item label="Estado de Matrícula" name="estado" initialValue="activo">
                                <Select
                                    options={[
                                        { label: "Activo", value: "activo" },
                                        { label: "Pendiente Pago", value: "pendiente" },
                                        { label: "Congelada", value: "congelada" },
                                    ]}
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item label="Observaciones / Notas" name="observaciones">
                        <Input.TextArea rows={2} placeholder="Ej: Trae documentos pendientes..." />
                    </Form.Item>
                </Card>
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
                            <Button
                                onClick={() => {
                                    setCreateModalOpen(false);
                                    createForm.resetFields();
                                }}
                            >
                                Cancelar
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </Create>
    );
}