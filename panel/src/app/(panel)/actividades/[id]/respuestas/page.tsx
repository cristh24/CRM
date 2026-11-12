import { notFound, redirect } from 'next/navigation'

/** Las respuestas de cada actividad ahora están en "Respuestas de formularios". */
export default async function RespuestasActividad(props: PageProps<'/actividades/[id]/respuestas'>) {
  const { id } = await props.params
  if (!/^\d+$/.test(id)) notFound()
  redirect(`/formularios/a-${id}`)
}
