import React from "react";
import { 
  Drawer, Button, Tabs, Card, Row, Col, DatePicker, Space, InputNumber, Select, List, Tooltip, Avatar, Switch, Tag, Alert, Collapse, Typography, Divider, Empty
} from "antd";
import { 
  WhatsAppOutlined, GiftOutlined, BookOutlined, StarOutlined, FileTextOutlined, VideoCameraOutlined, FilePdfOutlined, DownloadOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { enviarWhatsapp } from "@utils/whatsapp";

const { Text } = Typography;
const { Panel } = Collapse;

interface ClassDrawerProps {
  visible: boolean;
  onClose: () => void;
  cursoActivo: any;
  fechaAsistencia: dayjs.Dayjs;
  onFechaChange: (fecha: dayjs.Dayjs) => void;
  horasCalculadas: number;
  onHorasChange: (val: number) => void;
  horaInicioclase: dayjs.Dayjs | null;
  temaSeleccionado: string | null;
  onTemaChange: (val: string) => void;
  opcionesTemas: any[];
  alumnosClase: any[];
  asistenciaMap: Record<string, boolean>;
  onAsistenciaChange: (id: string, val: boolean) => void;
  entregasMap: Record<string, any[]>;
  onRegistrarEntrega: (alumno: any) => void;
  onConfirmarGuardado: () => void;
  guardandoAsistencia: boolean;
  onAbrirCalificar: (alumno: any) => void;
  pensum: any[];
  materiales: any[];
  profesorNombre: string;
}

export const ClassDrawer: React.FC<ClassDrawerProps> = React.memo((props) => {
  const {
    visible, onClose, cursoActivo, fechaAsistencia, onFechaChange, horasCalculadas, onHorasChange,
    horaInicioclase, temaSeleccionado, onTemaChange, opcionesTemas, alumnosClase, asistenciaMap,
    onAsistenciaChange, entregasMap, onRegistrarEntrega, onConfirmarGuardado, guardandoAsistencia,
    onAbrirCalificar, pensum, materiales, profesorNombre
  } = props;

  return (
    <Drawer
      title={`Clase: ${cursoActivo?.nombre}`}
      width={600}
      onClose={onClose}
      open={visible}
      maskClosable={false}
      extra={<Button type="primary" onClick={onConfirmarGuardado} loading={guardandoAsistencia}>Guardar Asistencia</Button>}
    >
      <Tabs defaultActiveKey="1" items={[
          {
              key: '1', label: '📝 Tomar Lista',
              children: (
                  <>
                      <Card variant="borderless" style={{background: '#f0f2f5', marginBottom: 20}}>
                          <Row gutter={16}>
                              <Col span={12}>
                                  <label>Fecha Clase:</label>
                                  <DatePicker style={{width:'100%'}} value={fechaAsistencia} onChange={val => onFechaChange(val || dayjs())} allowClear={false}/>
                              </Col>
                              <Col span={12}>
                                  <label>Horas Dictadas:</label>
                                  <Space.Compact style={{ width: '100%' }}>
                                      <InputNumber min={1} max={8} value={horasCalculadas} onChange={(val) => onHorasChange(val || 0)} style={{ width: '85%' }} />
                                      <Button disabled style={{ width: '15%' }}>Hrs</Button>
                                  </Space.Compact>
                                  <p style={{fontSize: '12px', color: '#999', marginTop: 5}}>
                                      {horaInicioclase && `Inicio: ${horaInicioclase.format('h:mm A')}`}
                                  </p>
                              </Col>
                          </Row>
                          <Row style={{marginTop: 10}}>
                              <Col span={24}>
                                  <label>Tema de hoy:</label>
                                  <Select style={{width:'100%'}} placeholder="Selecciona tema..." value={temaSeleccionado} onChange={onTemaChange} options={opcionesTemas} />
                              </Col>
                          </Row>
                      </Card>
                      <List
                          itemLayout="horizontal"
                          dataSource={alumnosClase}
                          renderItem={(alumno: any) => {
                            const pagado = alumno.pagado;
                            const entregasEst = entregasMap[alumno.estudiante_id] || [];
                            const tieneCamiseta = entregasEst.some(e => e.tipo_material === 'camiseta');
                            const kits = entregasEst.filter(e => e.tipo_material === 'kit').length;
                            return (
                              <List.Item key={alumno?.id} actions={[
                                <Tooltip key="wa" title={alumno.perfiles.telefono ? "WhatsApp" : "Sin tel"}>
                                  <Button type="text" shape="round" icon={<WhatsAppOutlined />} onClick={() => enviarWhatsapp(alumno.perfiles.telefono, `Hola ${alumno.perfiles.nombre_completo}, te contacto de parte de ${profesorNombre}`)} disabled={!alumno.perfiles.telefono} style={{ color: '#25D366' }} />
                                </Tooltip>,
                                <Tooltip key="gift" title="Entregar material">
                                  <Button type="default" shape="circle" icon={<GiftOutlined />} onClick={() => onRegistrarEntrega(alumno)} style={{ color: '#722ed1', borderColor: '#722ed1' }} />
                                </Tooltip>,
                                <Tooltip key="asis" title={!pagado ? "Sin pagos al día" : ""}>
                                  <Switch checkedChildren="Vino" unCheckedChildren="Faltó" checked={asistenciaMap[alumno.id]} onChange={(val) => onAsistenciaChange(alumno.id, val)} disabled={!pagado} style={{ backgroundColor: asistenciaMap[alumno.id] ? '#52c41a' : '#ff4d4f' }} />
                                </Tooltip>
                              ]}>
                                <List.Item.Meta
                                  avatar={<Avatar>{alumno.perfiles.nombre_completo[0]}</Avatar>}
                                  title={alumno.perfiles.nombre_completo}
                                  description={
                                    <Space>
                                      {asistenciaMap[alumno.id] ? <Tag color="green">Presente</Tag> : <Tag color="red">Ausente</Tag>}
                                      {pagado ? <Tag color="success">Pagado</Tag> : <Tag color="error">Sin Pagar</Tag>}
                                      {tieneCamiseta && <Tooltip title="Camiseta entregada">👕</Tooltip>}
                                      {kits > 0 && <Tooltip title={`${kits} Kits entregados`}>📦 {kits}</Tooltip>}
                                    </Space>
                                  }
                                />
                              </List.Item>
                            );
                          }}
                      />
                  </>
              )
          },
          {
              key: '2', label: '⭐ Calificar',
              children: (
                  <div>
                      <Alert message="Selecciona un estudiante para asignar una nota." type="info" style={{marginBottom: 15}} />
                      <List
                          itemLayout="horizontal"
                          dataSource={alumnosClase}
                          renderItem={(alumno: any) => (
                            <List.Item key={alumno?.id} actions={[
                              <Button type="dashed" shape="round" icon={<StarOutlined />} onClick={() => onAbrirCalificar(alumno)} disabled={!alumno.pagado}>Calificar</Button>
                            ]}>
                              <List.Item.Meta
                                avatar={<Avatar style={{backgroundColor: '#faad14'}}>{alumno.perfiles.nombre_completo[0]}</Avatar>}
                                title={alumno.perfiles.nombre_completo}
                                description={<Space><span>Gestionar notas</span>{alumno.pagado ? <Tag color="success">Pagado</Tag> : <Tag color="error">Sin Pagar</Tag>}</Space>}
                              />
                            </List.Item>
                          )}
                      />
                  </div>
              )
          },
          {
              key: '3', label: '📚 Ver Pensum',
              children: (
                  <div style={{maxHeight: '500px', overflowY: 'auto'}}>
                      <Alert message="Plan de estudios oficial del programa." type="info" showIcon style={{marginBottom: 16}} />
                      {pensum.length === 0 ? <Empty description="No hay pensum asignado" /> : (
                          <Collapse defaultActiveKey={pensum[0]?.id}>
                              {pensum.map(ciclo => (
                                  <Panel header={`${ciclo.nombre_ciclo} (${ciclo.duracion_semanas || 0} semanas)`} key={ciclo.id}>
                                      <Text type="secondary">{ciclo.descripcion}</Text>
                                      <Divider style={{ margin: '10px 0' }} />
                                      <List
                                          size="small"
                                          dataSource={ciclo.pensum_cursos || []}
                                          renderItem={(curso: any) => (
                                              <List.Item>
                                                  <List.Item.Meta avatar={<BookOutlined />} title={curso.nombre_curso} description={`${curso.horas} horas • ${curso.tipo_curso}`} />
                                              </List.Item>
                                          )}
                                      />
                                  </Panel>
                              ))}
                          </Collapse>
                      )}
                  </div>
              )
          },
          {
              key: '4', label: '📄 Material Didáctico',
              children: (
                  <div style={{maxHeight: '500px', overflowY: 'auto'}}>
                      <Alert message="Recursos descargables del programa." type="info" style={{marginBottom: 20}} showIcon />
                      {materiales.length === 0 ? <Empty description="No hay material disponible" /> : (
                          <div>
                              {pensum.map(ciclo => {
                                  const matsCiclo = materiales.filter(m => m.pensum_id === ciclo.id);
                                  if (matsCiclo.length === 0) return null;
                                  return (
                                      <div key={ciclo.id} style={{marginBottom: 24}}>
                                          <Divider orientation="left" style={{borderColor: '#d9d9d9'}}>{ciclo.nombre_ciclo}</Divider>
                                          <List
                                              grid={{ gutter: 16, xs: 1, sm: 2 }}
                                              dataSource={matsCiclo}
                                              renderItem={(item: any) => {
                                                  let Icon = FileTextOutlined;
                                                  if (item.tipo_material === 'video') Icon = VideoCameraOutlined;
                                                  if (item.tipo_material === 'documento') Icon = FilePdfOutlined;
                                                  return (
                                                      <List.Item>
                                                          <Card size="small" title={<><Icon /> {item.tipo_material?.toUpperCase()}</>} extra={<a href={item.url_archivo} target="_blank" rel="noreferrer"><DownloadOutlined /></a>}>
                                                              <Text strong>{item.titulo}</Text><br />
                                                              <Text type="secondary" style={{ fontSize: 12 }}>{item.descripcion}</Text>
                                                          </Card>
                                                      </List.Item>
                                                  );
                                              }}
                                          />
                                      </div>
                                  );
                              })}
                              {materiales.filter(m => !m.pensum_id).length > 0 && (
                                  <div style={{marginBottom: 24}}>
                                      <Divider orientation="left">General</Divider>
                                      <List
                                          grid={{ gutter: 16, xs: 1, sm: 2 }}
                                          dataSource={materiales.filter(m => !m.pensum_id)}
                                          renderItem={(item: any) => {
                                              let Icon = FileTextOutlined;
                                              if (item.tipo_material === 'video') Icon = VideoCameraOutlined;
                                              if (item.tipo_material === 'documento') Icon = FilePdfOutlined;
                                              return (
                                                  <List.Item>
                                                      <Card size="small" title={<><Icon /> {item.tipo_material?.toUpperCase()}</>} extra={<a href={item.url_archivo} target="_blank" rel="noreferrer"><DownloadOutlined /></a>}>
                                                          <Text strong>{item.titulo}</Text><br />
                                                          <Text type="secondary" style={{ fontSize: 12 }}>{item.descripcion}</Text>
                                                      </Card>
                                                  </List.Item>
                                              );
                                          }}
                                      />
                                  </div>
                              )}
                          </div>
                      )}
                  </div>
              )
          }
      ]} />
    </Drawer>
  );
});