export type Persona = { id: number; nombre: string; rol: string }
export type Maquina = { id: number; nombre: string; area?: string | null }
export type Referencia = {
  id: number
  codigo: string
  descripcion?: string | null
  tipo_producto?: string | null
}
export type PuntoMedicion = { id: number; nombre: string }
export type ProveedorPapel = { id: number; nombre: string; activo: boolean }
export type Option = { value: string; label: string }

export type Opciones = {
  embalaje_f006: Option[]
  tipos_prueba_f006: Option[]
  tipos_material_f006: Option[]
  resultados: string[]
  turnos: number[]
}

export type Filtracion = {
  id: string
  hora_montaje: string
  tipo_prueba: string
  tipo_material: string
  cantidad_muestra: number
  temp_90?: string | null
  hora_lectura?: string | null
  cantidad_cumple?: number | null
  cantidad_nocumple?: number | null
  goteo_vaso_tapa?: string | null
  tapa_centrada?: string | null
  comentario?: string | null
  estado: 'en_proceso' | 'finalizada'
}

export type F006Registro = {
  id: string
  orden_produccion?: string | null
  referencia_id?: number | null
  referencia_texto?: string | null
  marca?: string | null
  altura_vaso?: string | null
  diametro_superior?: string | null
  diametro_inferior?: string | null
  grueso_rim?: string | null
  fecha: string
  maquina_id?: number | null
  maquina_texto?: string | null
  turno: number
  auxiliar_id?: number | null
  auxiliar_nombre?: string | null
  operario_id?: number | null
  operario_nombre?: string | null
  empacador_id?: number | null
  empacador_nombre?: string | null
  creado_en: string
  embalaje: { item: string; resultado: string }[]
  filtraciones: Filtracion[]
}

export type F015Medicion = {
  id: string
  fecha_hora: string
  punto_medicion_id?: number | null
  punto_texto?: string | null
  ph: number
  cloro: number
  responsable_id?: number | null
  responsable_nombre?: string | null
  ph_en_rango: boolean
  cloro_en_rango: boolean
  comentario?: string | null
}

// ---- F-158 Rutas Calidad ---- //
export type F158Tipo = 'texto' | 'cncna' | 'opciones' | 'referencia'
export type F158Campo = {
  key: string
  label: string
  tipo: F158Tipo
  opciones?: string[]
  otro?: boolean
}
export type F158Proceso = {
  key: string
  label: string
  maquinas: string[]
  campos: F158Campo[]
  nota?: string
}
export type F158Config = {
  procesos: F158Proceso[]
  materiales: string[]
  calibres: string[]
  resultados: string[]
}
export type F158Item = {
  campo_key: string
  campo_label: string
  tipo: string
  valor?: string | null
  ref_id?: number | null
  marca?: string | null
}
export type F204Registro = {
  id: string
  fecha: string
  fecha_hora: string
  turno: number
  orden_produccion?: string | null
  maquina_id?: number | null
  maquina_texto?: string | null
  referencia_id?: number | null
  referencia_texto?: string | null
  marca?: string | null
  cantidad_clase_b?: number | null
  verificacion_desperdicio?: string | null
  entregado_por_id?: number | null
  entregado_por_nombre?: string | null
  recibido_por_id?: number | null
  recibido_por_nombre?: string | null
  observaciones?: string | null
  creado_en: string
}

export type F005Registro = {
  id: string
  fecha: string
  fecha_hora: string
  proceso?: string | null
  maquina?: string | null
  lote: string
  material?: string | null
  ancho?: string | null
  calibre?: string | null
  kg?: string | null
  estado_dinas?: string | null
  estado_alcohol?: string | null
  estado_lapiz?: string | null
  estado_armado?: string | null
  estado_inocuidad?: string | null
  proveedor?: string | null
  observaciones?: string | null
  responsable_id?: number | null
  responsable_nombre?: string | null
  creado_en: string
}

export type F158Adjunto = { id: number; nombre: string; tipo: string; url: string }
export type F158Recorrido = {
  id: string
  proceso: string
  maquina?: string | null
  responsable_id?: number | null
  responsable_nombre?: string | null
  fecha: string
  fecha_hora: string
  observaciones?: string | null
  creado_en: string
  actualizado_en?: string | null
  items: F158Item[]
  adjuntos: F158Adjunto[]
}
