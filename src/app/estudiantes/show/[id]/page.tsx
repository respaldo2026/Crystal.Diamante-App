"use client";

import React, { useEffect, useState } from "react";
import { Show } from "@refinedev/antd";
import { 
  Typography, Tag, Tabs, Row, Col, Card, Statistic, Table, 
  Button, Alert, Spin, Empty, Divider
} from "antd";
import { 
  UserOutlined, ReadOutlined, IdcardOutlined, MailOutlined, PhoneOutlined, SafetyCertificateOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useParams } from "next/navigation"; 

// 1. CONEXIÓN DIRECTA A SUPABASE (La técnica infalible)
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ShowEstudiante() {
  const params = useParams();
  const idEstudiante = params?.id as string;

  // ESTADOS
  const [estudiante, setEstudiante] = useState<any>(null);
  // Preparamos el terreno para las matrículas (aunque esté vacío por ahora)
  const [matriculas, setMatriculas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // 2. FUNCIÓN DE CARGA
  const cargarDatos = async () => {
    try {
        setLoading(true);
        setErrorMsg("");

        if (!idEstudiante) throw new Error("ID inválido");

        // A) Traer Estudiante de la tabla 'perfiles'
        const { data: dataEst, error: errEst } = await supabase
            .from("perfiles")
            .select("*")
            .eq("id", idEstudiante)
            .maybeSingle(); 

        if (errEst) throw errEst;
        if (!dataEst) throw new Error("Estudiante no encontrado.");
        
        setEstudiante(dataEst);

        // B) Intentar traer Matrículas (Si la tabla existe)
        // Esto no romperá la app si la tabla matriculas no tiene datos aún
        const { data: dataMatr } = await supabase
            .from("matriculas")
            .select(`
                *,
                cursos ( nombre )
            `)
            .eq("estudiante_id", idEstudiante);
        
        if (dataMatr) setMatriculas(dataMatr);

    } catch (error: any) {
        console.error("Error cargando estudiante:", error);
        setErrorMsg(error.message);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, [idEstudiante]);

  // --- PANTALLAS DE CARGA Y ERROR ---
  if (loading) return <div style={{ padding: 50, textAlign: 'center' }}><Spin size="large" /><h3>Cargando expediente...</h3></div>;
  
  if (errorMsg || !estudiante) {
      return (
        <div style={{ padding: 20 }}>
            <Alert 
                message="No se pudo cargar el estudiante" 
                description={errorMsg || "Verifica que el ID sea correcto."} 
                type="error" 
                showIcon 
            />
            <br />
            <Button href="/estudiantes">Volver a la Lista</Button>
        </div>
      );
  }

  // --- VISTA PRINCIPAL ---
  return (
    <Show 
        title={`Alumno: ${estudiante.nombre_completo}`}
        headerButtons={({ defaultButtons }) => (
            <>
              <Button href="/estudiantes" style={{ marginRight: 5 }}>Lista</Button>
              {/* Botón futuro para matricular */}
              {/* <Button type="primary">Nueva Matrícula</Button> */}
            </>
        )}
    >
      {/* TARJETAS DE RESUMEN */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={8}>
             <Card variant="borderless">
                <Statistic 
                    title="Estado Académico" 
                    value={"ACTIVO"} 
                    prefix={<SafetyCertificateOutlined />} 
                    valueStyle={{ color: '#52c41a' }}
                />
             </Card>
          </Col>
          <Col span={8}>
             <Card variant="borderless">
                <Statistic 
                    title="Cursos Inscritos" 
                    value={matriculas.length} 
                    prefix={<ReadOutlined />} 
                />
             </Card>
          </Col>
      </Row>

      <Tabs defaultActiveKey="1" items={[
          {
            key: '1', label: 'Datos del Alumno',
            children: (
                <Card variant="borderless">
                    <Row gutter={24}>
                        <Col span={12}>
                            <p><IdcardOutlined /> <b> Documento:</b><br/> {estudiante.identificacion}</p>
                            <p><PhoneOutlined /> <b> Teléfono:</b><br/> {estudiante.telefono || "No registrado"}</p>
                        </Col>
                        <Col span={12}>
                            <p><MailOutlined /> <b> Email:</b><br/> {estudiante.email || "No registrado"}</p>
                            <p><UserOutlined /> <b> Rol:</b><br/> <Tag color="blue">{estudiante.rol?.toUpperCase()}</Tag></p>
                        </Col>
                    </Row>
                    <Divider />
                    <small style={{ color: '#999' }}>ID Interno: {estudiante.id}</small>
                </Card>
            )
          },
          {
            key: '2', label: 'Historial de Cursos',
            children: matriculas.length > 0 ? (
                <Table dataSource={matriculas} rowKey="id" pagination={false}>
                    <Table.Column 
                        title="Curso" 
                        dataIndex={['cursos', 'nombre']} 
                        render={(val, record: any) => val || "Curso #" + record.curso_id.slice(0,4)} 
                    />
                    <Table.Column 
                        title="Fecha Inicio" 
                        dataIndex="created_at" 
                        render={(v)=> v ? dayjs(v).format("DD/MM/YYYY") : "-"}
                    />
                    <Table.Column 
                        title="Estado" 
                        dataIndex="estado" 
                        render={(v) => <Tag color={v === 'activo' ? 'green' : 'default'}>{v?.toUpperCase() || 'INSCRITO'}</Tag>} 
                    />
                </Table>
            ) : (
                <Empty 
                    image={Empty.PRESENTED_IMAGE_SIMPLE} 
                    description="El estudiante no tiene matrículas activas." 
                />
            )
          }
      ]} />
    </Show>
  );
}