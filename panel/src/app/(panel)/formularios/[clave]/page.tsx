import type { Metadata } from 'next'
import Link from '@/components/Enlace'
import { notFound } from 'next/navigation'
import { obtenerSesion, puedeMarcarDescuento } from '@/lib/sesion'
import { cargarFormulario } from '@/lib/respuestas-formularios'
import { VistaRespuestas } from './VistaRespuestas'

export const metadata: Metadata = { title: 'Respuestas del formulario' }

export default async function RespuestasFormulario(props: PageProps<'/formularios/[clave]'>) {
  const { clave } = await props.params
  // Todos los asesores lo ven (el RLS muestra solo las respuestas de los leads que ve cada uno)
  const sesion = await obtenerSesion()
  const f = await cargarFormulario(clave)
  if (!f) notFound()
  return (
    <div className="space-y-5">
      <div>
        <Link href="/formularios" className="text-sm text-marca-700 hover:underline">← Respuestas de formularios</Link>
        <h1 className="mt-1 text-2xl font-semibold">{f.titulo}</h1>
        {f.detalle && <p className="text-sm text-slate-500">{f.detalle}</p>}
      </div>
      <VistaRespuestas
        clave={f.clave} puedeMarcar={puedeMarcarDescuento(sesion)}
        // Ve las respuestas de todos, pero solo abre los leads que puede ver (los suyos, o todos si ve todo el equipo)
        miId={sesion.esAdmin || sesion.superadmin ? null : sesion.perfil.id}
        titulo={f.titulo} preguntas={f.preguntas} envios={f.envios} />
    </div>
  )
}
