"use client";

import React, { useState, useEffect } from "react";
import { List, useTable, EditButton, DeleteButton, CreateButton, useSelect } from "@refinedev/antd";
import { Table, Space, Tag, Typography, Button, Tooltip, Progress, Select, Modal, message, Tabs, Card, Row, Col } from "antd";
import { 
  FileTextOutlined, 
  CheckCircleOutlined, 
  SyncOutlined, 
  CloseCircleOutlined, 
  DownloadOutlined,
  WarningOutlined,
  LockOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { DiplomaPDF } from "@components/pdf/DiplomaPDF";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { enviarWhatsapp } from "@utils/whatsapp";

const { Text } = Typography;

export default function MatriculasList() {
    const [asistenciasPorMatricula, setAsistenciasPorMatricula] = useState<Record<number, any>>({});
    const [loadingAsistencias, setLoadingAsistencias] = useState(false);
    const [modal, modalContextHolder] = Modal.useModal();
    const [activeTab, setActiveTab] = useState<string>('nuevo');
    const [listFilter, setListFilter] = useState<'all' | 'sin_pagos' | 'con_pagos' | 'bajo_asistencia'>('all');

    // Traemos las matrículas junto con los datos del Estudiante (perfiles) y el Curso (cursos)
    const { tableProps, tableQueryResult, setFilters } = useTable({
        resource: "matriculas",
        meta: {
            select: "*, perfiles(nombre_completo, email), cursos(nombre, porcentaje_minimo, precio_mensualidad)"
        },
        sorters: {
            initial: [
                {
                    field: "created_at",
                    order: "desc",
                },
            ],
        },
    });

    const matriculas = tableQueryResult?.data?.data || [];

    // Calcular asistencias cuando cambian las matrículas
    useEffect(() => {
        if (matriculas.length > 0) {
            calcularAsistencias();
        }
    }, [matriculas.length]);

    const calcularAsistencias = async () => {
        setLoadingAsistencias(true);
        try {
            const matriculaIds = matriculas.map((m: any) => m.id);
            
            const { data: asistencias } = await supabaseBrowserClient
                .from("asistencias")
                .select("matricula_id, estado")
                .in("matricula_id", matriculaIds);

            const { data: pagos } = await supabaseBrowserClient
                .from("pagos")
                .select("matricula_id, monto")
                .in("matricula_id", matriculaIds);

            const statsMap: Record<number, any> = {};
            
            matriculas.forEach((matricula: any) => {
                const asistenciasAlumno = asistencias?.filter(a => a.matricula_id === matricula.id) || [];
                const totalClases = asistenciasAlumno.length;
                const presentes = asistenciasAlumno.filter(a => a.estado === 'presente').length;
                const porcentaje = totalClases > 0 ? (presentes / totalClases) * 100 : 0;
                const minimoRequerido = matricula.cursos?.porcentaje_minimo || 80;

                const pagosMatricula = pagos?.filter(p => p.matricula_id === matricula.id) || [];
                const pagosCount = pagosMatricula.length;
                const pagosTotal = pagosMatricula.reduce((acc, curr: any) => acc + Number(curr.monto || 0), 0);

                statsMap[matricula.id] = {
                    totalClases,
                    presentes,
                    porcentaje: Math.round(porcentaje),
                    minimoRequerido,
                    cumple: porcentaje >= minimoRequerido,
                    tieneDatos: totalClases > 0,
                    pagosCount,
                    pagosTotal
                };
            });

            setAsistenciasPorMatricula(statsMap);
        } catch (error) {
            console.error("Error calculando asistencias:", error);
        } finally {
            setLoadingAsistencias(false);
        }
    };

    // Clasificación y conteos - Usar filteredByQuick que refleja el estado actual de datos
    const activoEstados = ["activo", "en curso"];
    const graduadoEstados = ["aprobado", "certificado", "finalizado"];
    
    // Calcular conteos basados en los datos que tenemos ahora (después de asistencias)
    const activosCount = matriculas.filter((m: any) => activoEstados.includes(String(m.estado || '').toLowerCase())).length;
    const graduadosCount = matriculas.filter((m: any) => graduadoEstados.includes(String(m.estado || '').toLowerCase())).length;
    const desertoresCount = matriculas.filter((m: any) => {
        const stats = asistenciasPorMatricula[m.id];
        // Desertor: tiene datos de asistencia Y no cumple el mínimo
        return stats && stats.tieneDatos && !stats.cumple;
    }).length;

    const filteredDataSource = (() => {
        if (activeTab === 'activos') {
            return (tableProps.dataSource as any[] || []).filter((m: any) => activoEstados.includes(String(m.estado || '').toLowerCase()));
        }
        if (activeTab === 'graduados') {
            return (tableProps.dataSource as any[] || []).filter((m: any) => graduadoEstados.includes(String(m.estado || '').toLowerCase()));
        }
        if (activeTab === 'desertores') {
            return (tableProps.dataSource as any[] || []).filter((m: any) => {
                const s = asistenciasPorMatricula[m.id];
                return s && s.tieneDatos && !s.cumple;
            });
        }
        return tableProps.dataSource;
    })();

    const filteredByQuick = (() => {
        let arr = filteredDataSource as any[] || [];
        if (listFilter === 'sin_pagos') {
            arr = arr.filter((m: any) => {
                const s = asistenciasPorMatricula[m.id];
                return s && (s.pagosCount || 0) === 0;
            });
        } else if (listFilter === 'con_pagos') {
            arr = arr.filter((m: any) => {
                const s = asistenciasPorMatricula[m.id];
                return s && (s.pagosCount || 0) > 0;
            });
        } else if (listFilter === 'bajo_asistencia') {
            arr = arr.filter((m: any) => {
                const s = asistenciasPorMatricula[m.id];
                return s && s.tieneDatos && !s.cumple;
            });
        }
        return arr;
    })();

    // Selector para filtrar por curso
    const { selectProps: cursoFilterSelect } = useSelect({
        resource: "cursos",
        optionLabel: "nombre",
        optionValue: "id",
    });

    const onFilterCurso = (cursoId?: string) => {
        setFilters([
            ...(cursoId ? [{ field: "curso_id", operator: "eq", value: cursoId }] : [])
        ]);
    };

    const handleEliminar = async (record: any) => {
        try {
            const supabase = supabaseBrowserClient;
            const [asist, pagos] = await Promise.all([
                supabase.from('asistencias').select('id', { count: 'exact', head: true }).eq('matricula_id', record.id),
                supabase.from('pagos').select('id', { count: 'exact', head: true }).eq('matricula_id', record.id),
            ]);

            const asistCount = asist.count || 0;
            const pagosCount = pagos.count || 0;

            if (asistCount > 0 || pagosCount > 0) {
                let msg = 'No se puede eliminar porque existen registros asociados:\n\n';
                if (asistCount > 0) msg += `• ${asistCount} asistencia(s)\n`;
                if (pagosCount > 0) msg += `• ${pagosCount} pago(s)\n`;
                msg += '\nSugerencia: usa "Cancelar Matrícula" para preservar el historial.';
                modal.info({ title: 'Eliminación bloqueada', content: msg.replaceAll('\n', '\n') });
                return;
            }

            modal.confirm({
                title: 'Eliminar Matrícula',
                content: 'Esta acción no se puede deshacer. ¿Deseas continuar?',
                okText: 'Eliminar',
                okType: 'danger',
                cancelText: 'Cancelar',
                async onOk() {
                    const { error } = await supabase.from('matriculas').delete().eq('id', record.id);
                    if (error) {
                        message.error(error.message || 'No se pudo eliminar');
                    } else {
                        message.success('Matrícula eliminada');
                        window.location.reload();
                    }
                },
            });
        } catch (e: any) {
            message.error(e?.message || 'Error validando dependencias');
        }
    };

    const handleCancelar = async (record: any) => {
        modal.confirm({
            title: 'Cancelar Matrícula',
            content: 'Esto marcará la matrícula como "cancelado" y conservará el historial. ¿Confirmas?',
            okText: 'Cancelar matrícula',
            cancelText: 'Volver',
            async onOk() {
                const { error } = await supabaseBrowserClient
                    .from('matriculas')
                    .update({ estado: 'cancelado' })
                    .eq('id', record.id);
                if (error) {
                    message.error(error.message || 'No se pudo cancelar');
                } else {
                    message.success('Matrícula cancelada');
                    // Notificar por WhatsApp si el estudiante lo permite
                    try {
                        const { data: perfil } = await supabaseBrowserClient
                            .from('perfiles')
                            .select('nombre_completo, telefono, notif_whatsapp')
                            .eq('id', record.estudiante_id)
                            .single();
                        const { data: curso } = await supabaseBrowserClient
                            .from('cursos')
                            .select('nombre')
                            .eq('id', record.curso_id)
                            .single();
                        if (perfil?.telefono && (perfil?.notif_whatsapp ?? true)) {
                            enviarWhatsapp(
                                perfil.telefono,
                                `Hola ${perfil.nombre_completo}, tu matrícula en "${curso?.nombre ?? 'Curso'}" fue cancelada. Si fue un error, contáctanos.`
                            );
                        }
                    } catch (e) {
                        console.warn('No se pudo enviar WhatsApp de cancelación:', e);
                    }
                    window.location.reload();
                }
            },
        });
    };
                {/* COLUMNA 6: PAGOS */}
                <Table.Column
                    title="Pagos"
                    align="center"
                    render={(_, record: any) => {
                        const stats = asistenciasPorMatricula[record.id];
                        if (!stats) return <Text type="secondary" style={{fontSize:11}}>—</Text>;
                        const totalFmt = `$ ${Number(stats.pagosTotal || 0).toLocaleString()}`;
                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <Tag color="gold">{stats.pagosCount || 0} pago(s)</Tag>
                                <Text type="secondary" style={{fontSize:11}}>{totalFmt}</Text>
                            </div>
                        );
                    }}
                />

                {/* COLUMNA 7: MONTO PAGADO */}
                <Table.Column
                    title="Monto Pagado"
                    dataIndex="id"
                    align="center"
                    render={(_, record: any) => {
                        const stats = asistenciasPorMatricula[record.id];
                        const total = Number(stats?.pagosTotal || 0);
                        return (
                            <Text strong style={{ color: '#3f8600' }}>
                                $ {total.toLocaleString()}
                            </Text>
                        );
                    }}
                />

                {/* COLUMNA 8: SALDO ESTIMADO (mensualidad) */}
                <Table.Column
                    title="Saldo Estimado"
                    align="center"
                    render={(_, record: any) => {
                        const stats = asistenciasPorMatricula[record.id];
                        const mensualidad = Number(record.cursos?.precio_mensualidad || 0);
                        const pagado = Number(stats?.pagosTotal || 0);
                        const saldo = Math.max(0, mensualidad - pagado);
                        const color = saldo > 0 ? '#fa8c16' : '#389e0d';
                        return (
                            <Text strong style={{ color }}>
                                $ {saldo.toLocaleString()}
                            </Text>
                        );
                    }}
                />


    return (
        <>
        {modalContextHolder}
        <List title="Gestión de Matrículas">
            <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
                { key: 'nuevo', label: 'Nueva Matrícula' },
                { key: 'activos', label: `Activos (${activosCount})` },
                { key: 'graduados', label: `Graduados (${graduadosCount})` },
                { key: 'desertores', label: `Desertores (${desertoresCount})` },
            ]} />

            {activeTab === 'nuevo' ? (
                <>
                    <Row gutter={16} style={{ marginBottom: 16 }}>
                        <Col xs={24} md={8}>
                            <Card title="Activos" variant="outlined">
                                <Space direction="vertical">
                                    <Text>Estudiantes actualmente cursando.</Text>
                                    <Tag color="processing">{activosCount} matrícula(s)</Tag>
                                    <Button onClick={() => setActiveTab('activos')}>Ver listado</Button>
                                </Space>
                            </Card>
                        </Col>
                        <Col xs={24} md={8}>
                            <Card title="Graduados" variant="outlined">
                                <Space direction="vertical">
                                    <Text>Finalizaron y pueden certificar.</Text>
                                    <Tag color="success">{graduadosCount} matrícula(s)</Tag>
                                    <Button onClick={() => setActiveTab('graduados')}>Ver listado</Button>
                                </Space>
                            </Card>
                        </Col>
                        <Col xs={24} md={8}>
                            <Card title="Desertores" variant="outlined">
                                <Space direction="vertical">
                                    <Text>Asistencia por debajo del mínimo.</Text>
                                    <Tag color="error">{desertoresCount} matrícula(s)</Tag>
                                    <Button onClick={() => setActiveTab('desertores')}>Ver listado</Button>
                                </Space>
                            </Card>
                        </Col>
                    </Row>
                    <Space>
                        <CreateButton type="primary" size="large" icon={<FileTextOutlined />}>Crear nueva matrícula</CreateButton>
                        <Select
                            {...cursoFilterSelect}
                            allowClear
                            placeholder="Filtrar por curso"
                            style={{ minWidth: 260 }}
                            onChange={onFilterCurso}
                        />
                    </Space>
                </>
            ) : (
                <>
                    <Space style={{ marginBottom: 12 }}>
                        <Select
                            {...cursoFilterSelect}
                            allowClear
                            placeholder="Filtrar por curso"
                            style={{ minWidth: 260 }}
                            onChange={onFilterCurso}
                        />
                        <CreateButton type="primary" icon={<FileTextOutlined />}>Nueva Matrícula</CreateButton>
                    </Space>
                    {/* Quick filters for table */}
                    <Space style={{ marginBottom: 12 }}>
                        <Button size="small" type={listFilter === 'all' ? 'primary' : 'default'} onClick={() => setListFilter('all')}>Todas</Button>
                        <Button size="small" type={listFilter === 'sin_pagos' ? 'primary' : 'default'} onClick={() => setListFilter('sin_pagos')}>Sin Pagos</Button>
                        <Button size="small" type={listFilter === 'con_pagos' ? 'primary' : 'default'} onClick={() => setListFilter('con_pagos')}>Con Pagos</Button>
                        <Button size="small" type={listFilter === 'bajo_asistencia' ? 'primary' : 'default'} onClick={() => setListFilter('bajo_asistencia')}>Bajo Asistencia</Button>
                    </Space>
                </>
            )}
            {activeTab !== 'nuevo' && (
            <Table {...tableProps} dataSource={filteredByQuick as any} rowKey="id" loading={tableQueryResult?.isLoading || loadingAsistencias}>
                
                {/* COLUMNA 1: ESTUDIANTE */}
                <Table.Column
                    title="Estudiante"
                    dataIndex={["perfiles", "nombre_completo"]}
                    render={(val, record: any) => (
                        <div style={{display:'flex', flexDirection:'column'}}>
                            <Text strong>{val || "Sin nombre"}</Text>
                            <Text type="secondary" style={{fontSize:12}}>{record.perfiles?.email}</Text>
                        </div>
                    )}
                />

                {/* COLUMNA 2: CURSO */}
                <Table.Column
                    title="Curso Inscrito"
                    dataIndex={["cursos", "nombre"]}
                    render={(val) => <Tag color="blue">{val || "Curso General"}</Tag>}
                />

                {/* COLUMNA 3: ASISTENCIA */}
                <Table.Column
                    title="Asistencia"
                    align="center"
                    render={(_, record: any) => {
                        const stats = asistenciasPorMatricula[record.id];
                        
                        if (!stats || !stats.tieneDatos) {
                            return <Text type="secondary" style={{fontSize:11}}>Sin datos</Text>;
                        }

                        const { porcentaje, minimoRequerido, cumple } = stats;

                        return (
                            <Tooltip 
                                title={`${stats.presentes}/${stats.totalClases} clases. Mínimo requerido: ${minimoRequerido}%`}
                            >
                                <div style={{ minWidth: 80 }}>
                                    <Progress 
                                        type="circle" 
                                        percent={porcentaje} 
                                        size={50}
                                        status={cumple ? 'success' : 'exception'}
                                        format={(percent) => `${percent}%`}
                                    />
                                </div>
                            </Tooltip>
                        );
                    }}
                />

                {/* COLUMNA 4: ESTADO ACADÉMICO */}
                <Table.Column
                    title="Estado"
                    dataIndex="estado"
                    render={(val, record: any) => {
                        let color = "default";
                        let icon = <SyncOutlined spin />;
                        
                        const estado = (val || "").toLowerCase();

                        if (estado === "aprobado" || estado === "certificado") {
                            color = "success";
                            icon = <CheckCircleOutlined />;
                        } else if (estado === "cancelado" || estado === "retirado") {
                            color = "error";
                            icon = <CloseCircleOutlined />;
                        } else if (estado === "activo" || estado === "en curso") {
                            color = "processing";
                        }

                        return <Tag color={color} icon={icon}>{val?.toUpperCase()}</Tag>;
                    }}
                />

                {/* COLUMNA 5: FECHA MATRÍCULA (creación) */}
                <Table.Column
                    title="Fecha Matrícula"
                    dataIndex="created_at"
                    render={(val) => dayjs(val).format("DD/MM/YYYY")}
                />

                {/* COLUMNA 6: DIPLOMA CON VALIDACIÓN */}
                <Table.Column
                    title="Certificado"
                    align="center"
                    render={(_, record: any) => {
                        const estado = (record.estado || "").toLowerCase();
                        const esAprobado = estado === "aprobado" || estado === "certificado" || estado === "finalizado";
                        const stats = asistenciasPorMatricula[record.id];
                        
                        // Si no está aprobado, mostrar mensaje
                        if (!esAprobado) {
                            return <Text type="secondary" style={{fontSize:11}}>En progreso...</Text>;
                        }

                        // VALIDACIÓN: Verificar asistencia
                        if (stats && stats.tieneDatos && !stats.cumple) {
                            return (
                                <Tooltip title={`No cumple el porcentaje mínimo de asistencia (${stats.porcentaje}% < ${stats.minimoRequerido}%)`}>
                                    <Tag color="error" icon={<LockOutlined />}>
                                        BLOQUEADO
                                    </Tag>
                                </Tooltip>
                            );
                        }

                        // Si cumple todo, mostrar diploma
                        return (
                            <PDFDownloadLink
                                document={
                                    <DiplomaPDF 
                                        estudiante={record.perfiles?.nombre_completo || "Estudiante"}
                                        curso={record.cursos?.nombre || "Curso"}
                                        fechaFin={record.updated_at || new Date().toISOString()} 
                                        folio={record.id}
                                    />
                                }
                                fileName={`Diploma_${record.perfiles?.nombre_completo || 'Alumno'}.pdf`}
                            >
                                {({ loading }) => 
                                    loading ? (
                                        <Button size="small" loading>...</Button>
                                    ) : (
                                        <Button 
                                            type="primary" 
                                            size="small" 
                                            icon={<DownloadOutlined />} 
                                            style={{ backgroundColor: '#D4AF37', borderColor: '#D4AF37', color: '#fff' }}
                                            title="Descargar Diploma Oficial"
                                        >
                                            Diploma
                                        </Button>
                                    )
                                }
                            </PDFDownloadLink>
                        );
                    }}
                />
                

                {/* COLUMNA 9: ACCIONES */}
                <Table.Column
                    title="Acciones"
                    render={(_, record: any) => (
                        <Space>
                            <EditButton hideText size="small" recordItemId={record.id} />
                            <Button size="small" type="dashed" onClick={() => {
                                const url = `/tesoreria/create?estudiante_id=${record.estudiante_id}&matricula_id=${record.id}`;
                                window.location.href = url;
                            }}>
                                Registrar Pago
                            </Button>
                            <Button size="small" onClick={() => handleCancelar(record)}>
                                Cancelar Matrícula
                            </Button>
                            <Button danger size="small" onClick={() => handleEliminar(record)}>
                                Eliminar
                            </Button>
                        </Space>
                    )}
                />
            </Table>
            )}
        </List>
        </>
    );
}
