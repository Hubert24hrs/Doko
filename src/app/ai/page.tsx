import React from "react";
import { AiChatInterface } from "./ai-chat-interface";
import { Sparkles, Compass, ShieldCheck, MapPin } from "lucide-react";

export const metadata = {
  title: "Oba AI • Civic Intelligence | Ezike Oba",
  description: "Cultural guide and civic assistant grounded in Igbo Eze North history, traditions, and platform services.",
};

export default function ObaAiPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Hero Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-xs font-semibold mb-3 border border-emerald-200 dark:border-emerald-800">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span>Igbo Eze North Cultural Intelligence</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-zinc-900 dark:text-zinc-50 tracking-tight">
          Oba AI Assistant
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 max-w-lg mx-auto leading-relaxed">
          Ask questions about Enugu Ezike culture, traditional institutions, Omabe festival, market schedules, local jobs, and civic services.
        </p>
      </div>

      <AiChatInterface />
    </div>
  );
}