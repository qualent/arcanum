-- Replace per-row auth.uid() evaluation with an initplan-cached subquery.
-- This preserves each policy's roles, command, permissive mode and predicates.
do $$
declare
    p record;
    v_sql text;
begin
    for p in
        select *
        from pg_policies
        where schemaname = 'public'
          and (
            coalesce(qual, '') like '%auth.uid()%'
            or coalesce(with_check, '') like '%auth.uid()%'
          )
    loop
        v_sql := format(
            'create policy %I on %I.%I as %s for %s to %s',
            p.policyname, p.schemaname, p.tablename, p.permissive, p.cmd,
            array_to_string(p.roles, ', ')
        );
        if p.qual is not null then
            v_sql := v_sql || format(' using (%s)', replace(p.qual, 'auth.uid()', '(select auth.uid())'));
        end if;
        if p.with_check is not null then
            v_sql := v_sql || format(' with check (%s)', replace(p.with_check, 'auth.uid()', '(select auth.uid())'));
        end if;
        execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
        execute v_sql;
    end loop;
end $$;
