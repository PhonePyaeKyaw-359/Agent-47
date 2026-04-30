import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Mail, Calendar, FileText, Brain, Mic, Shield, Bot } from 'lucide-react';
import { Button } from '../components/Button';

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
    <div className="min-h-screen relative flex flex-col bg-canvas text-ink font-sans overflow-x-hidden">
      
      {/* Global Nav */}
      <div className="fixed top-0 left-0 right-0 w-full z-50 bg-surface-black h-[44px] flex items-center justify-center">
        <nav className="w-full max-w-5xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer text-body-on-dark hover:opacity-80 transition-opacity">
            <Bot className="w-[14px] h-[14px]" />
          </div>
          <div className="flex items-center gap-8 text-[12px] text-body-on-dark tracking-[-0.01em]">
            <Link to="/api-docs" className="hover:opacity-80 transition-opacity hidden md:block">API Docs</Link>
            <a href="#features" className="hover:opacity-80 transition-opacity hidden md:block">Features</a>
            <Link to="/login" className="hover:opacity-80 transition-opacity">Sign In</Link>
          </div>
        </nav>
      </div>

      {/* Sub-nav Frosted (Sticky) */}
      <div className="sticky top-[44px] left-0 right-0 w-full z-40 bg-canvas/80 backdrop-blur-xl border-b border-divider-soft h-[52px] flex items-center justify-center">
        <div className="w-full max-w-5xl mx-auto px-4 flex items-center justify-between">
          <span className="text-[21px] font-semibold text-ink tracking-[0.011em]">Agent47</span>
          <div className="flex items-center gap-4">
            <span className="text-[14px] text-ink font-normal hidden sm:block">From $0/mo</span>
            <Link to="/login">
              <Button variant="primary" size="sm" className="px-3 py-1">Try Free</Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Hero Section (Product Tile Light) */}
      <section className="w-full bg-canvas pt-[80px] pb-[80px] flex flex-col items-center text-center px-4">
        <h1 className="text-[56px] md:text-[84px] font-semibold text-ink tracking-hero leading-[1.07] mb-2 max-w-4xl font-display">
          Your AI sidekick for <br className="md:hidden" />
          <span className="inline-flex relative w-[180px] md:w-[280px] overflow-hidden justify-center align-top" style={{ height: '1.07em' }}>
            <span 
              className="absolute top-0 flex flex-col transition-transform duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)] w-full"
              style={{ transform: `translateY(-${wordIndex * 1.07}em)` }}
            >
              {words.map((word, i) => (
                <span key={i} className="h-[1.07em] flex items-center justify-center text-ink">
                  {word}
                </span>
              ))}
            </span>
          </span>
        </h1>
        
        <p className="text-[28px] text-ink font-normal max-w-2xl mb-8 leading-[1.14] tracking-[0.007em]">
          Draft emails, nail your assignments, and organize your chaotic schedule effortlessly.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 mb-[64px]">
          <Link to="/login">
            <Button variant="primary" size="lg">Try Agent47 Free</Button>
          </Link>
          <Link to="/api-docs">
            <Button variant="secondary-pill" size="lg">Learn more</Button>
          </Link>
        </div>

        {/* Product Imagery */}
        <div className="w-full max-w-3xl aspect-video rounded-[18px] bg-canvas-parchment flex items-center justify-center shadow-product mt-4 overflow-hidden relative">
          <img src="/bot.png" alt="Agent47" className="w-64 h-64 object-contain mix-blend-multiply" />
        </div>
      </section>

      {/* Alternating Feature Tiles */}
      <section id="features" className="w-full flex flex-col">
        
        {/* Feature 1 (Dark Tile) */}
        <div className="w-full bg-surface-tile-1 text-body-on-dark py-[80px] flex flex-col items-center text-center px-4">
          <h2 className="text-[40px] font-semibold tracking-display leading-[1.1] mb-2 font-display">
            Tame your Inbox.
          </h2>
          <p className="text-[21px] text-body-muted font-normal max-w-2xl mb-8 leading-[1.19] tracking-[0.011em]">
            Let AI draft replies to professors or bosses, and instantly summarize those 50-message email chains.
          </p>
          <Link to="/login" className="text-primary-on-dark text-[17px] hover:underline flex items-center gap-1">
            Learn more <ArrowRight className="w-4 h-4" />
          </Link>
          
          <div className="mt-12 w-full max-w-4xl mx-auto flex justify-center">
             <div className="w-64 h-64 bg-surface-tile-3 rounded-[18px] flex items-center justify-center shadow-product">
               <Mail className="w-24 h-24 text-body-on-dark opacity-50" />
             </div>
          </div>
        </div>

        {/* Feature 2 (Parchment Tile) */}
        <div className="w-full bg-canvas-parchment text-ink py-[80px] flex flex-col items-center text-center px-4">
          <h2 className="text-[40px] font-semibold tracking-display leading-[1.1] mb-2 font-display">
            Never Miss a Deadline.
          </h2>
          <p className="text-[21px] text-ink-muted-80 font-normal max-w-2xl mb-8 leading-[1.19] tracking-[0.011em]">
            Automatically sync your class schedules, work meetings, and assignment due dates all in one place.
          </p>
          <Link to="/login" className="text-primary text-[17px] hover:underline flex items-center gap-1">
            Sync Calendar <ArrowRight className="w-4 h-4" />
          </Link>

          <div className="mt-12 w-full max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="bg-canvas border border-hairline rounded-[18px] p-[24px] flex flex-col items-center text-center h-64 justify-center">
               <Calendar className="w-16 h-16 text-ink opacity-80 mb-4" />
               <h3 className="text-[17px] font-semibold tracking-apple">Smart Scheduling</h3>
             </div>
             <div className="bg-canvas border border-hairline rounded-[18px] p-[24px] flex flex-col items-center text-center h-64 justify-center">
               <Brain className="w-16 h-16 text-ink opacity-80 mb-4" />
               <h3 className="text-[17px] font-semibold tracking-apple">Perfect Memory</h3>
             </div>
          </div>
        </div>

        {/* Feature 3 (Light Tile) */}
        <div className="w-full bg-canvas text-ink py-[80px] flex flex-col items-center text-center px-4 border-t border-divider-soft">
          <h2 className="text-[40px] font-semibold tracking-display leading-[1.1] mb-2 font-display">
            Write Better, Faster.
          </h2>
          <p className="text-[21px] text-ink-muted-80 font-normal max-w-2xl mb-8 leading-[1.19] tracking-[0.011em]">
            Instantly generate outlines for essays, format your work reports, and find files hidden deep in your Drive.
          </p>
          
          <div className="mt-12 w-full max-w-4xl mx-auto flex justify-center">
             <div className="w-full max-w-2xl bg-canvas-parchment rounded-[18px] flex flex-col items-center justify-center p-12 shadow-product">
               <FileText className="w-20 h-20 text-ink opacity-50 mb-6" />
               <Button variant="primary">Start Writing</Button>
             </div>
          </div>
        </div>

      </section>

      {/* Footer */}
      <footer className="w-full bg-canvas-parchment py-[64px] text-[12px] text-ink-muted-48 border-t border-hairline mt-auto">
        <div className="max-w-5xl mx-auto px-4 flex flex-col items-center md:items-start">
          <div className="w-full flex flex-col md:flex-row items-center justify-between pb-8 border-b border-hairline mb-4">
            <div className="flex items-center gap-2 font-semibold text-ink-muted-80 mb-4 md:mb-0">
               <Bot className="w-4 h-4" /> Agent47
            </div>
            <div className="flex gap-4">
              <Link to="/api-docs" className="hover:text-ink-muted-80 transition-colors">API Docs</Link>
              <Link to="/login" className="hover:text-ink-muted-80 transition-colors">Sign In</Link>
            </div>
          </div>
          
          <div className="w-full flex flex-col md:flex-row justify-between items-center text-[12px]">
            <p>Copyright © 2026 Agent47 Inc. All rights reserved.</p>
            <div className="flex gap-4 mt-4 md:mt-0">
              <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
              <span className="text-divider-soft">|</span>
              <Link to="/terms" className="hover:underline">Terms of Use</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
