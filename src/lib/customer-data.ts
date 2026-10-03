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

export const founders = [
  {
    name: "Sameer Shreenivas Mittimani",
    role: "Founder · product and credit",
    initials: "SM",
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
    role: "Co-builder · code and design (AI by Anthropic)",
    initials: "AI",
    bio: "Claude is an AI model made by Anthropic. Working from Sameer's specs and reviews, it wrote the code, designed the screens, built the database and the cloud services, trained and checked the risk model, and wrote the tests and documentation.",
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
