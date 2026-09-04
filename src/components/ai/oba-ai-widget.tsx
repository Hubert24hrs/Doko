"use client";

import React, { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { Bot, Sparkles, X, Send, Loader2, ArrowUpRight, MessageSquare, Compass } from "lucide-react";
import { askObaAiAction } from "@/features/ai/actions";

interface ChatMessage {
  role: "user" | "oba";
  text: string;
  sources?: string[];
  suggestions?: string[];
}

export function ObaAiWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "oba",
      text: "Deeme! I am Oba AI, your cultural and civic intelligence assistant for Igbo-Eze North. How can I help you today?",
      suggestions: [
        "Tell me about Omabe festival",
        "How do I get verified?",
        "Explain the four market days",
        "Community projects & donations",
      ],
    },
  ]);
  const [isPending, startTransition] = useTransition();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

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
            text: res.error || "Ndo (apologies), I encountered a moment of reflection. Please try again.",
          },
        ]);
      }
    });
  };

  return (
    <>
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 rounded-full bg-linear-to-r from-emerald-800 to-emerald-700 px-4 py-3 text-white shadow-2xl transition-all duration-300 hover:scale-105 hover:from-emerald-700 hover:to-emerald-600 border border-emerald-500/30"
          aria-label="Open Oba AI Assistant"
        >
          <div className="relative flex items-center justify-center">
            <Bot className="h-5 w-5 text-amber-300" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
            </span>
          </div>
          <span className="text-xs font-bold tracking-wide">Oba AI</span>
        </button>
      )}

      {/* Interactive Chat Window */}
      {isOpen && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[540px] w-[92vw] max-w-[400px] flex-col rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-2xl overflow-hidden transition-all duration-300">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-linear-to-r from-emerald-900 to-emerald-800 p-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/10 border border-amber-300/30 text-amber-300 shadow-inner">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-bold tracking-tight">Oba AI</h3>
                  <span className="rounded-full bg-amber-400/20 px-1.5 py-0.2 text-[10px] font-semibold text-amber-300">
                    Civic Guide
                  </span>
                </div>
                <p className="text-[11px] text-emerald-200">Igbo Eze North Intelligence</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Link
                href="/ai"
                className="rounded-xl p-1.5 text-emerald-200 hover:bg-white/10 hover:text-white transition-colors"
                title="Open full page"
              >
                <ArrowUpRight className="h-4 w-4" />
              </Link>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-xl p-1.5 text-emerald-200 hover:bg-white/10 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-3.5 leading-relaxed ${
                    m.role === "user"
                      ? "bg-emerald-800 text-white rounded-br-xs shadow-xs"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-bl-xs border border-zinc-200/60 dark:border-zinc-700/60 whitespace-pre-line"
                  }`}
                >
                  {m.text}
                </div>

                {/* Suggestion Chips */}
                {m.suggestions && m.suggestions.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5 max-w-[95%]">
                    {m.suggestions.map((sug, sIdx) => (
                      <button
                        key={sIdx}
                        onClick={() => handleSend(sug)}
                        disabled={isPending}
                        className="rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 text-[11px] text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors text-left"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isPending && (
              <div className="flex items-center gap-2 text-zinc-500 italic text-[11px] p-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                <span>Oba AI is reflecting...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="border-t border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50 dark:bg-zinc-950/80 flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about culture, markets, verification, projects..."
              disabled={isPending}
              className="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3.5 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
            />
            <button
              type="submit"
              disabled={isPending || !input.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-800 text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </form>
        </div>
      )}
    </>
  );
}