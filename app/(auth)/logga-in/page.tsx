import Link from "next/link";
import { signInAction } from "@/app/actions/auth";
import { Icon } from "@/components/Icon";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string };
}) {
  return (
    <div>
      <div className="notebook-card mx-auto w-full max-w-sm p-8">
        <h1 className="font-display text-2xl font-semibold text-navy">
          Logga in
        </h1>
        <p className="mt-1 text-sm text-navy/60">Bra att se dig igen.</p>

        {searchParams.message === "confirm_email" && (
          <p className="mt-4 rounded-xl bg-seafoam px-3 py-2 text-sm text-ocean-dark">
            Kolla din mejl och bekräfta kontot innan du loggar in.
          </p>
        )}
        {searchParams.error && (
          <p className="mt-4 rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral-dark">
            {searchParams.error}
          </p>
        )}

        <form action={signInAction} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="field-label">
              E-post
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="field-input"
            />
          </div>
          <div>
            <label htmlFor="password" className="field-label">
              Lösenord
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="field-input"
            />
          </div>
          <button type="submit" className="btn-primary w-full">
            <Icon name="logga-in" />
            Logga in
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-navy/60">
          Ny som admin?{" "}
          <Link href="/skapa-konto" className="font-medium text-ocean underline">
            Skapa konto
          </Link>
        </p>
      </div>

      <div className="mx-auto mt-6 w-full max-w-sm text-center">
        <Link href="/faq" className="btn-tertiary w-full justify-center">
          <Icon name="vanliga-fragor" />
          Vanliga frågor
        </Link>
      </div>
    </div>
  );
}
