"use client";

import { List, ShowButton, EditButton, DeleteButton, useTable } from "@refinedev/antd";
import { Table, Tag, Space } from "antd";

export default function PerfilesList() {
  // Esta tabla es sencilla, solo trae los usuarios
  const { tableProps } = useTable({
    syncWithLocation: true,
  });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        
        {/* Columna 1: Nombre */}
        <Table.Column 
            dataIndex="nombre_completo" 
            title="Nombre Completo" 
            sorter
        />
        
        {/* Columna 2: Correo */}
        <Table.Column 
            dataIndex="email" 
            title="Correo Electrónico" 
        />

        {/* Columna 3: Rol (Estudiante/Admin) */}
        <Table.Column
          dataIndex="rol"
          title="Rol"
          render={(value) => (
            <Tag color={value === "admin" ? "red" : "green"}>
              {value ? value.toUpperCase() : "SIN ROL"}
            </Tag>
          )}
        />

        {/* Columna 4: Botones */}
        <Table.Column
          title="Acciones"
          dataIndex="actions"
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