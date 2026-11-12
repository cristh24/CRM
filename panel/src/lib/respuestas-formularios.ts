// Respuestas de los formularios de registro (Actividades y QR del asesor), para verlas como en un cuestionario.
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
  /** Check "Descuento aplicado": quién lo marcó y cuándo */
  descuento?: { por: string; fecha: string } | null
}
export interface FormularioVista { clave: string; titulo: string; detalle: string; preguntas: PreguntaVista[]; envios: Envio[] }
export interface ResumenFormulario {
  clave: string; nombre: string; tipo: 'actividad' | 'qr'; detalle: string; envios: number; ultimo: string | null; activa: boolean
}

const QR = 'Llenó el formulario del QR de '
const ENLACE = 'Llenó el formulario del enlace de '

/** "Llenó el formulario del QR de Ana Pérez (atención presencial)" → { asesor: 'Ana Pérez', via: 'QR presencial' } */
function leerNota(contenido: string): { asesor: string; via: string } | null {
  const via = contenido.startsWith(QR) ? 'QR presencial' : contenido.startsWith(ENLACE) ? 'Enlace por WhatsApp' : null
  if (!via) return null
  const resto = contenido.slice((via === 'QR presencial' ? QR : ENLACE).length)
  const asesor = resto.split(/ \(|:/)[0]!.trim()
  return asesor ? { asesor, via } : null
}

const LEAD = 'id, nombre, telefono, dni, carrera_interes, grado, colegio, ubigeo, sede, created_at, ultimo_registro_at, asesor:asesores!leads_asesor_id_fkey(nombre)'
interface Lead {
  id: string; nombre: string | null; telefono: string | null; dni: string | null; carrera_interes: string | null; grado: string | null
  colegio: string | null; ubigeo: string | null; sede: string | null; created_at: string; ultimo_registro_at: string | null
  asesor: { nombre: string } | null
}

function datosDelLead(l: Lead): Record<string, string> {
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

/** Lista de formularios con cuántos lo llenaron (el RLS deja ver solo los leads del usuario). */
export async function listarFormularios(): Promise<ResumenFormulario[]> {
  const supabase = await crearClienteServidor()
  const [{ data: actividades }, { data: leads }, { data: respuestas }, { data: notas }, { data: asesores }] = await Promise.all([
    supabase.from('actividades').select('id, nombre, tipo, lugar, fecha, activa').order('id', { ascending: false }),
    supabase.from('leads').select('id, actividad_id, ultimo_registro_at, created_at').not('actividad_id', 'is', null).limit(20000),
    supabase.from('actividad_respuestas').select('actividad_id, lead_id, updated_at').limit(20000),
    supabase.from('lead_interacciones').select('lead_id, contenido, created_at')
      .eq('tipo', 'sistema').like('contenido', 'Llenó el formulario del %').order('created_at', { ascending: false }).limit(20000),
    supabase.from('asesores').select('id, nombre, activo'),
  ])

  // Actividades: los leads registrados con su QR y los que respondieron sus preguntas
  const porActividad = new Map<number, Map<string, string>>()
  const sumar = (id: number, lead: string, fecha: string) => {
    const m = porActividad.get(id) ?? new Map<string, string>()
    if (!m.has(lead) || m.get(lead)! < fecha) m.set(lead, fecha)
    porActividad.set(id, m)
  }
  for (const l of leads ?? []) sumar(l.actividad_id!, l.id, l.ultimo_registro_at ?? l.created_at)
  for (const r of respuestas ?? []) sumar(r.actividad_id, r.lead_id, r.updated_at)

  const lista: ResumenFormulario[] = (actividades ?? []).map((a) => {
    const m = porActividad.get(a.id)
    return {
      clave: `a-${a.id}`,
      nombre: a.nombre,
      tipo: 'actividad',
      detalle: [a.lugar, a.fecha?.split('-').reverse().join('/')].filter(Boolean).join(' · ') || 'Actividad',
      envios: m?.size ?? 0,
      ultimo: m?.size ? [...m.values()].sort().at(-1)! : null,
      activa: a.activa,
    }
  })

  // QR presencial / enlace de cada asesor
  const idPorNombre = new Map((asesores ?? []).map((a) => [a.nombre.trim(), a]))
  const porAsesor = new Map<string, { nombre: string; activo: boolean; leads: Set<string>; ultimo: string }>()
  for (const n of notas ?? []) {
    const nota = leerNota(n.contenido ?? '')
    const asesor = nota && idPorNombre.get(nota.asesor)
    if (!asesor) continue
    const g = porAsesor.get(asesor.id) ?? { nombre: asesor.nombre, activo: asesor.activo, leads: new Set<string>(), ultimo: n.created_at }
    g.leads.add(n.lead_id)
    if (n.created_at > g.ultimo) g.ultimo = n.created_at
    porAsesor.set(asesor.id, g)
  }
  for (const [id, g] of porAsesor) {
    lista.push({ clave: `q-${id}`, nombre: `QR de ${g.nombre}`, tipo: 'qr', detalle: 'Atención presencial y enlace por WhatsApp', envios: g.leads.size, ultimo: g.ultimo, activa: g.activo })
  }
  return lista.sort((x, y) => (y.ultimo ?? '').localeCompare(x.ultimo ?? ''))
}

/** Preguntas y respuestas de un formulario: "a-<id>" (actividad) o "q-<id del asesor>" (su QR). */
export async function cargarFormulario(clave: string): Promise<FormularioVista | null> {
  const supabase = await crearClienteServidor()
  const [f, { data: descuentos }] = await Promise.all([
    leerRespuestas(clave),
    supabase.from('formulario_descuentos')
      .select('lead_id, created_at, marcado:asesores!formulario_descuentos_marcado_por_fkey(nombre)').eq('clave', clave).limit(5000),
  ])
  if (!f) return null
  const porLead = new Map((descuentos ?? []).map((d) => [d.lead_id, { por: d.marcado?.nombre ?? '', fecha: d.created_at }]))
  return { ...f, clave, envios: f.envios.map((e) => ({ ...e, descuento: porLead.get(e.leadId) ?? null })) }
}

async function leerRespuestas(clave: string): Promise<Omit<FormularioVista, 'clave'> | null> {
  const supabase = await crearClienteServidor()

  if (/^a-\d+$/.test(clave)) {
    const id = Number(clave.slice(2))
    const [{ data: act }, { data: respuestas }, { data: leads }] = await Promise.all([
      supabase.from('actividades').select('id, nombre, lugar, fecha, formulario').eq('id', id).maybeSingle(),
      supabase.from('actividad_respuestas').select('lead_id, respuestas, updated_at').eq('actividad_id', id).limit(5000),
      supabase.from('leads').select('id').eq('actividad_id', id).limit(5000),
    ])
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

    // Respuestas a las preguntas propias (y las de preguntas que ya se quitaron del formulario)
    const propias = new Map<string, { valores: Record<string, string>; fecha: string }>()
    for (const r of respuestas ?? []) {
      const valores: Record<string, string> = {}
      for (const x of (r.respuestas ?? []) as unknown as { id: string; pregunta: string; respuesta: string }[]) {
        // Fechas guardadas antes con el calendario ("2009-11-10"): se muestran como día/mes/año
        valores[x.id] = /^\d{4}-\d{2}-\d{2}$/.test(x.respuesta) ? x.respuesta.split('-').reverse().join('/') : x.respuesta
        if (!preguntas.some((q) => q.id === x.id)) preguntas.push({ id: x.id, texto: `${x.pregunta} (ya no está en el formulario)`, resumen: 'lista' })
      }
      propias.set(r.lead_id, { valores, fecha: r.updated_at })
    }
    const ids = [...new Set([...(leads ?? []).map((l) => l.id), ...propias.keys()])]
    const datos = await leadsPorId(ids)
    const envios: Envio[] = ids.flatMap((leadId) => {
      const l = datos.get(leadId)
      if (!l) return []
      return [{
        leadId, nombre: l.nombre ?? '—', telefono: l.telefono ?? '', asesor: l.asesor?.nombre ?? '',
        fecha: propias.get(leadId)?.fecha ?? l.ultimo_registro_at ?? l.created_at,
        valores: { ...datosDelLead(l), ...propias.get(leadId)?.valores },
      }]
    })
    return {
      titulo: act.nombre,
      detalle: [act.lugar, act.fecha?.split('-').reverse().join('/')].filter(Boolean).join(' · '),
      preguntas,
      envios: envios.sort((x, y) => y.fecha.localeCompare(x.fecha)),
    }
  }

  if (/^q-[0-9a-f-]{36}$/i.test(clave)) {
    const { data: asesor } = await supabase.from('asesores').select('id, nombre').eq('id', clave.slice(2)).maybeSingle()
    if (!asesor) return null
    const { data: notas } = await supabase.from('lead_interacciones').select('lead_id, contenido, created_at')
      .eq('tipo', 'sistema').like('contenido', 'Llenó el formulario del %')
      .order('created_at', { ascending: false }).limit(5000)
    // Una fila por alumno: la última vez que llenó el formulario
    const ultima = new Map<string, { fecha: string; via: string }>()
    for (const n of notas ?? []) {
      const nota = leerNota(n.contenido ?? '')
      if (nota?.asesor === asesor.nombre.trim() && !ultima.has(n.lead_id)) ultima.set(n.lead_id, { fecha: n.created_at, via: nota.via })
    }
    const datos = await leadsPorId([...ultima.keys()])
    const envios: Envio[] = [...ultima].flatMap(([leadId, u]) => {
      const l = datos.get(leadId)
      if (!l) return []
      return [{ leadId, nombre: l.nombre ?? '—', telefono: l.telefono ?? '', asesor: l.asesor?.nombre ?? '', fecha: u.fecha, valores: { ...datosDelLead(l), via: u.via } }]
    })
    return {
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
      envios,
    }
  }
  return null
}

/** Datos actuales de los leads (en partes: la URL de la consulta tiene un límite). */
async function leadsPorId(ids: string[]): Promise<Map<string, Lead>> {
  const supabase = await crearClienteServidor()
  const partes: string[][] = []
  for (let i = 0; i < ids.length; i += 150) partes.push(ids.slice(i, i + 150))
  const resultados = await Promise.all(partes.map((p) => supabase.from('leads').select(LEAD).in('id', p).is('eliminado_at', null)))
  return new Map(resultados.flatMap((r) => ((r.data ?? []) as unknown as Lead[]).map((l) => [l.id, l] as const)))
}
