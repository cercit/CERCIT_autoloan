export const carBrands = [
  "Maruti Suzuki",
  "Hyundai",
  "Tata",
  "Mahindra",
  "Kia",
  "Toyota",
  "Honda",
  "MG",
  "Skoda",
  "Volkswagen",
  "Jeep",
  "Citroen",
  "Renault",
];

export const faqs = [
  {
    q: "What is cercit? Why the name?",
    a: "cercit stands for Credit Evaluation and Risk Compliance Intelligence Tool. That's the long way of saying what it does: it checks your documents, reads your credit history, works out what you can comfortably repay and stays inside the lending rules, so your car loan is decided in hours, not days. Fun fact: cercit was Sameer's gamer tag long before it was a loan platform.",
  },
  {
    q: "Why take my car loan here? What makes it special?",
    a: "We value your time, and we keep improving how we use it. Your documents are read and checked automatically, your credit is assessed the moment you apply, and a person steps in only where a decision really needs one. You came here to plan a new car, not a loan, and we'd like to keep it that way: apply from your phone in about five minutes, see your rate upfront, and leave the loan part to us.",
  },
  {
    q: "How do I contact you?",
    a: "Applying online shouldn't mean you can't reach anyone. We're here every working day on chat, email or a call. We don't have a call centre: whoever is free picks up, from the founder to the newest member of the team. If we can't solve it on the spot, we'll make sure we understand the problem and arrange a call back. You'll always talk to a person, never a bot. Relationships come first for us.",
  },
  {
    q: "What documents do I need?",
    a: "PAN, Aadhaar, a live photo (taken on your phone while you apply), your last 3 salary slips, 6 months of bank statements, Form 16 and the dealer's quotation for your car. Upload photos or PDFs straight from your phone. Password-protected PDFs are fine: you type the password once and we never keep it.",
  },
  {
    q: "How long does approval take?",
    a: "Most salaried applications with complete documents get a decision the same day, often within the hour. If something needs a closer look, a credit officer reviews it, which can take 1–2 working days. A person signs off every loan.",
  },
  {
    q: "Can I prepay my loan?",
    a: "Yes. You can prepay part or all of your loan after your first 6 EMIs. Prepayment is charged at 4% of the amount you prepay, and every charge is shown in your Key Fact Statement before you sign.",
  },
  {
    q: "What if my application is rejected?",
    a: "You'll see the reason in plain words, not a code. If it's something you can fix, like a missing or unclear document, fix it and send it again. If it's about your credit history or how much you already repay each month, you can apply again after 90 days. Either way, you can ask for a credit officer to take a second look.",
  },
];

// Other AI tools and builders who contributed, directly or indirectly. Claude led the
// technical work; these helped with the prototype, design, research and drafts.
// Logos are files in public/team/ (from Simple Icons); null shows initials instead.
export const buildTeam: { name: string; logo: string | null; what: string }[] = [
  { name: "Lovable", logo: null, what: "The first clickable prototype of the screens, which the website grew from." },
  { name: "Google Stitch", logo: "team/google.svg", what: "Early screen design concepts for the customer and staff apps." },
  { name: "ChatGPT", logo: null, what: "The first brainstorm: a 53-part solution blueprint for the whole credit appraisal system." },
  { name: "Gemini", logo: "team/googlegemini.svg", what: "Market and regulation research for the product plan, and quick drafting." },
  { name: "Microsoft Copilot", logo: null, what: "A detailed spec: failure handling, the document-reading pipeline and the test approach." },
  { name: "Hermes", logo: null, what: "An agent that ran overnight drafting jobs and guides, using free models." },
  { name: "Inkling", logo: null, what: "Free conversational model (through Hermes) for drafts and reasoning on design questions." },
  { name: "MiniMax M3", logo: "team/minimax.svg", what: "Free coding model (through Hermes) for first drafts of small scripts." },
  { name: "DeepSeek", logo: "team/deepseek.svg", what: "Earlier default for writing tasks that didn't need tools." },
  { name: "Qwen (local)", logo: "team/qwen.svg", what: "Runs on Sameer's laptop for private and bulk drafts, so nothing sensitive leaves the machine." },
];

export const founders = [
  {
    name: "Sameer Shreenivas Mittimani",
    role: "Founder · product and credit",
    initials: "SM",
    image: "team/sameer.jpg",
    bio: "Sameer has spent years close to how car loans really get approved, and to the slow parts nobody enjoys. He is a product manager (Masai × IIT Roorkee Product Management certification) and wrote cercit's product plan, its credit policy and every rule behind a decision, then reviewed the build one step at a time.",
    hats: [
      "Founder and CEO",
      "Product manager",
      "Head of credit policy",
      "Underwriting and domain expert",
      "Business analyst",
      "Project manager",
      "Testing and sign-off",
      "Compliance and privacy",
    ],
  },
  {
    name: "Claude",
    role: "Chief architect · all things tech (AI by Anthropic)",
    initials: "AI",
    image: "team/claude.svg",
    bio: "Claude is an AI model made by Anthropic and cercit's chief architect: the lead on everything technical. Working from Sameer's specs and reviews, it designed the system, wrote most of the code, designed the screens, built the database and the cloud services, trained and checked the risk model, and wrote the tests and documentation. Where other tools helped, Claude brought their work together and checked it.",
    hats: [
      "Software engineer",
      "Database engineer",
      "Cloud engineer (AWS)",
      "Data scientist",
      "UI and UX designer",
      "Test automation",
      "Security reviewer",
      "Technical writer",
    ],
  },
];

export const makes: Record<string, string[]> = {
  "Maruti Suzuki": ["Swift", "Baleno", "Grand Vitara", "Brezza"],
  Hyundai: ["i20", "Venue", "Creta", "Verna"],
  Tata: ["Tiago", "Nexon", "Harrier", "Safari"],
  Mahindra: ["XUV300", "Scorpio N", "XUV700", "Thar"],
  Kia: ["Sonet", "Seltos", "Carens"],
  Toyota: ["Glanza", "Urban Cruiser", "Innova Hycross"],
  Honda: ["Amaze", "City", "Elevate"],
  MG: ["Astor", "Hector", "ZS EV"],
  Skoda: ["Kushaq", "Slavia"],
  VW: ["Taigun", "Virtus"],
  Jeep: ["Compass", "Meridian"],
  Renault: ["Kiger", "Triber"],
};
