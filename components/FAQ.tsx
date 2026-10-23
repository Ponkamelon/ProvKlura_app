"use client";

import { useState } from "react";

type FAQItem = {
  question: string;
  answer: string;
  /** Länk till källan, visas under svaret. */
  source?: { label: string; href: string };
};

const FAQ_ITEMS: FAQItem[] = [
  {
    question: "Vad är ProvKlura egentligen?",
    answer:
      "ProvKlura tar det ditt barn redan pluggar på — anteckningar, instuderingsfrågor, sidor ur läroboken — och gör om det till korta, träffsäkra frågor på några sekunder. Kort fråga → kort svar → direkt återkoppling → nästa fråga.",
  },
  {
    question: "Hur skiljer sig det här från andra pluggappar?",
    answer:
      "De flesta pluggappar ger generiska frågor ur en färdig frågebank. ProvKlura genererar frågorna från ert eget material — klistrar du in fredagens anteckningar om fotosyntes, är det fotosyntes eleven tränar på, inte allmänna biologifrågor som råkar likna det.",
  },
  {
    question: "Blir det här bara mer press för ett barn som redan tycker skolan är tungt?",
    answer:
      "Nej, tvärtom. Ett pass kan vara fem frågor, fem minuter, och sen är det klart — ingen skuldkänsla över att \"borde plugga mer\". Appen visar tydligt vad som redan sitter, så barnet ser hur mycket hen faktiskt kan, inte bara vad som är kvar.",
  },
  {
    question: "Jag hinner inte plugga med mitt barn varje dag — funkar det ändå?",
    answer:
      "Ja, det är poängen. Du laddar upp material på några minuter när du har tid, och appen sköter förhör, rättning och uppföljning däremellan. Du ser vad ditt barn kan och vad som behöver mer träning, utan att sitta bredvid varje kväll.",
  },
  {
    question: "Mitt barn vågar inte säga att hen inte förstår något — hjälper appen med det?",
    answer:
      "Att svara fel på en fråga i sin egen takt, utan att någon ser, är en helt annan sak än att räcka upp handen i klassrummet. Du ser var det brister som förälder, utan att ditt barn någonsin behövt säga det högt.",
  },
  {
    question: "Fungerar det för barn som har svårt att sitta still eller fokusera länge?",
    answer:
      "Ja. Studiepassen är korta som standard, en fråga i taget, inget som stjäl fokus. Du kan anpassa upplevelsen efter ditt barns behov — mindre text, lugnare gränssnitt, färre distraktioner, mer förutsägbart flöde.",
  },
  {
    question: "Bygger ProvKlura på forskning?",
    answer:
      "Ja, på forskning om hur man lär sig bäst. Det amerikanska utbildningsdepartementets forskningsinstitut (IES) har gått igenom forskningen i vägledningen \"Organizing Instruction and Study to Improve Student Learning\". Den rekommenderar bland annat två saker: att sprida ut träningen över tid i stället för att plugga allt på en gång, och att använda korta förhörsfrågor som ett sätt att lära sig, inte bara för att kontrollera. Därför är passen korta och frågorna kommer tillbaka. Exakt när en fråga dyker upp igen är däremot vårt eget val. Det utvärderar vi och justerar efter hand.",
    source: { label: "IES, ies.ed.gov", href: "https://ies.ed.gov" },
  },
  {
    question: "Vad är självbestämmandeteorin, och vad har den med appen att göra?",
    answer:
      "Självbestämmandeteorin är en välkänd motivationsteori från psykologerna Edward Deci och Richard Ryan. Den beskriver tre behov som gör att vi vill göra något av egen vilja: autonomi (att själv få välja), kompetens (att känna att man klarar det) och samhörighet (att känna sig sedd). I ProvKlura väljer eleven själv vilket test hen tränar på. Eleven ser vad hen redan kan och jämförs bara med sig själv, aldrig med andra. Det finns inga topplistor. Eleven väljer ett eget veckomål, och en missad dag tar aldrig bort något – klara test, tid och veckor med nått mål finns kvar. Föräldern ser framstegen och kan svara när eleven ber om ett nytt test. Teorin bevisar däremot inte att en viss funktion, till exempel veckomål eller medaljer, får just ditt barn att plugga mer. Det är antaganden som vi testar och följer upp, och vi mäter både om eleverna kommer tillbaka och om de faktiskt lär sig.",
    source: { label: "Self-Determination Theory, selfdeterminationtheory.org", href: "https://selfdeterminationtheory.org" },
  },
  {
    question: "Hittar AI:n bara på frågor, eller kan jag lita på dem?",
    answer:
      "AI:n får bara använda materialet du laddar upp — den hittar aldrig på fakta. Varje fråga får ett säkerhetsvärde, och du granskar och godkänner alltid innan ditt barn ser frågorna.",
  },
  {
    question: "Vad kostar det?",
    answer:
      "Ett abonnemang kostar 19–29 kr i månaden och gäller för upp till 5 barn på samma konto — har du flera barn i skolåldern räcker en enda prenumeration till hela syskonskaran.",
  },
  {
    question: "Är mitt barns uppgifter säkra?",
    answer:
      "Ditt barns svar och resultat är bara synliga för dig som skapat kontot — aldrig för andra föräldrar, andra elever eller utomstående.",
  },
];

function FAQRow({ item }: { item: FAQItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="notebook-card p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left font-medium text-navy"
      >
        {item.question}
        <span
          className={
            "shrink-0 text-navy/40 transition-transform" + (open ? " rotate-180" : "")
          }
        >
          ⌄
        </span>
      </button>
      {open && (
        <>
          <p className="mt-3 text-sm leading-relaxed text-navy/70">{item.answer}</p>
          {item.source && (
            <p className="mt-2 text-xs text-navy/50">
              Källa:{" "}
              <a
                href={item.source.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ocean underline"
              >
                {item.source.label}
              </a>
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function FAQ({
  title = "Vanliga frågor",
  className = "",
}: {
  title?: string;
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className="text-center font-display text-2xl font-semibold text-navy">
        {title}
      </h2>
      <div className="mx-auto mt-6 max-w-2xl space-y-3">
        {FAQ_ITEMS.map((item) => (
          <FAQRow key={item.question} item={item} />
        ))}
      </div>
    </section>
  );
}
