"use client";

import { DateField, List, ShowButton, useTable } from "@refinedev/antd";
import { Table, Tag } from "antd";

export default function MatriculasList() {
  const { tableProps } = useTable({
    syncWithLocation: true,
    meta: {
      select: "*, perfiles(nombre_completo), cursos(nombre)",
    },
  });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        {/* ID Numérico (Sin slice para evitar errores) */}
        <Table.Column dataIndex="id" title="ID" width={50} />
        
        {/* Nombre del Estudiante */}
        <Table.Column
          title="Estudiante"
          render={(record: any) => (
              <span style={{ fontWeight: "bold" }}>
                  {record?.perfiles?.nombre_completo || "Sin Nombre"}
              </span>
          )}
        />

        {/* Nombre del Curso */}
        <Table.Column
          title="Curso"
          render={(record: any) => (
             <Tag color="blue">
                 {record?.cursos?.nombre || "Curso Eliminado"}
             </Tag>
          )}
        />

        {/* Monto */}
        <Table.Column
             dataIndex="monto_pagado"
             title="Pagado"
             render={(value) => `$ ${value}`}
        />

        {/* Fecha */}
        <Table.Column
            dataIndex="fecha_inicio"
            title="Fecha"
            render={(value) => <DateField value={value} format="DD/MM/YYYY" />}
        />

        {/* Botón Ver */}
        <Table.Column
          title="Acciones"
          dataIndex="actions"
          render={(_, record: any) => (
             <ShowButton hideText size="small" recordItemId={record.id} />
          )}
        />
      </Table>
    </List>
  );
}