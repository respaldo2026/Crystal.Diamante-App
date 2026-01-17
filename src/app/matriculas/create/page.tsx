"use client";

import React, { useEffect, useState, useRef } from "react";
import { useForm, useSelect } from "@refinedev/antd";
import { Form, Select, DatePicker, Input, Card, message, Alert, Button, Space, Divider, Modal, Col, Row, Descriptions, Result, Typography } from "antd";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { BookOutlined, SearchOutlined, PlusOutlined, PrinterOutlined, DollarCircleOutlined, CheckCircleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { enviarWhatsappConPlantilla } from "@utils/whatsapp";
import { formatDate } from "@utils/date";
import { useRouter } from "next/navigation";

const { Title, Text } = Typography;

export default function MatriculaCreate() {
    const router = useRouter();
    const { formProps, saveButtonProps, onFinish } = useForm({ redirect: false });
    const printRef = useRef<HTMLDivElement>(null);

    // Estados para fase 1: crear inscripción
    const [cuposInfo, setCuposInfo] = useState<{ ocupados: number; total: number } | null>(null);
    const [checking, setChecking] = useState(false);
    const [searchingStudent, setSearchingStudent] = useState(false);
    const [studentFound, setStudentFound] = useState<any>(null);
    const [identificacionBuscar, setIdentificacionBuscar] = useState("");
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [programaSeleccionado, setProgramaSeleccionado] = useState<string | undefined>(undefined);
    const [createForm] = Form.useForm();
    const [cursoOptions, setCursoOptions] = useState<{ label: string; value: string | number }[]>([]);
    const [cursosLoading, setCursosLoading] = useState(false);

    // Estados para fase 2: inscripción creada, mostrando recibo y pago
    const [inscripcionCreada, setInscripcionCreada] = useState(false);
    const [matriculaData, setMatriculaData] = useState<any>(null);
    const [estudianteData, setEstudianteData] = useState<any>(null);
    const [cursoData, setCursoData] = useState<any>(null);
    const [pagoInscripcionData, setPagoInscripcionData] = useState<any>(null);
    const [procesandoPago, setProcesandoPago] = useState(false);
    const [pagoForm] = Form.useForm();
    const [mediosPago, setMediosPago] = useState<any[]>([]);

    const { selectProps: programaSelectProps } = useSelect({
        resource: "programas",
        optionLabel: "nombre",
        optionValue: "id",
        filters: [{ field: "activo", operator: "eq", value: true }],
    });

    // Cargar medios de pago
    useEffect(() => {
        const cargarMediosPago = async () => {
            const { data } = await supabaseBrowserClient
                .from("medios_pago")
                .select("*")
                .eq("activo", true)
                .order("orden", { ascending: true });
            
            setMediosPago(data || []);
        };
        cargarMediosPago();
    }, []);

    useEffect(() => {
        const loadCursos = async () => {
            if (!programaSeleccionado) {
                setCursoOptions([]);
                return;
            }

            setCursosLoading(true);
            try {
                // Primero obtenemos los cursos
                const { data: cursosData, error } = await supabaseBrowserClient
                    .from("cursos")
                    .select("id, nombre, cupos, fecha_inicio, estado, programa_id")
                    .eq("programa_id", programaSeleccionado)
                    .in("estado", ["activo", "proximo"])
                    .order("fecha_inicio", { ascending: true, nullsFirst: true });

                if (error) throw error;

                // Luego contamos matrículas activas para cada curso
                const cursosConConteo = await Promise.all(
                    (cursosData || []).map(async (curso: any) => {
                        const { count } = await supabaseBrowserClient
                            .from("matriculas")
                            .select("*", { count: "exact", head: true })
                            .eq("curso_id", curso.id)
                            .neq("estado", "cancelado");
                        
                        return {
                            ...curso,
                            inscritos: count || 0
                        };
                    })
                );

                const today = dayjs();
                const mapped = cursosConConteo
                    .map((curso: any) => {
                        const inscritos = curso.inscritos;
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
                .select("id,nombre_completo,email,telefono,identificacion,rol")
                .eq("identificacion", identificacionBuscar.trim())
                .maybeSingle();

            if (error) throw error;

            if (data) {
                setStudentFound(data);
                formProps.form?.setFieldValue("estudiante_id", data.id);
                if (data.rol !== 'estudiante') {
                    message.warning(`Usuario encontrado con rol: ${data.rol}. Se procederá a matricular.`);
                } else {
                    message.success(`Estudiante encontrado: ${data.nombre_completo}`);
                }
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

            // REFACTORIZACIÓN (Auditoría): Usar API para crear usuario Auth + Perfil
            // Esto asegura que el estudiante pueda iniciar sesión.
            const response = await fetch("/api/create-user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: values.email || `${values.identificacion}@academia.local`, // Fallback si no tiene email
                    password: String(values.identificacion), // Contraseña inicial = Identificación
                    rol: "estudiante",
                    user_metadata: {
                        identificacion: values.identificacion,
                        nombre_completo: values.nombre_completo,
                        telefono: values.telefono,
                        activo: true,
                        notif_whatsapp: true,
                    },
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Error al crear el estudiante");
            }

            const data = result.perfil; // La API devuelve { success: true, user, perfil }

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
                .eq("curso_id", cursoIdNumber)
                .neq("estado", "cancelado");

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
        const { estudiante_id, curso_id, fecha_inicio, observaciones } = values || {};

        if (!estudiante_id) {
            message.error("⚠️ Debes buscar o crear un estudiante primero.");
            return;
        }

        if (!curso_id) {
            message.error("⚠️ Debes seleccionar un curso.");
            return;
        }

        if (cuposInfo && cuposInfo.ocupados >= cuposInfo.total) {
            message.error("⛔ ¡El curso está lleno! No se puede matricular.");
            return;
        }

        const { count } = await supabaseBrowserClient
            .from("matriculas")
            .select("id", { count: "exact", head: true })
            .eq("estudiante_id", estudiante_id)
            .eq("curso_id", curso_id);

        if ((count || 0) > 0) {
            message.error("⚠️ Ya existe una matrícula para este estudiante en este curso.");
            return;
        }

        const payload = { estudiante_id, curso_id, fecha_inicio, estado: "pendiente", observaciones };

        try {
            const result = await onFinish(payload);
            const matriculaId = result?.data?.id;

            if (!matriculaId) {
                throw new Error("No se pudo obtener el ID de la matrícula creada");
            }

            message.success("✅ Inscripción académica registrada");

            // Cargar datos completos para mostrar el recibo
            const { data: matricula } = await supabaseBrowserClient
                .from("matriculas")
                .select(`*, cursos(*, programas(*))`)
                .eq("id", matriculaId)
                .single();

            const { data: estudiante } = await supabaseBrowserClient
                .from("perfiles")
                .select("*")
                .eq("id", estudiante_id)
                .single();

            const { data: pagoInscripcion } = await supabaseBrowserClient
                .from("pagos")
                .select("*")
                .eq("matricula_id", matriculaId)
                .eq("numero_cuota", 0)
                .single();

            setMatriculaData(matricula);
            setEstudianteData(estudiante);
            setCursoData(matricula?.cursos);
            setPagoInscripcionData(pagoInscripcion);
            setInscripcionCreada(true);

            // Enviar WhatsApp con plantilla
            if (estudiante?.telefono && (estudiante?.notif_whatsapp ?? true)) {
                await enviarWhatsappConPlantilla(
                    estudiante.telefono,
                    'inscripcion_academica',
                    {
                        nombre: estudiante.nombre_completo,
                        curso: matricula?.cursos?.nombre ?? "Curso"
                    },
                    // Mensaje fallback si no existe la plantilla
                    `Hola ${estudiante.nombre_completo}, tu inscripción académica al curso "${matricula?.cursos?.nombre ?? "Curso"}" fue registrada. Por favor completa el pago de inscripción para activar tu matrícula.`
                );
            }

            // Inicializar formulario de pago
            const montoInscripcion = pagoInscripcion?.monto || matricula?.cursos?.programas?.precio_inscripcion || 50000;
            pagoForm.setFieldsValue({
                monto: montoInscripcion,
                fecha_pago: dayjs()
            });

        } catch (error: any) {
            console.error("Error creando matrícula:", error);
            message.error("❌ Error al crear la matrícula. Por favor intenta de nuevo.");
        }
    };

    const handleRegistrarPago = async (values: any) => {
        try {
            setProcesandoPago(true);

            const { monto, metodo_pago, referencia, fecha_pago } = values;

            // Actualizar el pago de inscripción
            const { error: errUpdate } = await supabaseBrowserClient
                .from("pagos")
                .update({
                    estado: "pagado",
                    monto: monto,
                    metodo_pago: metodo_pago,
                    referencia: referencia || null,
                    fecha_pago: fecha_pago ? dayjs(fecha_pago).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD"),
                    observaciones: `Pago registrado el ${dayjs().format("DD/MM/YYYY HH:mm")}`
                })
                .eq("id", pagoInscripcionData.id);

            if (errUpdate) throw errUpdate;

            // Activar la matrícula
            const { error: errMat } = await supabaseBrowserClient
                .from("matriculas")
                .update({ estado: "activo" })
                .eq("id", matriculaData.id);

            if (errMat) throw errMat;

            message.success("✅ Pago registrado y matrícula activada");

            // Enviar WhatsApp de confirmación con plantilla
            if (estudianteData?.telefono && (estudianteData?.notif_whatsapp ?? true)) {
                await enviarWhatsappConPlantilla(
                    estudianteData.telefono,
                    'pago_confirmado',
                    {
                        nombre: estudianteData.nombre_completo,
                        curso: cursoData?.nombre ?? "Curso"
                    },
                    // Mensaje fallback
                    `¡Hola ${estudianteData.nombre_completo}! Tu pago de inscripción ha sido confirmado. Tu matrícula al curso "${cursoData?.nombre}" está ahora ACTIVA. ¡Bienvenido! 🎉`
                );
            }

            setTimeout(() => {
                router.push(`/estudiantes/show/${estudianteData.id}`);
            }, 2000);
        } catch (error: any) {
            console.error("Error registrando pago:", error);
            message.error("Error al registrar el pago");
        } finally {
            setProcesandoPago(false);
        }
    };

    const handlePrint = () => {
        if (printRef.current) {
            const printWindow = window.open("", "_blank");
            if (printWindow) {
                printWindow.document.write(`
                    <html>
                        <head>
                            <title>Recibo de Inscripción</title>
                            <style>
                                body { font-family: Arial, sans-serif; padding: 20px; }
                                .header { text-align: center; margin-bottom: 30px; }
                                h3 { margin: 10px 0; }
                            </style>
                        </head>
                        <body>
                            ${printRef.current.innerHTML}
                        </body>
                    </html>
                `);
                printWindow.document.close();
                printWindow.print();
            }
        }
    };

    const isFull = cuposInfo ? cuposInfo.ocupados >= cuposInfo.total : false;
    const disponibilidad = cuposInfo ? cuposInfo.total - cuposInfo.ocupados : 0;

    // Fase 1: Formulario de inscripción académica
    if (!inscripcionCreada) {
        return (
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px" }}>
                <Title level={2}>📝 Nueva Matrícula - Paso 1: Inscripción Académica</Title>

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
                    <Card title="1. Buscar o Crear Estudiante" style={{ marginBottom: 20 }}>
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
                                description={`ID: ${studentFound.identificacion} · Tel: ${studentFound.telefono || "N/A"}`}
                                showIcon
                            />
                        )}

                        <Form.Item name="estudiante_id" hidden>
                            <Input />
                        </Form.Item>
                    </Card>

                    <Divider />

                    <Card title="2. Seleccionar Programa y Curso" style={{ marginBottom: 20 }}>
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
                                        onChange={(value) => {
                                            setProgramaSeleccionado(value as unknown as string);
                                            setCuposInfo(null);
                                            formProps.form?.setFieldValue("curso_id", undefined);
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
                                        disabled={!programaSeleccionado}
                                        onChange={(val) => handleCursoChange(val as string)}
                                        suffixIcon={<BookOutlined />}
                                    />
                                </Form.Item>
                            </Col>
                        </Row>
                    </Card>

                    <Card title="3. Detalles">
                        <Row gutter={16}>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    label="Fecha de Inicio"
                                    name="fecha_inicio"
                                    initialValue={dayjs()}
                                    getValueProps={(value) => ({
                                        value: value ? dayjs(value) : null,
                                    })}
                                    getValueFromEvent={(value) => value ? dayjs(value).format("YYYY-MM-DD") : null}
                                >
                                    <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item label="Observaciones / Notas" name="observaciones">
                                    <Input.TextArea rows={2} placeholder="Ej: Trae documentos pendientes..." />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Button type="primary" htmlType="submit" size="large" block loading={saveButtonProps.loading}>
                            Crear Inscripción Académica
                        </Button>
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
            </div>
        );
    }

    // Fase 2: Recibo y pago
    const yaPagado = pagoInscripcionData?.estado === "pagado";
    const montoInscripcion = pagoInscripcionData?.monto || cursoData?.programas?.precio_inscripcion || 50000;

    return (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px" }}>
            <Title level={2}>
                {yaPagado ? "✅ Inscripción Completa" : "💰 Paso 2: Pago de Inscripción"}
            </Title>

            {!yaPagado && (
                <Alert
                    message="Inscripción Académica Registrada ✅"
                    description="Ahora completa el pago de inscripción para activar la matrícula."
                    type="success"
                    showIcon
                    style={{ marginBottom: 20 }}
                />
            )}

            <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                    <Card
                        title="📄 Recibo de Inscripción"
                        extra={
                            <Button icon={<PrinterOutlined />} onClick={handlePrint}>
                                Imprimir
                            </Button>
                        }
                    >
                        <div ref={printRef}>
                            <div style={{ textAlign: "center", marginBottom: 30 }}>
                                <Title level={3}>Academia Crystal Diamante</Title>
                                <Text>Recibo de Inscripción</Text>
                                <br />
                                <Text type="secondary">Fecha: {dayjs().format("DD/MM/YYYY")}</Text>
                            </div>

                            <Divider />

                            <Descriptions column={1} bordered size="small">
                                <Descriptions.Item label="Estudiante">
                                    {estudianteData?.nombre_completo}
                                </Descriptions.Item>
                                <Descriptions.Item label="Identificación">
                                    {estudianteData?.identificacion}
                                </Descriptions.Item>
                                <Descriptions.Item label="Programa">
                                    {cursoData?.programas?.nombre}
                                </Descriptions.Item>
                                <Descriptions.Item label="Curso">
                                    {cursoData?.nombre}
                                </Descriptions.Item>
                                <Descriptions.Item label="Fecha Inicio">
                                    {matriculaData?.fecha_inicio ? dayjs(matriculaData.fecha_inicio).format("DD/MM/YYYY") : "Por definir"}
                                </Descriptions.Item>
                            </Descriptions>

                            <Divider />

                            <div style={{ padding: "20px", background: yaPagado ? "#f6ffed" : "#fff7e6", borderRadius: 8 }}>
                                <Space direction="vertical" style={{ width: "100%" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <Text strong>Inscripción:</Text>
                                        <Text strong style={{ fontSize: 18 }}>
                                            ${montoInscripcion.toLocaleString()}
                                        </Text>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <Text strong>Estado:</Text>
                                        <Text strong style={{ color: yaPagado ? "green" : "red" }}>
                                            {yaPagado ? "✅ PAGADO" : "⏳ PENDIENTE"}
                                        </Text>
                                    </div>
                                </Space>
                            </div>
                        </div>
                    </Card>
                </Col>

                <Col xs={24} md={12}>
                    {!yaPagado ? (
                        <Card title={<><DollarCircleOutlined /> Registrar Pago</>}>
                            <Form
                                form={pagoForm}
                                layout="vertical"
                                onFinish={handleRegistrarPago}
                            >
                                <Form.Item
                                    label="Monto Pagado"
                                    name="monto"
                                    rules={[{ required: true, message: "Ingresa el monto" }]}
                                >
                                    <Input prefix="$" type="number" />
                                </Form.Item>

                                <Form.Item
                                    label="Método de Pago"
                                    name="metodo_pago"
                                    rules={[{ required: true, message: "Selecciona el método" }]}
                                >
                                    <Select placeholder="Selecciona el medio de pago">
                                        {mediosPago.map((medio) => (
                                            <Select.Option key={medio.codigo} value={medio.codigo}>
                                                {medio.nombre}
                                            </Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>

                                <Form.Item label="Referencia" name="referencia">
                                    <Input placeholder="Ej: TRANS123456" />
                                </Form.Item>

                                <Form.Item
                                    label="Fecha de Pago"
                                    name="fecha_pago"
                                    rules={[{ required: true, message: "Selecciona la fecha" }]}
                                >
                                    <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
                                </Form.Item>

                                <Form.Item>
                                    <Button
                                        type="primary"
                                        htmlType="submit"
                                        block
                                        size="large"
                                        loading={procesandoPago}
                                        icon={<CheckCircleOutlined />}
                                    >
                                        Confirmar Pago y Activar Matrícula
                                    </Button>
                                </Form.Item>
                            </Form>
                        </Card>
                    ) : (
                        <Result
                            status="success"
                            title="¡Matrícula Activada!"
                            subTitle="El pago ha sido registrado correctamente."
                            extra={[
                                <Button key="perfil" type="primary" onClick={() => router.push(`/estudiantes/show/${estudianteData.id}`)}>
                                    Ver Perfil del Estudiante
                                </Button>
                            ]}
                        />
                    )}
                </Col>
            </Row>
        </div>
    );
}
