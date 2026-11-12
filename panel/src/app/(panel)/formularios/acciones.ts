'use server'

// Check "Descuento aplicado" de Respuestas de formularios. El RLS deja marcarlo o quitarlo a quien ve el lead.
import { revalidatePath } from 'next/cache'
import { mensajeError } from '@/lib/formato'
import { exigirPermiso } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export async function marcarDescuento(clave: string, leadId: string, aplicado: boolean): Promise<{ error?: string }> {
  const { perfil } = await exigirPermiso('actividades')
  if (!/^(a-\d+|q-[0-9a-f-]{36})$/i.test(clave) || !/^[0-9a-f-]{36}$/i.test(leadId)) return { error: 'Datos no válidos.' }
  const supabase = await crearClienteServidor()
  const { error } = aplicado
    ? await supabase.from('formulario_descuentos').upsert({ clave, lead_id: leadId, marcado_por: perfil.id }, { onConflict: 'clave,lead_id', ignoreDuplicates: true })
    : await supabase.from('formulario_descuentos').delete().eq('clave', clave).eq('lead_id', leadId)
  if (error) return { error: mensajeError(error) }
  revalidatePath(`/formularios/${clave}`)
  return {}
}
