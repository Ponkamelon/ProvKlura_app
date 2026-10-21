import Link from "next/link";
import { createInvitationAction } from "@/app/actions/students";
import { Icon } from "@/components/Icon";

export default function NyElevPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="mx-auto max-w-md">
      <Link href="/admin/elever" className="link-back">
        <Icon name="tillbaka" size={16} />
        Avbryt
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-navy">
        Lägg till elev
      </h1>
      <p className="mt-1 text-sm text-navy/60">
        Skapar en inbjudningslänk du kan skicka till eleven.
      </p>

      {searchParams.error && (
        <p className="mt-4 rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral-dark">
          {searchParams.error}
        </p>
      )}

      <form action={createInvitationAction} className="notebook-card mt-6 space-y-4 p-6">
        <div>
          <label htmlFor="studentName" className="field-label">
            Namn
          </label>
          <input
            id="studentName"
            name="studentName"
            type="text"
            required
            className="field-input"
          />
        </div>
        <div>
          <label htmlFor="email" className="field-label">
            E-post
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="field-input"
          />
        </div>
        <div>
          <label htmlFor="gradeLevel" className="field-label">
            Årskurs
          </label>
          <select
            id="gradeLevel"
            name="gradeLevel"
            required
            defaultValue=""
            className="field-input"
          >
            <option value="" disabled>
              Välj årskurs
            </option>
            <option value="7">Årskurs 7</option>
            <option value="8">Årskurs 8</option>
            <option value="9">Årskurs 9</option>
          </select>
        </div>
        <button type="submit" className="btn-primary w-full">
          <Icon name="skicka-inbjudan" />
          Skicka inbjudan
        </button>
      </form>
    </div>
  );
}
