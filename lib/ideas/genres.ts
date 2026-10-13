/**
 * Idéverkstaden — eleven svarar på några frågor och får ett AI-skrivet
 * exempel att hämta idéer från. Frågorna per texttyp ligger här så att
 * samma lista används i formuläret och i AI-prompten.
 */

export type IdeaQuestion = {
  id: string;
  label: string;
  placeholder?: string;
  /** Förslag eleven kan trycka på i stället för att skriva själv. */
  chips?: string[];
  /** Fri text (true) eller bara val bland brickor (false). */
  freeText: boolean;
  required?: boolean;
};

export type IdeaGenre = {
  id: string;
  label: string;
  description: string;
  questions: IdeaQuestion[];
};

export const IDEA_LENGTHS = [
  { id: "kort", label: "Kort", hint: "ca 750–900 tecken", minChars: 750, maxChars: 950 },
  { id: "mellan", label: "Mellan", hint: "ca 1 500 tecken", minChars: 1400, maxChars: 1700 },
  { id: "lang", label: "Lång", hint: "ca 2 500 tecken", minChars: 2300, maxChars: 2800 },
] as const;

export type IdeaLengthId = (typeof IDEA_LENGTHS)[number]["id"];

export const IDEA_GENRES: IdeaGenre[] = [
  {
    id: "novell",
    label: "Novell",
    description: "En kort berättelse med få personer och en tydlig händelse",
    questions: [
      {
        id: "uppgift",
        label: "Vad är uppgiften? Vad handlar låten eller starten om?",
        placeholder: "T.ex. En låt om två som går på dejt. Jag ska fortsätta historien.",
        freeText: true,
        required: true,
      },
      {
        id: "personer",
        label: "Vilka är huvudpersonerna?",
        placeholder: "T.ex. Ella, 15, nervös. Leo, lugn men hemlighetsfull.",
        freeText: true,
      },
      {
        id: "plats",
        label: "Var händer det?",
        chips: ["Ett café", "En bowlinghall", "En busshållplats i regnet", "Ett tivoli", "En strand på kvällen"],
        freeText: true,
      },
      {
        id: "problem",
        label: "Vad går snett?",
        chips: [
          "Plånboken är glömd",
          "En ex dyker upp",
          "Mobilen dör",
          "De har träffats förut",
          "Någon har ljugit",
          "Sista bussen har gått",
        ],
        freeText: true,
      },
      {
        id: "stamning",
        label: "Vilken stämning?",
        chips: ["Pirrig", "Rolig", "Sorglig", "Spännande", "Pinsam"],
        freeText: false,
      },
      {
        id: "slut",
        label: "Hur ska det sluta?",
        chips: ["Lyckligt", "Sorgligt", "Öppet", "Oväntat"],
        freeText: false,
      },
    ],
  },
  {
    id: "kronika",
    label: "Krönika",
    description: "En kort, personlig text om något i vardagen",
    questions: [
      {
        id: "amne",
        label: "Vad ska krönikan handla om?",
        placeholder: "T.ex. Att gå upp på morgonen",
        chips: ["Mobilen", "Skolmaten", "Läxor", "Att vänta på bussen", "Helgen går för snabbt"],
        freeText: true,
        required: true,
      },
      {
        id: "handelse",
        label: "Vad hände? En liten situation att börja med",
        placeholder: "T.ex. Jag försov mig och missade bussen",
        freeText: true,
      },
      {
        id: "asikt",
        label: "Vad tycker du om det?",
        placeholder: "T.ex. Skolan borde börja senare",
        freeText: true,
      },
      {
        id: "ton",
        label: "Vilken ton?",
        chips: ["Rolig", "Allvarlig", "Irriterad", "Eftertänksam"],
        freeText: false,
      },
    ],
  },
  {
    id: "argumenterande",
    label: "Argumenterande text",
    description: "Du tycker något och försöker övertyga läsaren",
    questions: [
      {
        id: "fraga",
        label: "Vilken fråga eller vilket ämne?",
        placeholder: "T.ex. Ska mobiler vara förbjudna i skolan?",
        freeText: true,
        required: true,
      },
      {
        id: "asikt",
        label: "Vad tycker du?",
        placeholder: "T.ex. Ja, under lektionerna",
        freeText: true,
      },
      {
        id: "argument",
        label: "Har du något argument redan?",
        placeholder: "T.ex. Man koncentrerar sig bättre",
        freeText: true,
      },
      {
        id: "mottagare",
        label: "Vem skriver du till?",
        chips: ["Rektorn", "Politiker", "Andra elever", "Föräldrar", "Tidningens läsare"],
        freeText: true,
      },
    ],
  },
];

export function findIdeaGenre(id: string): IdeaGenre | undefined {
  return IDEA_GENRES.find((g) => g.id === id);
}

export function findIdeaLength(id: string) {
  return IDEA_LENGTHS.find((l) => l.id === id) ?? IDEA_LENGTHS[0];
}
