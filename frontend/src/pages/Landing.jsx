import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Mail, Calendar, FileText, Brain, Mic, Shield, Sparkles, Bot } from 'lucide-react';

export default function Landing() {
  const words = ["study.", "work.", "emails.", "life."];
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((current) => (current + 1) % words.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [words.length]);

  return (
    <div className="min-h-screen relative flex flex-col bg-[#fbfbfd] text-ink-primary font-sans overflow-hidden">
      {/* Ambient Light Orbs for Futuristic Vibe */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-400/20 rounded-full blur-[120px] pointer-events-none mix-blend-multiply" />
      <div className="absolute top-[20%] right-[-10%] w-[600px] h-[600px] bg-purple-400/15 rounded-full blur-[150px] pointer-events-none mix-blend-multiply" />
      <div className="absolute bottom-[0%] left-[20%] w-[800px] h-[500px] bg-cyan-400/10 rounded-full blur-[150px] pointer-events-none mix-blend-multiply" />

      {/* Futuristic Floating Navbar */}
      <div className="fixed top-0 left-0 right-0 w-full z-50 px-6 py-4">
        <nav className="w-full max-w-6xl mx-auto px-6 py-3 bg-white/70 backdrop-blur-2xl border border-white/50 shadow-[0_4px_24px_rgba(0,0,0,0.02)] rounded-[24px] flex items-center justify-between animate-fade-in-up">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-transparent flex items-center justify-center">
              <img src="/bot.png" alt="Agent47 Logo" className="h-[120%] w-[120%] object-contain mix-blend-multiply" />
            </div>
            <span className="text-xl font-semibold tracking-tight text-ink-primary">Agent47</span>
          </div>
          <div className="flex items-center gap-8">
            <Link to="/api-docs" className="text-[14px] font-medium text-ink-secondary hover:text-ink-primary transition-colors hidden md:block">API Docs</Link>
            <a href="#features" className="text-[14px] font-medium text-ink-secondary hover:text-ink-primary transition-colors hidden md:block">Features</a>
            <Link 
              to="/login"
              className="px-6 py-2.5 rounded-full text-[14px] font-medium text-white transition-all duration-300 hover:shadow-glow hover:-translate-y-0.5 active:scale-95"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              Sign In
            </Link>
          </div>
        </nav>
      </div>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pt-40 pb-32 text-center z-10 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
        
        {/* Agent Symbol Profile */}
        <div className="relative mb-10 group animate-float-breathe">
          <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/20 to-purple-500/20 blur-2xl rounded-[40px] scale-125 group-hover:scale-150 transition-transform duration-700" />
          <div className="relative h-28 w-28 bg-transparent flex items-center justify-center hover:-translate-y-2 transition-transform duration-500">
            <img src="/bot.png" alt="Agent47 Core Symbol" className="h-[120%] w-[120%] object-contain mix-blend-multiply drop-shadow-[0_16px_32px_rgba(0,102,204,0.2)]" />
          </div>
        </div>

        {/* Release Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-500/20 bg-blue-50/50 backdrop-blur-md mb-8 shadow-sm">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span className="text-[13px] font-semibold tracking-wide text-blue-600 uppercase">Next-Gen Workspace Intelligence</span>
        </div>

        <h1 className="text-6xl md:text-[84px] font-bold text-ink-primary tracking-tighter leading-[1] mb-8 max-w-5xl flex flex-col md:flex-row items-center justify-center gap-x-5">
          <span>Your AI sidekick for</span>
          <div className="relative h-[1.1em] w-[220px] md:w-[300px] overflow-hidden -mt-1 md:mt-0 text-left">
            <div 
              className="absolute top-0 left-0 flex flex-col transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
              style={{ transform: `translateY(-${wordIndex * 1.1}em)` }}
            >
              {words.map((word, i) => (
                <span key={i} className="animate-gradient-x bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-purple-500 to-cyan-500 h-[1.1em] flex items-center leading-[1.1em]">
                  {word}
                </span>
              ))}
            </div>
          </div>
        </h1>
        
        <p className="text-xl md:text-[22px] text-gray-800 max-w-2xl mb-14 leading-relaxed font-medium tracking-tight drop-shadow-sm z-10 relative">
          Draft emails, nail your assignments, and organize your chaotic schedule effortlessly. Agent47 does the heavy computing so you don't have to.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-5">
          <Link 
            to="/login"
            className="px-8 py-4 rounded-full text-lg font-medium text-white flex items-center justify-center gap-2 transition-all duration-300 hover:shadow-glow-lg hover:-translate-y-1 active:scale-95 group relative overflow-hidden"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
            <span className="relative z-10 flex items-center gap-2">
              Try Agent47 Free
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1.5 transition-transform" />
            </span>
          </Link>
          <Link
            to="/api-docs"
            className="px-8 py-4 rounded-full text-lg font-medium border border-border bg-white/75 text-ink-primary flex items-center justify-center gap-2 transition-all duration-300 hover:-translate-y-1 active:scale-95"
          >
            API Docs
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </main>

      {/* Interactive Feature Hub */}
      <section id="features" className="w-full max-w-7xl mx-auto px-6 py-32 relative z-10">
        <div className="text-center mb-24">
          <h2 className="text-5xl font-bold text-ink-primary tracking-tighter mb-5">Command your digital life.</h2>
          <p className="text-xl text-ink-secondary max-w-2xl mx-auto font-light tracking-tight">Step away from clunky dashboards. Orchestrate everything seamlessly.</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-12 lg:gap-20 items-stretch">
          {/* Left Menu */}
          <div className="w-full lg:w-1/3 flex flex-col justify-center relative">
            <div className="absolute left-[25px] top-6 bottom-6 w-[2px] bg-border/40 rounded-full" />
            
            {[
              {
                icon: Mail, color: '#0066cc', title: 'Tame your Inbox',
                desc: 'Let AI draft replies to professors or bosses, and instantly summarize those 50-message email chains.'
              },
              {
                icon: Calendar, color: '#ff9500', title: 'Never Miss a Deadline',
                desc: 'Automatically sync your class schedules, work meetings, and assignment due dates all in one place.'
              },
              {
                icon: Brain, color: '#af52de', title: 'Perfect Memory',
                desc: 'Agent47 remembers everything you tell it. Retrieve that one brilliant idea you had yesterday with a simple text.'
              },
              {
                icon: FileText, color: '#34c759', title: 'Write Better, Faster',
                desc: 'Instantly generate outlines for essays, format your work reports, and find files hidden deep in your Drive.'
              },
              {
                icon: Mic, color: '#ff2d55', title: 'Hands-Free Voice',
                desc: 'Tired of typing? Just talk. Brainstorm essays aloud or dictate emails, and let AI transcribe it perfectly.'
              },
              {
                icon: Shield, color: '#8e8e93', title: '100% Private',
                desc: 'Your class notes, work documents, and personal emails are completely secure and never shared.'
              }
            ].map((feature, i) => (
              <button
                key={i}
                onMouseEnter={() => setWordIndex(i)} // Re-using state for the active tab to save memory
                onClick={() => setWordIndex(i)}
                className={`relative flex items-center gap-8 p-5 rounded-[24px] transition-all duration-500 text-left cursor-pointer outline-none ${wordIndex === i ? 'bg-white/80 shadow-[0_8px_32px_rgba(0,0,0,0.04)] backdrop-blur-xl scale-[1.02] z-10 border border-white/60' : 'hover:bg-white/40 opacity-60 hover:opacity-100 hover:scale-[1.01] z-0 border border-transparent'}`}
              >
                <div className={`w-3 h-3 rounded-full shrink-0 transition-all duration-500 shadow-sm ${wordIndex === i ? 'scale-125' : 'bg-transparent border border-ink-muted scale-100'}`} style={{ backgroundColor: wordIndex === i ? feature.color : 'transparent' }} />
                <span className={`text-[22px] font-semibold tracking-tight transition-colors duration-300 ${wordIndex === i ? 'text-ink-primary' : 'text-ink-secondary'}`}>{feature.title}</span>
              </button>
            ))}
          </div>

          {/* Right Display Glass Panel */}
          <div className="w-full lg:w-2/3 min-h-[500px] relative rounded-[48px] overflow-hidden bg-white/40 backdrop-blur-3xl border border-white/80 shadow-[0_32px_80px_rgba(0,102,204,0.08)] flex flex-col items-center justify-center p-12 text-center transition-all duration-700 ease-out">
            {/* Dynamic Background Glow mapped to feature array */}
            <div 
              className="absolute inset-0 opacity-20 blur-[100px] transition-colors duration-1000 ease-in-out" 
              style={{ backgroundColor: [
                '#0066cc', '#ff9500', '#af52de', '#34c759', '#ff2d55', '#8e8e93'
              ][wordIndex % 6] }} 
            />
            
            <div className="relative z-10">
              {(() => {
                const features = [
                  { icon: Mail, color: '#0066cc', title: 'Tame your Inbox', desc: 'Let AI draft replies to professors or bosses, and instantly summarize those 50-message email chains.' },
                  { icon: Calendar, color: '#ff9500', title: 'Never Miss a Deadline', desc: 'Automatically sync your class schedules, work meetings, and assignment due dates all in one place.' },
                  { icon: Brain, color: '#af52de', title: 'Perfect Memory', desc: 'Agent47 remembers everything you tell it. Retrieve that one brilliant idea you had yesterday with a simple text.' },
                  { icon: FileText, color: '#34c759', title: 'Write Better, Faster', desc: 'Instantly generate outlines for essays, format your work reports, and find files hidden deep in your Drive.' },
                  { icon: Mic, color: '#ff2d55', title: 'Hands-Free Voice', desc: 'Tired of typing? Just talk. Brainstorm essays aloud or dictate emails, and let AI transcribe it perfectly.' },
                  { icon: Shield, color: '#8e8e93', title: '100% Private', desc: 'Your class notes, work documents, and personal emails are completely secure and never shared.' }
                ];
                const activeFeature = features[wordIndex % 6];
                const IconComponent = activeFeature.icon;

                return (
                  <div className="flex flex-col items-center animate-fade-in-up" key={activeFeature.title}>
                    <div className="h-32 w-32 rounded-[32px] flex items-center justify-center mb-10 transition-transform duration-700 hover:scale-110 shadow-lg" style={{ backgroundColor: `${activeFeature.color}15`, border: `1px solid ${activeFeature.color}30` }}>
                      <IconComponent className="w-14 h-14" style={{ color: activeFeature.color }} />
                    </div>
                    <h3 className="text-4xl md:text-5xl font-bold text-ink-primary tracking-tighter mb-8">{activeFeature.title}</h3>
                    <p className="text-xl md:text-2xl text-ink-secondary leading-relaxed font-light max-w-xl">{activeFeature.desc}</p>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full bg-white/50 backdrop-blur-lg py-12 text-center z-10 text-[13px] text-ink-muted border-t border-border/50 mt-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-2 mb-4 md:mb-0 font-medium">
            <Bot className="w-5 h-5" /> Agent47
          </div>
          <div className="flex gap-8">
            <Link to="/api-docs" className="hover:text-ink-primary cursor-pointer transition-colors">Documentation</Link>
            <Link to="/privacy" className="hover:text-ink-primary cursor-pointer transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-ink-primary cursor-pointer transition-colors">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
