import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, CircleDot, ExternalLink, ShieldCheck, Sparkles } from 'lucide-react';

const routes = [
  {
    method: 'GET',
    path: '/health',
    description: 'Health check for the service.',
    response: '{"status":"ok","version":"2.0.0"}',
  },
  {
    method: 'GET',
    path: '/auth/login?user_id=...',
    description: 'Builds an OAuth URL for a user.',
    response: '{"user_id":"...","auth_url":"https://accounts.google.com/..."}',
  },
  {
    method: 'GET',
    path: '/auth/status/{user_id}',
    description: 'Checks whether a user is authenticated.',
    response: '{"user_id":"...","authenticated":true}',
  },
  {
    method: 'POST',
    path: '/run',
    description: 'Sends a natural language request to the assistant.',
    response: '{"response":"...","session_id":"...","user_id":"..."}',
  },
  {
    method: 'POST',
    path: '/action',
    description: 'Directly executes a specific intent payload.',
    response: '{"response":"...","session_id":"...","user_id":"..."}',
  },
];

export default function ApiDocs() {
  return (
    <div className="min-h-screen relative bg-bg-base font-sans text-ink-primary overflow-x-hidden">
      {/* Ambient Light Orbs */}
      <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] bg-accent/20 rounded-full blur-[120px] pointer-events-none mix-blend-multiply" />
      <div className="fixed top-[20%] right-[-10%] w-[600px] h-[600px] bg-accent-dim/15 rounded-full blur-[150px] pointer-events-none mix-blend-multiply" />
      
      {/* Header */}
      <header className="sticky top-0 z-50 w-full bg-white/60 backdrop-blur-xl border-b border-white/60 shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3 transition-transform hover:scale-105 group">
            <div className="h-9 w-9 bg-white rounded-[10px] p-0.5 border border-white/80 shadow-sm flex items-center justify-center">
              <img src="/bot.png" alt="Agent47 Logo" className="h-[90%] w-[90%] object-contain" />
            </div>
            <span className="text-xl font-bold tracking-tight text-ink-primary font-display">Agent47</span>
          </Link>
          <a
            href="https://workspace-ai-400859143635.us-central1.run.app/docs"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 shadow-sm hover:shadow-[0_8px_24px_rgba(99,102,241,0.2)] bg-accent hover:bg-accent-dim"
          >
            Open Backend Docs <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-16 relative z-10">
        <section className="max-w-3xl mb-12 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-accent">
            <Sparkles className="h-4 w-4" /> API Reference
          </div>
          <h1 className="mt-6 text-5xl md:text-7xl font-bold tracking-tighter leading-tight font-display">
            Read the routes before you jump to the backend docs.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-ink-secondary max-w-2xl leading-relaxed font-medium">
            This page explains the public routes exposed by the assistant so you know what each endpoint does before opening the generated backend docs page.
          </p>
        </section>

        <section className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr] animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="rounded-[32px] border border-white/80 bg-white/60 backdrop-blur-2xl shadow-[0_8px_32px_rgba(99,102,241,0.06)] p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
              <BookOpen className="h-6 w-6 text-accent" />
              <h2 className="text-2xl font-bold tracking-tight font-display">Available Routes</h2>
            </div>
            <div className="space-y-4">
              {routes.map((route) => (
                <article key={route.path} className="rounded-[24px] border border-white/60 bg-white/80 p-5 transition-all duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-[0_8px_24px_rgba(99,102,241,0.08)]">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-white">{route.method}</span>
                    <code className="rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent/80 border border-accent/20">{route.path}</code>
                  </div>
                  <p className="text-base text-ink-primary font-medium">{route.description}</p>
                  <p className="mt-3 text-sm text-ink-secondary font-mono break-all bg-white/50 p-2 rounded-lg border border-white/60 shadow-inner">Example: {route.response}</p>
                </article>
              ))}
            </div>
          </div>

          <aside className="space-y-8">
            <div className="rounded-[32px] border border-white/80 bg-white/60 backdrop-blur-2xl shadow-[0_8px_32px_rgba(99,102,241,0.06)] p-8">
              <div className="flex items-center gap-3 mb-5">
                <ShieldCheck className="h-6 w-6 text-cta" />
                <h3 className="text-xl font-bold tracking-tight font-display">How to use it</h3>
              </div>
              <ul className="space-y-4 text-[15px] text-ink-secondary font-medium leading-relaxed">
                <li className="flex gap-3"><CircleDot className="mt-1 h-4 w-4 text-accent shrink-0" /><span>Use <span className="font-bold text-ink-primary">/auth/login</span> to start authentication.</span></li>
                <li className="flex gap-3"><CircleDot className="mt-1 h-4 w-4 text-accent shrink-0" /><span>Use <span className="font-bold text-ink-primary">/run</span> for chat and assistant requests.</span></li>
                <li className="flex gap-3"><CircleDot className="mt-1 h-4 w-4 text-accent shrink-0" /><span>Use <span className="font-bold text-ink-primary">/action</span> for executing intents via form payloads.</span></li>
              </ul>
            </div>

            <div className="rounded-[32px] border border-white/20 bg-gradient-to-br from-accent to-accent-dim p-8 text-white shadow-[0_16px_40px_rgba(99,102,241,0.2)]">
              <p className="text-xs uppercase tracking-widest text-white/80 font-bold mb-3">Next step</p>
              <h3 className="text-2xl font-bold tracking-tight font-display leading-tight">Open the backend docs when you need the raw schema.</h3>
              <p className="mt-4 text-[15px] leading-relaxed text-white/90 font-medium">
                This page gives the human-readable overview first. The backend docs page is one click away for the autogenerated interactive spec.
              </p>
              <a
                href="https://workspace-ai-400859143635.us-central1.run.app/docs"
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-[15px] font-bold text-accent transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg w-full sm:w-auto"
              >
                Go to backend docs <ArrowRight className="h-5 w-5" />
              </a>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}