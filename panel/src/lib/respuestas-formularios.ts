// Respuestas de los formularios de registro (Actividades y QR del asesor), para verlas como en un cuestionario.
// Todos los usuarios del panel ven las respuestas de todos, pero solo de estos formularios: las traen
// formularios_resumen() y formulario_detalle() (base de datos), sin abrir el resto de los leads.
// No hay una copia aparte de cada envío: se arman con los datos actuales del lead, las respuestas a las
// preguntas propias (actividad_respuestas) y la nota "Llenó el formulario del QR de …" de su conversación.
import 'server-only'
import { crearClienteServidor } from '@/lib/supabase/server'
import { leerFormulario, modoDe, type CampoFormulario } from '@/lib/formulario-actividad'
import { rutaUbigeo } from '@/lib/ubigeos'
import { UBIGEOS } from '@/lib/ubigeos-servidor'

/** barras: se cuentan las respuestas (opciones); lista: respuestas escritas, una debajo de otra */
export interface PreguntaVista { id: string; texto: string; resumen: 'barras' | 'lista'; varias?: boolean }
export interface Envio {
  leadId: string; nombre: string; telefono: string; asesor: string; fecha: string; valores: Record<string, string>
  /** Asesor del lead: solo él (o quien ve todo el equipo) puede abrir el lead */
  asesorId: string | null
  /** Check "Descuento aplicado": quién lo marcó y cuándo */
  descuento?: { por: string; fecha: string } | null
}
export interface FormularioVista { clave: string; titulo: string; detalle: string; preguntas: PreguntaVista[]; envios: Envio[] }
export interface ResumenFormulario {
  clave: string; nombre: string; tipo: 'actividad' | 'qr'; detalle: string; envios: number; ultimo: string | null; activa: boolean
}

/** Una fila de formulario_detalle() */
interface Fila {
  lead_id: string; nombre: string | null; telefono: string | null; dni: string | null; carrera_interes: string | null
  grado: string | null; colegio: string | null; ubigeo: string | null; sede: string | null
  asesor_id: string | null; asesor: string | null; fecha: string; via: string | null
  respuestas: { id: string; pregunta: string; respuesta: string }[] | null
  descuento_por: string | null; descuento_at: string | null
}

function datosDelLead(l: Fila): Record<string, string> {
  return {
    nombre: l.nombre ?? '',
    celular: l.telefono ?? '',
    sede: l.sede ?? '',
    dni: l.dni ?? '',
    grado: l.grado ?? '',
    carrera: l.carrera_interes ?? '',
    colegio: l.colegio ?? '',
    procedencia: l.ubigeo && UBIGEOS.has(l.ubigeo) ? rutaUbigeo(l.ubigeo, UBIGEOS) : '',
  }
}

const ETIQUETAS: Record<CampoFormulario, [corta: string, inscripcion: string]> = {
  dni: ['DNI', 'Número de DNI'],
  grado: ['Grado', 'Grado'],
  carrera: ['Carrera que le interesa', 'Carrera profesional'],
  colegio: ['Colegio', 'Nombre del centro de procedencia educativa'],
  procedencia: ['¿De dónde eres?', 'Domicilio'],
}

/** Lista de formularios (todas las actividades y el QR de cada asesor que tenga respuestas). */
export async function listarFormularios(): Promise<ResumenFormulario[]> {
  const supabase = await crearClienteServidor()
  const [{ data: actividades }, { data: resumen }, { data: asesores }] = await Promise.all([
    supabase.from('actividades').select('id, nombre, lugar, fecha, activa').order('id', { ascending: false }),
    supabase.rpc('formularios_resumen'),
    supabase.from('asesores').select('id, nombre, activo'),
  ])
  const porClave = new Map(((resumen ?? []) as { clave: string; envios: number; ultimo: string }[]).map((r) => [r.clave, r]))

  const lista: ResumenFormulario[] = (actividades ?? []).map((a) => ({
    clave: `a-${a.id}`,
    nombre: a.nombre,
    tipo: 'actividad',
    detalle: [a.lugar, a.fecha?.split('-').reverse().join('/')].filter(Boolean).join(' · ') || 'Actividad',
    envios: porClave.get(`a-${a.id}`)?.envios ?? 0,
    ultimo: porClave.get(`a-${a.id}`)?.ultimo ?? null,
    activa: a.activa,
  }))
  for (const a of asesores ?? []) {
    const r = porClave.get(`q-${a.id}`)
    if (r) lista.push({ clave: `q-${a.id}`, nombre: `QR de ${a.nombre}`, tipo: 'qr', detalle: 'Atención presencial y enlace por WhatsApp', envios: r.envios, ultimo: r.ultimo, activa: a.activo })
  }
  return lista.sort((x, y) => (y.ultimo ?? '').localeCompare(x.ultimo ?? ''))
}

/** Preguntas y respuestas de un formulario: "a-<id>" (actividad) o "q-<id del asesor>" (su QR). */
export async function cargarFormulario(clave: string): Promise<FormularioVista | null> {
  if (!/^(a-\d+|q-[0-9a-f-]{36})$/i.test(clave)) return null
  const supabase = await crearClienteServidor()
  const { data } = await supabase.rpc('formulario_detalle', { p_clave: clave })
  const filas = (data ?? []) as unknown as Fila[]
  const envio = (f: Fila, valores: Record<string, string>): Envio => ({
    leadId: f.lead_id, nombre: f.nombre ?? '—', telefono: f.telefono ?? '', asesor: f.asesor ?? '', asesorId: f.asesor_id,
    fecha: f.fecha, valores,
    descuento: f.descuento_at ? { por: f.descuento_por ?? '', fecha: f.descuento_at } : null,
  })

  if (clave.startsWith('a-')) {
    const { data: act } = await supabase.from('actividades').select('id, nombre, lugar, fecha, formulario').eq('id', Number(clave.slice(2))).maybeSingle()
    if (!act) return null
    const f = leerFormulario(act.formulario)
    const ins = f.tipo === 'inscripcion'

    // Mismo orden que el formulario que llena el alumno (app/r/[codigo]/Formulario.tsx)
    const pide = (c: CampoFormulario) => modoDe(f, c) !== 'oculto'
    const propia = (p: (typeof f.preguntas)[number]): PreguntaVista => ({
      id: p.id, texto: p.texto,
      resumen: ['opcion', 'varias', 'si_no', 'lugar'].includes(p.tipo) ? 'barras' : 'lista',
      varias: p.tipo === 'varias',
    })
    const base = (c: CampoFormulario): PreguntaVista => ({ id: c, texto: ETIQUETAS[c][ins ? 1 : 0], resumen: c === 'dni' ? 'lista' : 'barras' })
    const antes = (c: CampoFormulario) => (pide(c) ? f.preguntas.filter((p) => p.antes === c && !p.junto).map(propia) : [])
    const junto = (c: CampoFormulario) => (pide(c) ? f.preguntas.filter((p) => p.junto === c).map(propia) : [])
    const bloque: Record<'carrera' | 'dni' | 'colegio' | 'procedencia', PreguntaVista[]> = {
      carrera: pide('carrera') ? [...antes('carrera'), base('carrera'), ...junto('carrera')] : [],
      dni: [...antes('dni'), ...antes('grado'), ...(pide('dni') ? [base('dni')] : []), ...(pide('grado') ? [base('grado')] : []), ...junto('dni'), ...junto('grado')],
      colegio: pide('colegio') ? [...antes('colegio'), base('colegio'), ...junto('colegio')] : [],
      procedencia: pide('procedencia') ? [...antes('procedencia'), base('procedencia'), ...junto('procedencia')] : [],
    }
    const orden = ins ? (['dni', 'procedencia', 'carrera', 'colegio'] as const) : (['carrera', 'dni', 'colegio', 'procedencia'] as const)
    const preguntas: PreguntaVista[] = [
      ...(ins ? [{ id: 'sede', texto: '¿A qué sede deseas postular?', resumen: 'barras' as const }] : []),
      { id: 'nombre', texto: 'Nombres y apellidos', resumen: 'lista' },
      { id: 'celular', texto: ins ? 'Número actual del postulante (WhatsApp)' : 'Celular (WhatsApp)', resumen: 'lista' },
      ...orden.flatMap((c) => bloque[c]),
    ]
    for (const p of f.preguntas) if (!preguntas.some((q) => q.id === p.id)) preguntas.push(propia(p))

    const envios = filas.map((fila) => {
      // Respuestas a las preguntas propias (y las de preguntas que ya se quitaron del formulario)
      const valores = datosDelLead(fila)
      for (const x of fila.respuestas ?? []) {
        // Fechas guardadas antes con el calendario ("2009-11-10"): se muestran como día/mes/año
        valores[x.id] = /^\d{4}-\d{2}-\d{2}$/.test(x.respuesta) ? x.respuesta.split('-').reverse().join('/') : x.respuesta
        if (!preguntas.some((q) => q.id === x.id)) preguntas.push({ id: x.id, texto: `${x.pregunta} (ya no está en el formulario)`, resumen: 'lista' })
      }
      return envio(fila, valores)
    })
    return {
      clave,
      titulo: act.nombre,
      detalle: [act.lugar, act.fecha?.split('-').reverse().join('/')].filter(Boolean).join(' · '),
      preguntas,
      envios,
    }
  }

  const { data: asesor } = await supabase.from('asesores').select('id, nombre').eq('id', clave.slice(2)).maybeSingle()
  if (!asesor) return null
  return {
    clave,
    titulo: `QR de ${asesor.nombre}`,
    detalle: 'Formulario de atención presencial (y su enlace por WhatsApp)',
    preguntas: [
      { id: 'via', texto: '¿Por dónde llenó el formulario?', resumen: 'barras' },
      { id: 'nombre', texto: 'Nombres y apellidos', resumen: 'lista' },
      { id: 'celular', texto: 'Celular (WhatsApp)', resumen: 'lista' },
      { id: 'carrera', texto: 'Carrera que le interesa', resumen: 'barras' },
      { id: 'dni', texto: 'DNI', resumen: 'lista' },
      { id: 'grado', texto: 'Grado', resumen: 'barras' },
      { id: 'colegio', texto: 'Colegio', resumen: 'barras' },
      { id: 'procedencia', texto: '¿De dónde eres?', resumen: 'barras' },
    ],
    envios: filas.map((fila) => envio(fila, { ...datosDelLead(fila), via: fila.via ?? '' })),
  }
}
