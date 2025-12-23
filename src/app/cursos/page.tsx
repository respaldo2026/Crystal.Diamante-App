"use client";

import React from "react";
import { List, useTable, EditButton, ShowButton, DeleteButton, useSelect } from "@refinedev/antd";
import { Table, Space, Tag, Typography } from "antd";
import { BookOutlined, UserOutlined } from "@ant-design/icons";

const { Text } = Typography;

export default function ListCursos() {
  const { tableProps } = useTable({
    resource: "cursos",
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
  });

  // Truco para mostrar NOMBRES de profesores en vez de IDs
  const { selectProps: teacherSelect } = useSelect({
    resource: "perfiles",
    optionLabel: "nombre_completo",
    optionValue: "id",
    filters: [{ field: "rol", operator: "eq", value: "profesor" }],
  });

  const getNombreProfesor = (id: string) => {
    const profe = teacherSelect.options?.find((p) => p.value === id);
    return profe ? profe.label : "Sin asignar";
  };

  return (
    <List title="Oferta Académica (Cursos)">
      <Table {...tableProps} rowKey="id">
        <Table.Column 
            title="Curso" 
            dataIndex="nombre" 
            render={(val) => <><BookOutlined style={{color:'#722ed1', marginRight:8}}/> <b>{val}</b></>}
        />
        <Table.Column 
            title="Docente Encargado" 
            dataIndex="profesor_id"
            render={(id) => (
                <Space>
                    <UserOutlined style={{color: '#888'}}/>
                    <Text type="secondary">{getNombreProfesor(id)}</Text>
                </Space>
            )}
        />
        <Table.Column 
            title="Costo" 
            dataIndex="precio" 
            render={(val) => val ? `$ ${Number(val).toLocaleString()}` : "Gratis"}
        />
        <Table.Column 
            title="Estado" 
            dataIndex="estado" 
            render={(val) => {
                let color = val === 'activo' ? 'green' : (val === 'cerrado' ? 'red' : 'orange');
                return <Tag color={color}>{val?.toUpperCase() || 'BORRADOR'}</Tag>
            }}
        />
        <Table.Column
          title="Acciones"
          dataIndex="actions"
          render={(_, record: any) => (
            <Space>
              {/* Apuntamos a las carpetas que ya creaste */}
              <EditButton hideText size="small" recordItemId={record.id} resource="cursos" />
              <DeleteButton hideText size="small" recordItemId={record.id} resource="cursos" />
            </Space>
          )}
        />
      </Table>
    </List>
  );
}
