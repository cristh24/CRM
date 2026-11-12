-- Respuestas de formularios: todos los asesores ven las respuestas de todos, pero SOLO de los formularios de
-- Actividades y del QR (o enlace) de cada asesor. El resto de leads sigue con su RLS de siempre.
-- Funciones de solo lectura (security definer) que exigen ser usuario del panel. No cambia ningún dato.

-- Quién llenó cada formulario: "a-<actividad>" o "q-<asesor>" (su QR), una fila por alumno (la última vez)
create or replace function public.formulario_envios_base()
returns table (clave text, lead_id uuid, fecha timestamptz, via text)
language sql stable security definer set search_path = ''
as $$
  with t as (
    select 'a-' || l.actividad_id as clave, l.id as lead_id, coalesce(l.ultimo_registro_at, l.created_at) as fecha, null::text as via
    from public.leads l where l.actividad_id is not null
    union all
    select 'a-' || r.actividad_id, r.lead_id, r.updated_at, null from public.actividad_respuestas r
    union all
    -- "Llenó el formulario del QR de <asesor> (atención presencial)" / "… del enlace de <asesor> (enviado por WhatsApp)"
    select 'q-' || a.id, i.lead_id, i.created_at,
           case when i.contenido like 'Llenó el formulario del QR de %' then 'QR presencial' else 'Enlace por WhatsApp' end
    from public.lead_interacciones i
    join public.asesores a
      on i.contenido like 'Llenó el formulario del QR de ' || trim(a.nombre) || ' (%'
      or i.contenido like 'Llenó el formulario del enlace de ' || trim(a.nombre) || ' (%'
    where i.tipo = 'sistema' and i.contenido like 'Llenó el formulario del %'
  )
  select distinct on (t.clave, t.lead_id) t.clave, t.lead_id, t.fecha, t.via
  from t join public.leads l on l.id = t.lead_id and l.eliminado_at is null
  where (select public.mi_asesor_id()) is not null
  order by t.clave, t.lead_id, t.fecha desc
$$;
revoke execute on function public.formulario_envios_base() from public, anon, authenticated;

-- Lista de formularios: cuántos lo llenaron y cuándo fue el último
create or replace function public.formularios_resumen()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('clave', clave, 'envios', n, 'ultimo', ultimo)), '[]'::jsonb)
  from (select clave, count(*) n, max(fecha) ultimo from public.formulario_envios_base() group by clave) x
$$;

-- Respuestas de un formulario: datos del alumno, respuestas a las preguntas propias y el check de descuento
create or replace function public.formulario_detalle(p_clave text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'lead_id', l.id, 'nombre', l.nombre, 'telefono', l.telefono, 'dni', l.dni, 'carrera_interes', l.carrera_interes,
    'grado', l.grado, 'colegio', l.colegio, 'ubigeo', l.ubigeo, 'sede', l.sede,
    'asesor_id', l.asesor_id, 'asesor', a.nombre, 'fecha', coalesce(r.updated_at, e.fecha), 'via', e.via,
    'respuestas', r.respuestas, 'descuento_por', ad.nombre, 'descuento_at', d.created_at
  ) order by coalesce(r.updated_at, e.fecha) desc), '[]'::jsonb)
  from public.formulario_envios_base() e
  join public.leads l on l.id = e.lead_id
  left join public.asesores a on a.id = l.asesor_id
  left join public.actividad_respuestas r
    on r.lead_id = l.id and r.actividad_id = case when p_clave ~ '^a-[0-9]+$' then substr(p_clave, 3)::bigint end
  left join public.formulario_descuentos d on d.clave = p_clave and d.lead_id = l.id
  left join public.asesores ad on ad.id = d.marcado_por
  where e.clave = p_clave
$$;

revoke execute on function public.formularios_resumen(), public.formulario_detalle(text) from public, anon;
grant execute on function public.formularios_resumen(), public.formulario_detalle(text) to authenticated;

-- El check de descuento: lo marca el administrador sobre cualquier alumno de estos formularios
drop policy if exists "formulario_descuentos: marca el administrador" on public.formulario_descuentos;
create policy "formulario_descuentos: marca el administrador" on public.formulario_descuentos
  for insert to authenticated
  with check ((select public.es_admin_o_superadmin()) and marcado_por = (select public.mi_asesor_id()));
drop policy if exists "formulario_descuentos: quita el administrador" on public.formulario_descuentos;
create policy "formulario_descuentos: quita el administrador" on public.formulario_descuentos
  for delete to authenticated
  using ((select public.es_admin_o_superadmin()));
