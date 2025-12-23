"use client";

import React from "react";
import { List, useTable, EditButton, ShowButton, DeleteButton } from "@refinedev/antd";
import { Table, Space, Avatar, Tag } from "antd";
import { UserOutlined, MailOutlined, PhoneOutlined } from "@ant-design/icons";

export default function ListEstudiantes() {
  const { tableProps } = useTable({
    resource: "perfiles", // TRUCO MAESTRO: Buscamos en la tabla real 'perfiles'
    // FILTRO AUTOMÁTICO: Solo trae estudiantes
    filters: {
      permanent: [
        { field: "rol", operator: "eq", value: "estudiante" }
      ],
    },
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
  });

  return (
    <List title="Listado de Estudiantes">
      <Table {...tableProps} rowKey="id">
        
        {/* FOTO Y NOMBRE */}
        <Table.Column 
            title="Estudiante"
            dataIndex="nombre_completo"
            render={(value) => (
                <Space>
                    <Avatar style={{ backgroundColor: '#1677ff' }} icon={<UserOutlined />} />
                    <b>{value}</b>
                </Space>
            )}
        />

        {/* CÉDULA */}
        <Table.Column 
            dataIndex="identificacion" 
            title="Identificación" 
        />

        {/* CONTACTO */}
        <Table.Column 
            title="Contacto"
            render={(_, record: any) => (
                <div style={{ fontSize: 13 }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <MailOutlined style={{ color: '#888' }} /> {record.email}
                   </div>
                   {record.telefono && (
                       <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                            <PhoneOutlined style={{ color: '#888' }} /> {record.telefono}
                       </div>
                   )}
                </div>
            )}
        />

        {/* ESTADO (Visual) */}
        <Table.Column 
            title="Rol"
            dataIndex="rol"
            render={() => <Tag color="blue">Estudiante</Tag>}
        />

        {/* BOTONES DE ACCIÓN */}
        <Table.Column
          title="Acciones"
          dataIndex="actions"
          render={(_, record: any) => (
            <Space>
              {/* IMPORTANTE: resource="estudiantes" para que vaya a la carpeta correcta */}
              <ShowButton hideText size="small" recordItemId={record.id} resource="estudiantes" />
              <EditButton hideText size="small" recordItemId={record.id} resource="estudiantes" />
              <DeleteButton hideText size="small" recordItemId={record.id} resource="estudiantes" />
            </Space>
          )}
        />
      </Table>
    </List>
  );
}