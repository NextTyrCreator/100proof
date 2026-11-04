import { LoginGate } from "../components/LoginGate";
import { createServerSupabase } from "../lib/supabase/server";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ for?: string | string[] }> }) {
  const params = await searchParams;
  const flag = Array.isArray(params.for) ? params.for[0] : params.for;
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return <LoginGate email={data.user?.email ?? null} startAs={flag === "providers" ? "provider" : "insured"} />;
}
