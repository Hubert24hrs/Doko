/**
 * Igbo-Eze North Grounded Knowledge Base for Oba AI Assistant.
 * Rich cultural heritage, geography, traditional governance, market schedules,
 * dialect vocabulary, and platform navigation.
 */

export interface CulturalArticle {
  id: string;
  topic: string;
  keywords: string[];
  title: string;
  content: string;
}

export const IGBO_EZE_NORTH_KNOWLEDGE: CulturalArticle[] = [
  {
    id: "history_geography",
    topic: "geography",
    keywords: ["history", "geography", "lga", "enugu ezike", "ogrute", "location", "headquarters", "population"],
    title: "Geography & Origins of Igbo-Eze North",
    content: `Igbo-Eze North is a prominent Local Government Area in Enugu State, Nigeria, renowned for its rich agrarian economy, vibrant trading culture, and ancient traditions. Its administrative headquarters is situated at Ogrute. The LGA comprises over 33 autonomous communities and historic villages, including Amufie, Imufu, Umuida, Olido, Igugu, Aji, Essodo, Uda, Inyi, and Umuogbo-Agu. The people are proud descendants of Ezike Oba, celebrated for resilience, hospitality, and communal enterprise.`,
  },
  {
    id: "traditional_governance",
    topic: "governance",
    keywords: ["igwe", "onyishi", "elder", "umuada", "ndichie", "traditional ruler", "leadership", "governance"],
    title: "Traditional Leadership & Institutions",
    content: `Traditional administration in Igbo-Eze North operates with profound respect for age, ancestral lineage, and communal consensus:
• The Igwe: The royal father and traditional custodian of peace and culture across the autonomous community.
• The Onyishi: The oldest living man in the village or clan, revered as the direct link to the ancestors, holding the sacred Ofo staff of truth and justice.
• The Umuada: The powerful council of married and unmarried daughters of the clan, playing an indispensable role in peace arbitration, social ethics, and burial rites.
• Town Unions & Age Grades: Civic bodies that organize communal labor, roads maintenance, and security.`,
  },
  {
    id: "omabe_festival",
    topic: "culture",
    keywords: ["omabe", "masquerade", "festival", "culture", "tradition", "dance", "echaricha", "agba"],
    title: "The Sacred Omabe Masquerade Festival",
    content: `The Omabe festival is the most celebrated cultural event in Enugu Ezike, symbolizing the periodic visitation of ancestral spirits to bless the land with peace, fertility, and abundance. Featuring majestic masquerades like the agile Echaricha, the formidable Agba, and the revered Mgbedike, the festival draws thousands of indigenes and diaspora visitors back home for song, drum rhythms, and ancestral communion.`,
  },
  {
    id: "iri_ji_new_yam",
    topic: "culture",
    keywords: ["new yam", "iri ji", "iwaji", "harvest", "yam", "farming", "agriculture"],
    title: "Iri Ji (New Yam Festival)",
    content: `Celebrated between August and October, Iri Ji marks the arrival of the new harvest. Yam is regarded as the king of crops in Igbo-Eze North. Before new yam can be consumed, the community offers prayers of gratitude to Chukwu Okike (God the Creator) and the ancestors for rain and bountiful yields. The celebration features roasting of fresh tubers, seasoned with fresh red palm oil and local utazi pepper sauce.`,
  },
  {
    id: "market_calendar",
    topic: "markets",
    keywords: ["market", "eke", "oye", "afor", "nkwo", "trade", "shopping", "food", "palm oil", "amufie"],
    title: "Four Traditional Market Days & Local Commerce",
    content: `Local trade follows the traditional four-day Igbo week:
• Eke: Major markets include Eke Amufie and Eke Ogrute (renowned for palm wine, fresh yam, and cassava).
• Oye: Vibrant local trading at Oye Enugu Ezike and Oye Umuida.
• Afor: Famous for livestock, crafts, and wholesale agricultural produce.
• Nkwo: Bustling gathering at Nkwo Ogrute, where traders congregate for household goods and farm produce.
High-quality red palm oil, ogbono, garri, and honey from Igbo-Eze North are transported across Nigeria.`,
  },
  {
    id: "dialect_glossary",
    topic: "language",
    keywords: ["dialect", "language", "igbo", "deeme", "daalu", "kedu", "greeting", "words", "translation"],
    title: "Enugu Ezike Dialect Glossary & Greetings",
    content: `Everyday expressions and greetings in the Enugu Ezike dialect:
• "Deeme" / "Deeme o": Respectful greeting meaning "well done", "good day", or "greetings on your work".
• "Daalu": Thank you / appreciation.
• "Kedu": How are you? (Response: "Adim mma" — I am fine).
• "Onye Ezike": A son or daughter of Ezike Oba.
• "Nnoo": Welcome warmly.
• "Mma mma": Royal or elder salutation of reverence.
• "I nweela": Have you received it / congratulations.`,
  },
  {
    id: "platform_services",
    topic: "platform",
    keywords: ["verification", "blue badge", "golden badge", "jobs", "issues", "report", "ads", "fundraising", "projects"],
    title: "How to Use the Ezike Oba Digital Platform",
    content: `Ezike Oba provides integrated community tools:
• Verification: Apply at /verification. Golden Verification is reserved for Igwes, elders, and leaders; Blue Verification is for verified citizens, artisans, and professionals.
• Community Projects: Browse and donate to local roads, solar lights, and boreholes at /projects via Paystack.
• Local Jobs: Employers and jobseekers connect at /jobs with secure direct messaging.
• Marketplace: Buy and sell fresh farm produce, appliances, and goods at /marketplace.
• Community Issues: Geo-tag and report broken infrastructure with photos at /issues to prompt community intervention.
• Sponsored Ads: Promote your business with sponsored cards and marketplace banners via /admin/ads.`,
  },
];

export function queryCulturalKnowledge(query: string): string[] {
  const q = query.toLowerCase();
  const matched = IGBO_EZE_NORTH_KNOWLEDGE.filter((art) => {
    return art.keywords.some((k) => q.includes(k)) || art.title.toLowerCase().includes(q) || art.content.toLowerCase().includes(q);
  });

  if (matched.length === 0) {
    return [IGBO_EZE_NORTH_KNOWLEDGE[0].content, IGBO_EZE_NORTH_KNOWLEDGE[5].content];
  }

  return matched.map((m) => `### ${m.title}\n${m.content}`);
}