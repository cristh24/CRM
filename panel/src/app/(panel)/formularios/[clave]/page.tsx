import type { Metadata } from 'next'
import Link from '@/components/Enlace'
import { notFound } from 'next/navigation'
import { exigirPermiso } from '@/lib/sesion'
import { cargarFormulario } from '@/lib/respuestas-formularios'
import { VistaRespuestas } from './VistaRespuestas'

export const metadata: Metadata = { title: 'Respuestas del formulario' }

export default async function RespuestasFormulario(props: PageProps<'/formularios/[clave]'>) {
  const { clave } = await props.params
  await exigirPermiso('actividades')
  const f = await cargarFormulario(clave)
  if (!f) notFound()
  return (
    <div className="space-y-5">
      <div>
        <Link href="/formularios" className="text-sm text-marca-700 hover:underline">← Respuestas de formularios</Link>
        <h1 className="mt-1 text-2xl font-semibold">{f.titulo}</h1>
        {f.detalle && <p className="text-sm text-slate-500">{f.detalle}</p>}
      </div>
      <VistaRespuestas titulo={f.titulo} preguntas={f.preguntas} envios={f.envios} />
    </div>
  )
}
