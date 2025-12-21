"use client";

import React from "react";
import { List, useTable, EditButton, DeleteButton } from "@refinedev/antd";
import { Table, Space, Avatar } from "antd";
import { UserOutlined } from "@ant-design/icons";

export default function ListPerfiles() {
  const { tableProps } = useTable({
    resource: "perfiles",
  });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        
        {/* Foto / Icono */}
        <Table.Column 
            title=""
            render={() => <Avatar icon={<UserOutlined />} />}
            width={60}
        />

        <Table.Column dataIndex="id" title="ID" width={50} />
        
        <Table.Column 
            dataIndex="nombre_completo" 
            title="Nombre Completo" 
            render={(value) => <b>{value}</b>}
        />

        <Table.Column 
            dataIndex="email" 
            title="Correo" 
        />

        <Table.Column 
            dataIndex="telefono" 
            title="Teléfono" 
        />

        <Table.Column 
            dataIndex="rol" 
            title="Rol" 
            render={(value) => value === 'admin' ? '👑 Admin' : '🎓 Estudiante'}
        />

        <Table.Column
          title="Acciones"
          dataIndex="actions"
          render={(_, record: any) => (
            <Space>
              <EditButton hideText size="small" recordItemId={record.id} />
              <DeleteButton hideText size="small" recordItemId={record.id} />
            </Space>
          )}
        />
      </Table>
    </List>
  );
}