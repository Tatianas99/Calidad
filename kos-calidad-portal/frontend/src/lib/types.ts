export type Persona = { id: number; nombre: string; rol: string }
export type Maquina = { id: number; nombre: string; area?: string | null }
export type Referencia = {
  id: number
  codigo: string
  descripcion?: string | null
  tipo_producto?: string | null
}
export type PuntoMedicion = { id: number; nombre: string }
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
  hora_lectura?: string | null
  cantidad_cumple?: number | null
  cantidad_nocumple?: number | null
  comentario?: string | null
  estado: 'en_proceso' | 'finalizada'
}

export type F006Registro = {
  id: string
  referencia_id: number
  fecha: string
  maquina_id: number
  turno: number
  auxiliar_id?: number | null
  operario_id?: number | null
  empacador_id?: number | null
  creado_en: string
  embalaje: { item: string; resultado: string }[]
  filtraciones: Filtracion[]
}

export type F015Medicion = {
  id: string
  fecha_hora: string
  punto_medicion_id: number
  ph: number
  cloro: number
  responsable_id?: number | null
  ph_en_rango: boolean
  cloro_en_rango: boolean
  comentario?: string | null
}
