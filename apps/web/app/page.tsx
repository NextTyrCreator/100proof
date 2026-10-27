import { LoginGate } from "../components/LoginGate";
import { createServerSupabase } from "../lib/supabase/server";

export default async function HomePage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return <LoginGate email={data.user?.email ?? null} />;
}
