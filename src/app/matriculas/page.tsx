"use client";

import React from "react";
import { 
    List, 
    useTable, 
    EditButton, 
    ShowButton, 
    DeleteButton, 
    CreateButton
} from "@refinedev/antd";
import { Table, Space, Tag, Avatar, Typography, Alert } from "antd";
import { 
    UserOutlined, 
    BookOutlined, 
    CalendarOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    StopOutlined,
    DollarCircleOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";

const { Text } = Typography;

export default function MatriculasList() {
    const { tableProps, tableQueryResult } = useTable({
        resource: "matriculas",
        // CORRECCIÓN: Ahora usamos 'precio' (el nombre real en tu base de datos)
        meta: {
            select: "*, perfiles(nombre_completo, email), cursos(nombre, precio)"
        },
        sorters: { initial: [{ field: "created_at", order: "desc" }] },
    });

    // Detectar errores de carga
    const isError = tableQueryResult?.isError;
    const errorMessage = tableQueryResult?.error?.message;

    return (
        <List
            title="Gestión de Matrículas"
            headerButtons={<CreateButton />}
        >
            {isError && (
                <Alert 
                    type="error" 
                    message="Error cargando datos" 
                    description={errorMessage} 
                    showIcon 
                    style={{ marginBottom: 20 }}
                />
            )}

            <Table {...tableProps} rowKey="id">
                
                {/* 1. ESTUDIANTE */}
                <Table.Column 
                    title="Estudiante"
                    render={(_, record: any) => {
                        const nombre = record.perfiles?.nombre_completo || "Desconocido";
                        const email = record.perfiles?.email;
                        return (
                            <Space>
                                <Avatar style={{ backgroundColor: '#722ed1' }} icon={<UserOutlined />} />
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <Text strong>{nombre}</Text>
                                    <Text type="secondary" style={{ fontSize: 12 }}>{email}</Text>
                                </div>
                            </Space>
                        );
                    }}
                />

                {/* 2. CURSO Y PRECIO */}
                <Table.Column 
                    title="Curso Inscrito"
                    render={(_, record: any) => {
                        const nombreCurso = record.cursos?.nombre || "Curso eliminado";
                        const precio = record.cursos?.precio;

                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                                <Tag icon={<BookOutlined />} color="purple">
                                    {nombreCurso}
                                </Tag>
                                {/* Mostramos el precio pequeño debajo del nombre */}
                                {precio && (
                                    <span style={{ fontSize: '11px', color: '#888', marginLeft: 5 }}>
                                        <DollarCircleOutlined style={{ marginRight: 2 }} />
                                        ${Number(precio).toLocaleString()}
                                    </span>
                                )}
                            </div>
                        );
                    }}
                />

                {/* 3. FECHA INICIO */}
                <Table.Column 
                    dataIndex="fecha_inicio" 
                    title="Inicio"
                    render={(value) => (
                        <Space>
                            <CalendarOutlined style={{ color: '#999' }} />
                            <span>{value ? dayjs(value).format("DD MMM YYYY") : "-"}</span>
                        </Space>
                    )}
                />

                {/* 4. ESTADO */}
                <Table.Column 
                    dataIndex="estado" 
                    title="Estado"
                    render={(value) => {
                        let color = "default";
                        let icon = null;

                        switch (value) {
                            case "activa": 
                                color = "success"; 
                                icon = <CheckCircleOutlined />;
                                break;
                            case "pendiente": 
                                color = "warning"; 
                                icon = <ClockCircleOutlined />;
                                break;
                            case "congelada": 
                            case "retirado":
                                color = "error"; 
                                icon = <StopOutlined />;
                                break;
                            case "finalizada":
                                color = "blue";
                                icon = <CheckCircleOutlined />;
                                break;
                        }

                        return (
                            <Tag color={color} icon={icon}>
                                {(value || "INDEFINIDO").toUpperCase()}
                            </Tag>
                        );
                    }}
                />

                {/* 5. ACCIONES */}
                <Table.Column 
                    title="Acciones"
                    fixed="right"
                    render={(_, record: any) => (
                        <Space>
                            <EditButton hideText size="small" recordItemId={record.id} />
                            <ShowButton hideText size="small" recordItemId={record.id} />
                            <DeleteButton hideText size="small" recordItemId={record.id} />
                        </Space>
                    )}
                />
            </Table>
        </List>
    );
}