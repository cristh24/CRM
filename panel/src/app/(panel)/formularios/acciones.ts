'use server'

// Check "Descuento aplicado" de Respuestas de formularios: solo el super admin y los administradores
// lo marcan o lo quitan (también lo valida el RLS con es_admin_o_superadmin()).
import { revalidatePath } from 'next/cache'
import { mensajeError } from '@/lib/formato'
import { obtenerSesion, puedeMarcarDescuento } from '@/lib/sesion'
import { crearClienteServidor } from '@/lib/supabase/server'

export async function marcarDescuento(clave: string, leadId: string, aplicado: boolean): Promise<{ error?: string }> {
  const sesion = await obtenerSesion()
  const { perfil } = sesion
  if (!puedeMarcarDescuento(sesion)) return { error: 'Solo el super admin o un administrador puede marcar el descuento.' }
  if (!/^(a-\d+|q-[0-9a-f-]{36})$/i.test(clave) || !/^[0-9a-f-]{36}$/i.test(leadId)) return { error: 'Datos no válidos.' }
  const supabase = await crearClienteServidor()
  const { error } = aplicado
    ? await supabase.from('formulario_descuentos').upsert({ clave, lead_id: leadId, marcado_por: perfil.id }, { onConflict: 'clave,lead_id', ignoreDuplicates: true })
    : await supabase.from('formulario_descuentos').delete().eq('clave', clave).eq('lead_id', leadId)
  if (error) return { error: mensajeError(error) }
  revalidatePath(`/formularios/${clave}`)
  revalidatePath('/actividades')
  return {}
}
