-- =====================================================================
--  Referencia del formulario (QR o enlace del asesor) desde otro celular.
--  Si el lead ya conversó hace poco con su número, el mensaje con "Ref. xxxxxx"
--  creaba un lead nuevo sin asesor. Ahora ese número queda como alias del lead.
--  También se reconoce la referencia de los leads que llegaron por el enlace.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.registrar_lead(p_telefono text, p_mensaje text DEFAULT NULL::text, p_es_lid boolean DEFAULT false)
 RETURNS leads
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_lead      public.leads;
  v_otro      public.leads;
  v_ref       text;
  v_dni       text;
  v_repetido  boolean := false;
  v_por_ref   boolean := false;
begin
  select * into v_lead from public.leads where telefono = p_telefono for update;
  if v_lead.id is null then
    select l.* into v_lead from public.lead_alias a join public.leads l on l.id = a.lead_id
    where a.alias = p_telefono for update of l;
  end if;

  -- Número o LID desconocido (o un LID que solo tiene un lead sin datos):
  -- ¿el mensaje trae la referencia del QR o un DNI conocido?
  if p_mensaje is not null and (v_lead.id is null or (p_es_lid and v_lead.nombre is null and v_lead.dni is null)) then
    v_ref := lower(substring(p_mensaje from '(?i)ref\.?\s*([0-9a-f]{6})'));
    if v_ref is not null then
      select * into v_otro from public.leads
      where id::text like v_ref || '%' and (actividad_id is not null or origen_campana in ('Presencial (QR del asesor)', 'Enlace del asesor (WhatsApp)'))
        and coalesce(ultimo_registro_at, created_at) > now() - interval '60 days'
      order by coalesce(ultimo_registro_at, created_at) desc limit 1 for update;
      v_por_ref := v_otro.id is not null;
    end if;
    if v_otro.id is null then
      v_dni := substring(p_mensaje from '(?i)dni\D{0,4}(\d{8})');
      if v_dni is not null then
        select * into v_otro from public.leads where dni = v_dni for update;
      end if;
    end if;
    if v_otro.id = v_lead.id then
      v_otro := null;
    end if;

    -- El lead sin datos de ese LID se une al registrado: pasa su conversación y se borra
    if v_otro.id is not null and v_lead.id is not null then
      update public.lead_interacciones set lead_id = v_otro.id where lead_id = v_lead.id;
      delete from public.leads where id = v_lead.id;
      v_lead := null;
    end if;

    if v_otro.id is not null then
      if p_es_lid then
        -- El LID no es un celular: se guarda como alias y el lead conserva su número real
        insert into public.lead_alias (alias, lead_id) values (p_telefono, v_otro.id) on conflict (alias) do nothing;
        insert into public.lead_interacciones (lead_id, tipo, contenido)
        values (v_otro.id, 'sistema', 'Escribió por WhatsApp con un contacto privado (sin número): se unió a su registro');
        update public.leads set eliminado_at = null, eliminado_por = null where id = v_otro.id;
        select * into v_lead from public.leads where id = v_otro.id;
      elsif v_otro.ultimo_mensaje_lead_at is null or v_otro.ultimo_mensaje_lead_at < now() - interval '30 days' then
        -- Otro celular real y el anterior no conversa: el lead pasa a este celular
        update public.leads set telefono = p_telefono, eliminado_at = null, eliminado_por = null where id = v_otro.id;
        insert into public.lead_interacciones (lead_id, tipo, contenido)
        values (v_otro.id, 'sistema', 'Escribió desde ' || p_telefono || ': se actualizó el celular (antes ' || v_otro.telefono || ')');
        select * into v_lead from public.leads where id = v_otro.id;
      elsif v_por_ref then
        -- Trae la referencia de su formulario pero escribe desde otro celular y el anterior sigue activo:
        -- el nuevo número queda como alias para que el mensaje llegue al chat de su asesor
        insert into public.lead_alias (alias, lead_id) values (p_telefono, v_otro.id) on conflict (alias) do nothing;
        insert into public.lead_interacciones (lead_id, tipo, contenido)
        values (v_otro.id, 'sistema', 'Escribió desde otro celular (' || p_telefono || '): se unió a su registro');
        update public.leads set eliminado_at = null, eliminado_por = null where id = v_otro.id;
        select * into v_lead from public.leads where id = v_otro.id;
      end if;
    end if;
  end if;

  if v_lead.id is not null and p_mensaje is not null then
    select exists (
      select 1 from public.lead_interacciones
      where lead_id = v_lead.id and tipo = 'mensaje_lead' and contenido = p_mensaje
        and created_at > now() - interval '1 minute'
    ) into v_repetido;
  end if;
  if v_repetido then
    return v_lead;
  end if;

  if v_lead.id is not null then
    update public.leads
    set ultimo_contacto = now(), total_mensajes = total_mensajes + 1
    where id = v_lead.id
    returning * into v_lead;
  else
    insert into public.leads (telefono, total_mensajes)
    values (p_telefono, 1)
    on conflict (telefono) do update
      set ultimo_contacto = now(),
          total_mensajes  = public.leads.total_mensajes + 1
    returning * into v_lead;
  end if;

  if p_mensaje is not null then
    insert into public.lead_interacciones (lead_id, tipo, contenido)
    values (v_lead.id, 'mensaje_lead', p_mensaje);
  end if;

  return v_lead;
end $function$;
