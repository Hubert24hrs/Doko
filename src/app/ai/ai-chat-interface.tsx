"use client";

import React, { useState, useTransition, useRef, useEffect } from "react";
import { Bot, Send, Loader2, Sparkles, BookOpen, MapPin, CheckCircle2, ChevronRight } from "lucide-react";
import { askObaAiAction } from "@/features/ai/actions";

interface ChatMessage {
  role: "user" | "oba";
  text: string;
  sources?: string[];
  suggestions?: string[];
}

export function AiChatInterface() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "oba",
      text: "Nnoo! Deeme nwanne m. I am Oba AI, your digital cultural custodian and civic guide for Igbo-Eze North.\n\nWhether you are inquiring about our sacred traditions like the Omabe festival, governance under the Onyishi and Igwe, local market days (Eke, Oye, Afor, Nkwo), community development projects, or how to get verified — I am here to assist you.",
      suggestions: [
        "Explain the history and villages of Igbo Eze North",
        "How does traditional governance with Onyishi and Umuada work?",
        "Tell me about the Omabe Masquerade Festival",
        "How can I contribute to local community projects?",
      ],
    },
  ]);
  const [isPending, startTransition] = useTransition();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (textToSend?: string) => {
    const prompt = (textToSend || input).trim();
    if (!prompt || isPending) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: prompt }]);

    startTransition(async () => {
      const res = await askObaAiAction(prompt);
      if (res.success && res.data) {
        setMessages((prev) => [
          ...prev,
          {
            role: "oba",
            text: res.data!.reply,
            sources: res.data!.sources,
            suggestions: res.data!.suggestions,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "oba",
            text: res.error || "Apologies, I encountered an error while consulting our knowledge base. Please ask again.",
          },
        ]);
      }
    });
  };

  return (
    <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden flex flex-col h-[650px]">
      {/* Top Banner */}
      <div className="bg-linear-to-r from-emerald-900 via-emerald-800 to-emerald-900 p-4 text-white flex items-center justify-between border-b border-emerald-700/50">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold flex items-center gap-2">
              <span>Oba AI Interactive Console</span>
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            </h2>
            <p className="text-[11px] text-emerald-200">Grounded in 33+ Autonomous Communities</p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-emerald-200">
          <BookOpen className="h-4 w-4" />
          <span>Cultural & Civic Mode</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[85%] sm:max-w-[75%] rounded-3xl p-4 leading-relaxed text-sm ${
                m.role === "user"
                  ? "bg-emerald-800 text-white rounded-br-xs shadow-md"
                  : "bg-zinc-100 dark:bg-zinc-800/90 text-zinc-800 dark:text-zinc-200 rounded-bl-xs border border-zinc-200 dark:border-zinc-700/80 whitespace-pre-line shadow-xs"
              }`}
            >
              {m.text}
            </div>

            {m.sources && m.sources.length > 0 && (
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-400">
                <span className="font-semibold">Sources:</span>
                <span>{m.sources.join(" • ")}</span>
              </div>
            )}

            {m.suggestions && m.suggestions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 max-w-[85%]">
                {m.suggestions.map((sug, sIdx) => (
                  <button
                    key={sIdx}
                    onClick={() => handleSend(sug)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-3 py-1 text-xs text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors shadow-2xs"
                  >
                    <span>{sug}</span>
                    <ChevronRight className="h-3 w-3 opacity-60" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {isPending && (
          <div className="flex items-center gap-2.5 text-zinc-500 italic text-xs p-3">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
            <span>Oba AI is consulting the elders and cultural archives...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/70 flex items-center gap-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about Igbo Eze North (e.g. Omabe, Onyishi, markets, verification)..."
          disabled={isPending}
          className="flex-1 rounded-2xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-600 shadow-inner"
        />
        <button
          type="submit"
          disabled={isPending || !input.trim()}
          className="inline-flex items-center gap-2 rounded-2xl bg-emerald-800 hover:bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition-colors disabled:opacity-40 shadow-md"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span className="hidden sm:inline">Ask Oba</span>
        </button>
      </form>
    </div>
  );
}