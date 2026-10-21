import Link from "next/link";
import { OwlMark } from "@/components/OwlMark";
import { HouseIcon } from "@/components/HouseIcon";
import { requireProfile } from "@/lib/auth";
import { signOutAction } from "@/app/actions/auth";
import { Icon } from "@/components/Icon";

export default async function ElevLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireProfile("student");

  return (
    <div className="min-h-screen bg-sand">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/elev"
            aria-label="Till startsidan"
            title="Till startsidan"
            className="flex h-9 w-9 items-center justify-center rounded-full text-navy/60 transition-colors hover:bg-seafoam hover:text-ocean-dark"
          >
            <HouseIcon />
          </Link>
          <Link href="/elev" className="flex items-center gap-2">
            <OwlMark size={56} />
            <span className="font-display text-base font-semibold text-navy">
              ProvKlura
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/elev/installningar" className="link-back text-navy/70">
            <Icon name="installningar" size={16} />
            Inställningar
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="link-back text-navy/70">
              <Icon name="logga-ut" size={16} />
              Logga ut
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-md px-6 py-6">{children}</main>
    </div>
  );
}
