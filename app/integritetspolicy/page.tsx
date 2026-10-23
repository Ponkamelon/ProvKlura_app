import Link from "next/link";
import { OwlMark } from "@/components/OwlMark";

export const metadata = {
  title: "Integritetspolicy – ProvKlura",
};

export default function IntegritetspolicyPage() {
  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-sand px-6 py-16">
      <Link href="/" className="mb-8 flex items-center gap-3">
        <OwlMark size={64} />
        <span className="font-display text-lg font-semibold text-navy">
          ProvKlura
        </span>
      </Link>

      <div className="mb-8 rounded-xl border border-coral bg-coral/10 p-4 text-sm text-coral-dark">
        <strong>Utkast, inte juridiskt granskat.</strong> Den här texten är en
        utgångspunkt, inte färdig juridisk rådgivning. Eftersom ProvKlura
        hanterar uppgifter om barn bör en jurist eller GDPR-kunnig person gå
        igenom och anpassa texten innan den används på riktigt, särskilt om
        appen används av fler än den egna familjen eller ett enstaka
        klassrum.
      </div>

      <h1 className="font-display text-3xl font-semibold text-navy">
        Integritetspolicy
      </h1>
      <p className="mt-2 text-sm text-navy/50">Senast uppdaterad: [datum]</p>

      <div className="prose prose-navy mt-8 space-y-6 text-navy/80">
        <section>
          <h2 className="font-display text-xl font-semibold text-navy">
            1. Vem är personuppgiftsansvarig?
          </h2>
          <p className="mt-2">
            [Ditt namn / organisation] är personuppgiftsansvarig för de
            personuppgifter som behandlas i ProvKlura. Kontakta oss på
            [e-postadress] vid frågor om den här policyn eller om dina
            uppgifter.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-navy">
            2. Vilka uppgifter samlar vi in?
          </h2>
          <p className="mt-2">
            <strong>Om admin (förälder/lärare):</strong> namn, e-postadress,
            lösenord (lagras krypterat).
          </p>
          <p className="mt-2">
            <strong>Om elev:</strong> namn, e-postadress, årskurs, lösenord
            (krypterat), svar på quizfrågor, resultat och studieframsteg,
            samt eventuella tillgänglighetsinställningar (till exempel
            textstorlek eller pausbehov) som en admin ställt in.
          </p>
          <p className="mt-2">
            <strong>Uppladdat material:</strong> text som admin klistrar in
            för att generera frågor (till exempel anteckningar eller
            instuderingsfrågor).
          </p>
          <p className="mt-2">
            <strong>Elevens texter i Skrivklura:</strong> texterna eleven
            skriver i skrivövningarna och den feedback eleven får, så att
            eleven kan se hur långt hen har kommit.
          </p>
          <p className="mt-2">
            <strong>Användningsstatistik:</strong> för att förstå om appen
            hjälper eleverna att komma igång och lära sig loggar vi vad som
            händer i appen, till exempel att ett pass startades eller
            avslutades, om ett svar var rätt eller fel och hur lång tid det
            tog. Statistiken sparas med ett slumpat elev-ID i stället för
            namn, och innehåller inga diagnoser, anpassningsinställningar
            eller fritextsvar. Vi använder inga analystjänster från tredje
            part.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-navy">
            3. Varför behandlar vi uppgifterna?
          </h2>
          <p className="mt-2">
            För att tillhandahålla tjänsten: skapa konton, generera
            övningsfrågor, visa resultat och studieframsteg till admin och
            elev, samt anpassa upplevelsen efter elevens behov. Användningsstatistiken
            används för att följa upp och förbättra appen, till exempel om
            eleverna återkommer och om kunskaperna sitter kvar över tid.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-navy">
            4. Barns uppgifter
          </h2>
          <p className="mt-2">
            Elevkonton skapas av en admin (förälder eller lärare), som
            ansvarar för att ha rätt att göra det för barnets räkning. Vi
            samlar inte in fler uppgifter om eleven än vad som krävs för att
            tjänsten ska fungera, och elevens quizsvar och
            anpassningsinställningar är bara synliga för elevens egen admin —
            aldrig för andra elever eller andra admins.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-navy">
            5. Vem delar vi uppgifter med?
          </h2>
          <p className="mt-2">
            <strong>Supabase</strong> — databas och inloggning (personuppgiftsbiträde).
          </p>
          <p className="mt-2">
            <strong>Anthropic</strong> — det uppladdade studiematerialet
            skickas till Anthropics AI-tjänst för att generera frågor. Vi
            skickar inte elevers namn, resultat eller quizsvar dit — bara
            studiematerialet i sig. I Skrivklura skickas även texten som
            eleven själv skriver dit, utan namn eller andra uppgifter om
            eleven, för att eleven ska få kort feedback på textens
            uppbyggnad.
          </p>
          <p className="mt-2">
            <strong>Vercel</strong> — driftar och hostar applikationen.
          </p>
          <p className="mt-2">
            Vi säljer aldrig uppgifter vidare och delar dem inte i
            marknadsföringssyfte.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-navy">
            6. Hur länge sparar vi uppgifterna?
          </h2>
          <p className="mt-2">
            Så länge kontot är aktivt. En admin kan när som helst begära att
            ett elevkonto och dess uppgifter raderas — kontakta
            [e-postadress].
          </p>
          <p className="mt-2">
            Användningsstatistiken raderas automatiskt efter 12 månader. Tas
            ett elevkonto bort raderas också kopplingen mellan eleven och
            det slumpade ID:t, så att statistiken inte längre kan knytas
            till eleven.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-navy">
            7. Dina rättigheter
          </h2>
          <p className="mt-2">
            Du har rätt att begära utdrag av, rättelse av, eller radering av
            dina eller ditt barns uppgifter, samt att invända mot
            behandlingen. Kontakta [e-postadress]. Du har också rätt att
            klaga till Integritetsskyddsmyndigheten (IMY).
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-navy">
            8. Säkerhet
          </h2>
          <p className="mt-2">
            Lösenord lagras krypterade. Åtkomstregler i databasen (Row Level
            Security) säkerställer att en admin bara kan se sina egna elever,
            och att en elev bara kan se sitt eget material och sina egna
            resultat.
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-navy">
            9. Ändringar
          </h2>
          <p className="mt-2">
            Vi kan uppdatera den här policyn. Väsentliga ändringar meddelas
            till admin via e-post eller i appen.
          </p>
        </section>
      </div>
    </div>
  );
}
