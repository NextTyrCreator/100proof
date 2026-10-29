-- Signed-out callers do not need the membership helpers. Policies run as authenticated.

revoke execute on function public.ensure_personal_org() from anon;
revoke execute on function public.is_org_member(uuid) from anon;
