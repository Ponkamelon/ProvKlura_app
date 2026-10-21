import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OwlMark } from "@/components/OwlMark";
import { WaveDivider } from "@/components/WaveDivider";
import { Icon } from "@/components/Icon";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.role === "admin") redirect("/admin");
    if (profile?.role === "student") redirect("/elev");
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-sand px-6 py-16 text-center">
      <OwlMark size={112} />
      <h1 className="mt-6 text-4xl text-navy sm:text-5xl">
        ProvKlura
      </h1>
      <p className="mt-1 font-accent text-2xl text-coral">Klura ut provet.</p>
      <p className="mt-3 max-w-md text-lg text-navy/70">
        Foto, PDF eller anteckningar in. Korta frågor ut.
      </p>
      <WaveDivider className="mt-6 h-4 w-40" color="#FF6B4A" />
      <div className="mt-8 flex w-full max-w-xs flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:justify-center">
        <Link href="/skapa-konto" className="btn-primary justify-center">
          Kom igång som förälder/lärare
        </Link>
        <Link href="/logga-in" className="btn-secondary justify-center">
          <Icon name="logga-in" />
          Logga in
        </Link>
        <Link href="/faq" className="btn-tertiary justify-center">
          <Icon name="vanliga-fragor" />
          Vanliga frågor
        </Link>
      </div>
    </main>
  );
}
