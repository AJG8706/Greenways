-- Master/lot hierarchy (Alton's ask): a tract like Warren is one master
-- property whose lots are child properties. One level only — a lot cannot
-- itself be a master (enforced by trigger, since a CHECK can't see other
-- rows). Deleting a master orphans its lots back to top level rather than
-- cascading: lots are real listings with their own walks and history.

alter table public.properties
  add column parent_id uuid references public.properties (id) on delete set null;

create index properties_parent_idx on public.properties (parent_id);

comment on column public.properties.parent_id is
  'Master property this lot belongs to (one level deep). Null = standalone or master.';

create or replace function public.guard_property_parent()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'property_parent: a property cannot be its own master'
        using errcode = 'P0001';
    end if;
    if exists (select 1 from properties p where p.id = new.parent_id and p.parent_id is not null) then
      raise exception 'property_parent: masters cannot be nested (one level only)'
        using errcode = 'P0001';
    end if;
    if exists (select 1 from properties c where c.parent_id = new.id) then
      raise exception 'property_parent: a master cannot become a lot while it has lots'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger property_parent_guard
  before insert or update of parent_id on public.properties
  for each row execute function public.guard_property_parent();
