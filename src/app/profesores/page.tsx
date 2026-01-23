"use client";

import React, { useEffect, useState } from "react";
import { logger } from "@utils/logger";
import { useNavigation, useDelete } from "@refinedev/core";
import { Card, Avatar, Typography, Button, Spin, Alert, List, Badge, message, Modal, Form, Select, Input, Dropdown } from "antd";
import { 
    UserOutlined, PhoneOutlined, MailOutlined, EditOutlined, 
    DeleteOutlined, PlusOutlined, IdcardOutlined, ReloadOutlined, StopOutlined,
    WhatsAppOutlined, MoreOutlined, BookOutlined
} from "@ant-design/icons";

// CORRECCIÓN: Usamos la misma ruta que funcionó en 'Inventario'
import { obtenerUsuariosPorRol } from "../../modules/usuarios/usuarios.service";
import { obtenerCursos } from "../../modules/academico/cursos.service";
import { enviarWhatsapp } from "../../modules/comunicacion/whatsapp.service";

const { Text, Title } = Typography;

export default function ProfesoresCards() {
    const { edit, create, show } = useNavigation();
    const { mutate: deleteMutation } = useDelete();
    
    // ESTADOS
    const [profesores, setProfesores] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState("");
    const [totalEncontrados, setTotalEncontrados] = useState(0);
    const [modalVisible, setModalVisible] = useState(false);
    const [loadingDelete, setLoadingDelete] = useState(false);
    const [profesorSeleccionado, setProfesorSeleccionado] = useState<any>(null);
    const [reassignTo, setReassignTo] = useState<string | null>(null);
    const [motivoBaja, setMotivoBaja] = useState("");

    // FUNCIÓN DE CARGA
    const cargarProfesores = async () => {
        setLoading(true);
        setErrorMsg("");
        try {
            const data = await obtenerUsuariosPorRol("profesor");
            setTotalEncontrados(data?.length || 0);
            const soloProfes = (data || []).filter((p: any) => p.activo !== false);
            const profesoresConCursos = await Promise.all(
                soloProfes.map(async (prof: any) => {
                    const cursos = await obtenerCursos();
                    const cursosActivos = (cursos || []).filter((c: any) => c.profesor_id === prof.id && c.estado === "activo");
                    return { ...prof, cursos_activos: cursosActivos };
                })
            );
            setProfesores(profesoresConCursos);
            setProfesorSeleccionado(null);
        } catch (err: any) {
            logger.error("Error cargando:", err);
            setErrorMsg(err.message || "Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        cargarProfesores();
    }, []);

    const desactivarProfesor = async (id: string) => {
        try {
            setLoadingDelete(true);
            const { error } = await supabaseBrowserClient
                .from("perfiles")
                .update({ activo: false, fecha_baja: new Date().toISOString(), motivo_baja: motivoBaja || null })
                .eq("id", id);
            if (error) throw error;
            message.success("Profesor desactivado");
            setModalVisible(false);
            setMotivoBaja("");
            cargarProfesores();
        } catch (e: any) {
            message.error(e?.message || "No se pudo desactivar");
        } finally {
            setLoadingDelete(false);
        }
    };

    const eliminarProfesorDefinitivo = async (id: string) => {
        try {
            setLoadingDelete(true);

            if (reassignTo) {
                const { error: errReassignCursos } = await supabaseBrowserClient
                    .from("cursos")
                    .update({ profesor_id: reassignTo })
                    .eq("profesor_id", id);
                if (errReassignCursos) throw errReassignCursos;
            } else {
                const { error: errNullCursos } = await supabaseBrowserClient
                    .from("cursos")
                    .update({ profesor_id: null })
                    .eq("profesor_id", id);
                if (errNullCursos) throw errNullCursos;
            }

            const { error: errSesiones } = await supabaseBrowserClient
                .from("sesiones_clase")
                .update({ profesor_id: null })
                .eq("profesor_id", id);
            if (errSesiones) throw errSesiones;

            const { error: errNomina } = await supabaseBrowserClient
                .from("pagos_nomina")
                .delete()
                .eq("profesor_id", id);
            if (errNomina) throw errNomina;

            const { error: errPagosProf } = await supabaseBrowserClient
                .from("pagos_profesores")
                .delete()
                .eq("profesor_id", id);
            if (errPagosProf) throw errPagosProf;

            await new Promise<void>((resolve, reject) => {
                deleteMutation(
                    { resource: "perfiles", id },
                    {
                        onSuccess: () => resolve(),
                        onError: (e) => reject(e),
                    }
                );
            });

            message.success("Profesor eliminado");
            setModalVisible(false);
            setReassignTo(null);
            cargarProfesores();
        } catch (e: any) {
            message.error(e?.message || "No se pudo eliminar");
        } finally {
            setLoadingDelete(false);
        }
    };

    return (
        <div style={{ padding: 20 }}>
            {/* ENCABEZADO */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Title level={3} style={{ margin: 0 }}>👨‍🏫 Equipo Docente</Title>
                <div style={{ display: 'flex', gap: 10 }}>
                    <Button icon={<ReloadOutlined />} onClick={cargarProfesores}>Recargar</Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => create("profesores")}>
                        Nuevo
                    </Button>
                </div>
            </div>

            {/* MENSAJES DE ESTADO */}
            {errorMsg && (
                <Alert type="error" message="Error" description={errorMsg} showIcon style={{marginBottom: 20}} />
            )}
            
            {!loading && totalEncontrados === 0 && (
                <Alert type="warning" message="Base de datos vacía" description="Conexión exitosa, pero la tabla 'perfiles' no tiene datos." showIcon style={{marginBottom: 20}} />
            )}

            {/* LISTA DE TARJETAS */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 50 }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 10, color: '#888' }}>Cargando profesores...</div>
                </div>
            ) : (
                <List
                    grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 3, xl: 4 }}
                    dataSource={profesores}
                    locale={{ emptyText: "No se encontraron profesores registrados" }}
                    renderItem={(profesor) => (
                        <List.Item>
                            <Card
                                hoverable
                                style={{ borderRadius: 10, borderTop: '3px solid #722ed1', cursor: 'pointer' }}
                                onClick={() => show("profesores", profesor.id)}
                            >
                                <Card.Meta
                                    avatar={
                                        <Avatar size={48} style={{ backgroundColor: '#fde3cf', color: '#f56a00' }}>
                                            {profesor.nombre_completo ? profesor.nombre_completo[0].toUpperCase() : <UserOutlined />}
                                        </Avatar>
                                    }
                                    title={profesor.nombre_completo || "Sin Nombre"}
                                    description={
                                        <div style={{ marginTop: 8, fontSize: '13px' }}>
                                            {profesor.email && <div><MailOutlined /> {profesor.email}</div>}
                                            {profesor.telefono && <div><PhoneOutlined /> {profesor.telefono}</div>}
                                            {profesor.cursos_activos?.length > 0 && (
                                                <div style={{ marginTop: 6, color: '#722ed1', fontWeight: 'bold' }}>
                                                    <BookOutlined /> {profesor.cursos_activos.length} curso{profesor.cursos_activos.length !== 1 ? 's' : ''} activo{profesor.cursos_activos.length !== 1 ? 's' : ''}
                                                </div>
                                            )}
                                            <div style={{marginTop:5}}>
                                                <Badge status="success" text="Activo" />
                                            </div>
                                        </div>
                                    }
                                />
                                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                                    {profesor.telefono && (
                                        <Button
                                            icon={<WhatsAppOutlined />}
                                            size="small"
                                            style={{ backgroundColor: '#25D366', color: '#fff', border: 'none', flex: 1 }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                enviarWhatsapp(profesor.telefono, `Hola ${profesor.nombre_completo}, te contacto desde Academia Crystal.`);
                                            }}
                                        >
                                            WhatsApp
                                        </Button>
                                    )}
                                    <Button
                                        icon={<MoreOutlined />}
                                        size="small"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setProfesorSeleccionado(profesor);
                                            setModalVisible(true);
                                        }}
                                    >
                                        Acciones
                                    </Button>
                                </div>
                            </Card>
                        </List.Item>
                    )}
                />
            )}

            <ReassignDeleteModal
                open={modalVisible}
                onCancel={() => {
                    setModalVisible(false);
                    setProfesorSeleccionado(null);
                    setMotivoBaja("");
                    setReassignTo(null);
                }}
                loading={loadingDelete}
                profesor={profesorSeleccionado}
                profesores={profesores}
                onDesactivar={desactivarProfesor}
                onEliminar={eliminarProfesorDefinitivo}
                setReassignTo={setReassignTo}
                motivoBaja={motivoBaja}
                setMotivoBaja={setMotivoBaja}
            />
        </div>
    );
}

function ReassignDeleteModal({
    open,
    onCancel,
    loading,
    profesor,
    profesores,
    onDesactivar,
    onEliminar,
    setReassignTo,
    motivoBaja,
    setMotivoBaja,
}: any) {
    return (
        <Modal
            open={open}
            title={profesor ? `Gestionar: ${profesor.nombre_completo}` : "Acción"}
            onCancel={onCancel}
            footer={null}
        >
            <Typography.Paragraph>
                Selecciona una acción. Desactivar preserva el historial. Eliminar requiere reubicar cursos.
            </Typography.Paragraph>
            <div style={{ marginBottom: 16 }}>
                <Typography.Text strong>Motivo de baja (opcional)</Typography.Text>
                <Input value={motivoBaja} onChange={(e) => setMotivoBaja(e.target.value)} placeholder="Ej: Renuncia, contrato finalizado" />
                <div style={{ marginTop: 8 }}>
                    <Button icon={<StopOutlined />} onClick={() => onDesactivar(profesor.id)} loading={loading}>
                        Desactivar profesor
                    </Button>
                </div>
            </div>
            <div>
                <Typography.Text strong>Reasignar cursos (opcional)</Typography.Text>
                <Select
                    style={{ width: '100%', marginTop: 8 }}
                    placeholder="Selecciona nuevo profesor o deja vacío para 'Sin profesor'"
                    allowClear
                    onChange={(val) => setReassignTo(val || null)}
                    options={(profesores || []).filter((p: any) => p.id !== profesor?.id).map((p: any) => ({ label: p.nombre_completo, value: p.id }))}
                />
                <div style={{ marginTop: 8 }}>
                    <Button danger icon={<DeleteOutlined />} onClick={() => onEliminar(profesor.id)} loading={loading}>
                        Eliminar definitivamente
                    </Button>
                </div>
            </div>
        </Modal>
    );
}