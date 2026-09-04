"use server";

import { createAnonymousClient } from "@/lib/supabase/server";
import { aiQuerySchema, AiResponse } from "./schemas";
import { queryCulturalKnowledge } from "./knowledge";

export async function askObaAiAction(
  prompt: string,
  villageContext?: string
): Promise<{ success: boolean; data?: AiResponse; error?: string }> {
  try {
    const parsed = aiQuerySchema.safeParse({ prompt, village_context: villageContext });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || "Invalid prompt" };
    }

    const { prompt: userPrompt } = parsed.data;
    const lower = userPrompt.toLowerCase();

    // 1. Gather Grounded Knowledge
    const relevantArticles = queryCulturalKnowledge(userPrompt);

    // 2. Perform Platform Live Context Search
    const liveContext: string[] = [];
    try {
      const supabase = createAnonymousClient();

      if (lower.includes("job") || lower.includes("work") || lower.includes("hire") || lower.includes("vacancy")) {
        const { data: jobs } = await supabase
          .from("jobs")
          .select("title, location_text, created_at")
          .limit(3);
        if (jobs && jobs.length > 0) {
          liveContext.push(
            `Recent jobs in Igbo Eze North: ${jobs.map((j) => `"${j.title}" at ${j.location_text || "Ogrute"}`).join("; ")}.`
          );
        }
      }

      if (lower.includes("market") || lower.includes("buy") || lower.includes("sell") || lower.includes("price") || lower.includes("product")) {
        const { data: items } = await supabase
          .from("marketplace_listings")
          .select("title, price, category")
          .limit(3);
        if (items && items.length > 0) {
          liveContext.push(
            `Marketplace listings: ${items.map((i) => `"${i.title}" (₦${i.price?.toLocaleString() || "Negotiable"})`).join("; ")}.`
          );
        }
      }

      if (lower.includes("issue") || lower.includes("road") || lower.includes("water") || lower.includes("borehole") || lower.includes("light")) {
        const { data: issues } = await supabase
          .from("community_issues")
          .select("title, status, category")
          .limit(3);
        if (issues && issues.length > 0) {
          liveContext.push(
            `Reported community issues: ${issues.map((i) => `"${i.title}" [Status: ${i.status}]`).join("; ")}.`
          );
        }
      }
    } catch {
      // Degrades gracefully if database is unreachable
    }

    // 3. Check for external Gemini API Key
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (apiKey) {
      try {
        const systemPrompt = `You are Oba AI, the wise, warm, and helpful digital community assistant for Igbo-Eze North LGA, Enugu State, Nigeria.
You speak with cultural pride and warmth, using authentic greetings like "Deeme" (well done) and "Daalu" (thank you).
Answer based on this grounded knowledge:
${relevantArticles.join("\n\n")}
${liveContext.length > 0 ? `\nLive Platform Data:\n${liveContext.join("\n")}` : ""}

Keep answers helpful, respectful, concise (2-4 paragraphs), and suggest relevant platform pages (e.g. /verification, /projects, /marketplace, /jobs, /issues).`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nUser Question: ${userPrompt}` }] }],
              generationConfig: { maxOutputTokens: 600, temperature: 0.7 },
            }),
          }
        );

        if (response.ok) {
          const json = await response.json();
          const generated = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (generated) {
            return {
              success: true,
              data: {
                reply: generated,
                sources: ["Grounded Igbo-Eze North Heritage Base", "Ezike Oba Civic Platform"],
                suggestions: getSmartSuggestions(lower),
              },
            };
          }
        }
      } catch (e) {
        console.warn("Gemini API call failed, falling back to local reasoning engine", e);
      }
    }

    // 4. Deterministic Contextual Reasoning Engine (100% Reliable Offline Fallback)
    const reply = generateLocalAiResponse(userPrompt, lower, relevantArticles, liveContext);

    return {
      success: true,
      data: {
        reply,
        sources: ["Ezike Oba Knowledge Base", "Igbo-Eze North Cultural Council"],
        suggestions: getSmartSuggestions(lower),
      },
    };
  } catch (err: unknown) {
    console.error("askObaAiAction error:", err);
    return { success: false, error: (err instanceof Error ? err.message : null) || "Failed to process question" };
  }
}

function generateLocalAiResponse(
  query: string,
  lower: string,
  articles: string[],
  liveContext: string[]
): string {
  let greeting = "Deeme nwanne m! (Greetings my brother/sister!)";
  if (lower.includes("morning") || lower.includes("kedu")) {
    greeting = "Deeme o! Kedu ka ime? Welcome to Oba AI.";
  }

  // Omabe Masquerade
  if (lower.includes("omabe") || lower.includes("masquerade")) {
    return `${greeting}\n\nThe **Omabe festival** is the crown jewel of cultural celebrations in Enugu Ezike and Igbo-Eze North. It represents the historic visitation of ancestral guardian spirits returning to bless the clans with health, fertile harvests, and social peace.\n\nDuring Omabe, masquerades such as **Echaricha** (the athletic dancer), **Agba**, and **Mgbedike** perform across the community squares accompanied by energetic *Ekwe* and *Ogene* drums. Indigenes from across Nigeria and the global diaspora return home to reunite with family and participate in ancestral reverence.`;
  }

  // Traditional Leadership / Onyishi / Igwe
  if (lower.includes("onyishi") || lower.includes("igwe") || lower.includes("leader") || lower.includes("governance") || lower.includes("elder")) {
    return `${greeting}\n\nIn Igbo-Eze North, governance is rooted in ancestral lineage and sacred gerontocracy:\n\n• **The Onyishi** is the oldest living male in the village or clan. He is revered as the spiritual patriarch, holding the sacred *Ofo* staff of justice and truth. Land disputes and ancestral peace accords are settled in his obi.\n• **The Igwe** serves as the royal monarch and administrative custodian of the autonomous community.\n• **The Umuada** (daughters of the clan) exercise profound authority in peace arbitration and social order.`;
  }

  // Market days
  if (lower.includes("market") || lower.includes("eke") || lower.includes("oye") || lower.includes("afor") || lower.includes("nkwo")) {
    return `${greeting}\n\nCommerce in Igbo-Eze North operates on the ancient four-day Igbo week:\n\n1. **Eke**: Major gatherings at **Eke Amufie** and **Eke Ogrute**, famous for fresh palm wine, newly harvested yam, and cassava.\n2. **Oye**: Active trade at **Oye Umuida** and **Oye Enugu Ezike**.\n3. **Afor**: Wholesale agricultural trading, livestock, and local crafts.\n4. **Nkwo**: Busiest at **Nkwo Ogrute**, serving as a hub for general merchandise and farm produce.\n\nYou can also explore or list fresh produce on our **[Marketplace](/marketplace)**!`;
  }

  // Verification & Badges
  if (lower.includes("verif") || lower.includes("badge") || lower.includes("golden") || lower.includes("blue")) {
    return `${greeting}\n\nEzike Oba provides a **Two-Tier Verification System** to establish civic trust:\n\n• **Golden Verification**: Reserved for traditional rulers (Igwes), Onyishis, elders, title holders, and public patrons.\n• **Blue Verification**: Granted to confirmed citizens, artisans, merchants, and active community contributors.\n\nYou can apply for verification in under 3 minutes directly at **[Get Verified](/verification)**.`;
  }

  // Community Projects & Donations
  if (lower.includes("project") || lower.includes("donate") || lower.includes("fund") || lower.includes("diaspora") || lower.includes("road") || lower.includes("borehole")) {
    const contextStr = liveContext.length > 0 ? `\n\n${liveContext.join("\n")}` : "";
    return `${greeting}\n\nThrough our newly launched **[Community Projects](/projects)** portal, citizens at home and across the diaspora can collaboratively crowdfund civic infrastructure in Igbo-Eze North.\n\nYou can contribute securely via **Paystack** (Card, Transfer, USSD) towards:\n• Community grading and tarring of rural access roads\n• Installation of solar streetlights in dark market squares\n• Drilling and rehabilitation of clean water boreholes\n• School classrooms and healthcare facility upgrades${contextStr}`;
  }

  // Jobs
  if (lower.includes("job") || lower.includes("hiring") || lower.includes("work")) {
    const contextStr = liveContext.length > 0 ? `\n\n${liveContext.join("\n")}` : "";
    return `${greeting}\n\nLooking for work or hiring in Igbo-Eze North? Visit our **[Jobs Board](/jobs)**. Local employers, traders, schools, and private enterprises post opportunities across Ogrute, Amufie, Imufu, and surrounding villages.${contextStr}`;
  }

  // General Grounded Answer
  const contextJoined = articles.slice(0, 2).join("\n\n");
  return `${greeting}\n\nI am **Oba AI**, your cultural and civic intelligence guide for Igbo-Eze North (Enugu Ezike).\n\n${contextJoined}\n\nFeel free to ask me about local history, the Omabe festival, market days, community projects, or how to get verified!`;
}

function getSmartSuggestions(lower: string): string[] {
  if (lower.includes("market")) {
    return ["What is Eke market day famous for?", "Explore fresh produce on Marketplace", "How to promote my shop with ads"];
  }
  if (lower.includes("project") || lower.includes("fund")) {
    return ["How to donate via Paystack", "View active borehole & solar projects", "How to submit a community project"];
  }
  if (lower.includes("omabe") || lower.includes("culture")) {
    return ["Explain the role of Onyishi", "Tell me about Iri Ji (New Yam)", "Common Enugu Ezike dialect phrases"];
  }
  return ["Tell me about Omabe festival", "How do I get verified?", "Where can I find jobs in Ogrute?", "Four traditional market days"];
}