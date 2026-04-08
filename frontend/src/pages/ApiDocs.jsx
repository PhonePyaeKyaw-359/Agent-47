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
    path: '/run',
    description: 'Sends a natural language request to the assistant.',
    response: '{"response":"...","session_id":"...","user_id":"..."}',
  },
];

export default function ApiDocs() {
  return (
    <div className="min-h-screen bg-[#fbfbfd] text-ink-primary overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[520px] h-[520px] bg-blue-400/20 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute top-[18%] right-[-10%] w-[620px] h-[620px] bg-purple-400/15 rounded-full blur-[150px] pointer-events-none" />

      <header className="sticky top-0 z-20 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between rounded-[24px] border border-white/70 bg-white/75 px-6 py-4 backdrop-blur-2xl shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
          <Link to="/" className="flex items-center gap-3">
            <img src="/bot.png" alt="Agent47" className="h-10 w-10 object-contain mix-blend-multiply" />
            <span className="text-lg font-semibold tracking-tight">Agent47</span>
          </Link>
          <a
            href="https://workspace-ai-400859143635.us-central1.run.app/docs"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glow-lg"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            Open Backend Docs <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-10 relative z-10">
        <section className="max-w-3xl mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-50/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
            <Sparkles className="h-4 w-4" /> API Reference
          </div>
          <h1 className="mt-6 text-5xl md:text-7xl font-bold tracking-tighter leading-[0.95]">
            Read the routes before you jump to the backend docs.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-ink-secondary max-w-2xl leading-relaxed">
            This page explains the public routes exposed by the assistant so you know what each endpoint does before opening the generated backend docs page.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-[32px] border border-white/80 bg-white/65 backdrop-blur-2xl shadow-[0_24px_80px_rgba(0,102,204,0.08)] p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
              <BookOpen className="h-5 w-5 text-blue-600" />
              <h2 className="text-2xl font-semibold tracking-tight">Available Routes</h2>
            </div>
            <div className="space-y-4">
              {routes.map((route) => (
                <article key={route.path} className="rounded-[24px] border border-border/60 bg-white/75 p-5 transition-transform duration-300 hover:-translate-y-0.5">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">{route.method}</span>
                    <code className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-800">{route.path}</code>
                  </div>
                  <p className="text-base text-ink-primary font-medium">{route.description}</p>
                  <p className="mt-2 text-sm text-ink-secondary font-mono break-all">Example: {route.response}</p>
                </article>
              ))}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-[32px] border border-white/80 bg-white/70 backdrop-blur-2xl shadow-[0_24px_80px_rgba(0,102,204,0.08)] p-6">
              <div className="flex items-center gap-3 mb-4">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <h3 className="text-xl font-semibold tracking-tight">How to use it</h3>
              </div>
              <ul className="space-y-3 text-sm text-ink-secondary leading-relaxed">
                <li className="flex gap-2"><CircleDot className="mt-1 h-4 w-4 text-blue-600 shrink-0" />Use <span className="font-semibold text-ink-primary">/auth/login</span> to start authentication.</li>
                <li className="flex gap-2"><CircleDot className="mt-1 h-4 w-4 text-blue-600 shrink-0" />Use <span className="font-semibold text-ink-primary">/run</span> for chat and assistant requests.</li>
                <li className="flex gap-2"><CircleDot className="mt-1 h-4 w-4 text-blue-600 shrink-0" />Use <span className="font-semibold text-ink-primary">/run</span> for assistant requests and tool execution.</li>
              </ul>
            </div>

            <div className="rounded-[32px] border border-white/80 bg-gradient-to-br from-blue-600 to-cyan-500 p-6 text-white shadow-[0_24px_80px_rgba(0,102,204,0.18)]">
              <p className="text-sm uppercase tracking-[0.18em] text-white/80 font-semibold">Next step</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight">Open the backend docs when you need the raw schema.</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/90">
                This page gives the human-readable overview first. The backend docs page is one click away for the autogenerated interactive spec.
              </p>
              <a
                href="https://workspace-ai-400859143635.us-central1.run.app/docs"
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition-transform duration-300 hover:-translate-y-0.5"
              >
                Go to backend docs <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}