import Link from "next/link";
import { OwlMark } from "@/components/OwlMark";
import { HouseIcon } from "@/components/HouseIcon";
import { requireProfile } from "@/lib/auth";
import { signOutAction } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/Icon";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile("admin");
  const supabase = createClient();

  // Redaktörer (de som granskar Nutidskrysset) får en egen länk med antal utkast.
  const { data: isEditor } = await supabase.rpc("is_content_editor");
  const { count: nutidDrafts } =
    isEditor === true
      ? await supabase
          .from("nutidskryss")
          .select("id", { count: "exact", head: true })
          .eq("status", "draft")
      : { count: 0 };

  return (
    <div className="min-h-screen bg-sand">
      <header className="border-b border-sand-deep bg-white/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Link
              href="/admin"
              aria-label="Till startsidan"
              title="Till startsidan"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-navy/60 transition-colors hover:bg-seafoam hover:text-ocean-dark"
            >
              <HouseIcon />
            </Link>
            <Link href="/admin" className="flex shrink-0 items-center gap-2">
              <OwlMark size={64} />
              <span className="hidden font-display text-lg font-semibold text-navy sm:inline">
                ProvKlura
              </span>
            </Link>
            <nav className="hidden gap-4 text-sm font-medium text-navy/70 sm:flex">
              <Link href="/admin/elever" className="hover:text-ocean">
                Elever
              </Link>
              <Link href="/admin/prov" className="hover:text-ocean">
                Pluggprojekt
              </Link>
              <Link href="/admin/testbibliotek" className="hover:text-ocean">
                Testbibliotek
              </Link>
              {isEditor === true && (
                <Link href="/admin/nutidskryss" className="hover:text-ocean">
                  Nutidskryss
                  {nutidDrafts ? (
                    <span className="ml-1 rounded-full bg-press px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {nutidDrafts}
                    </span>
                  ) : null}
                </Link>
              )}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-sm sm:gap-4">
            <span className="hidden text-navy/60 sm:inline">
              {profile.display_name}
            </span>
            <form action={signOutAction}>
              <button type="submit" className="link-back">
                <Icon name="logga-ut" size={16} />
                Logga ut
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
