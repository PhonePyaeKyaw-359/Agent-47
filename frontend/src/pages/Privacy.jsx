import React from 'react';
import { Link } from 'react-router-dom';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-bg-base text-ink-primary font-sans">
      <nav className="w-full max-w-4xl mx-auto px-6 py-6 flex items-center justify-between border-b border-border">
        <Link to="/" className="font-semibold text-xl tracking-tight">Agent47</Link>
        <Link to="/" className="text-sm text-ink-secondary hover:text-ink-primary">Back to Home</Link>
      </nav>
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-semibold mb-8 tracking-tight">Privacy Policy</h1>
        <div className="space-y-6 text-[15px] leading-relaxed text-ink-secondary font-light">
          <p><strong>Last Updated: {new Date().toLocaleDateString()}</strong></p>
          <p>This Privacy Policy explains how Agent47 ("we", "us", or "our") collects, uses, and protects your information when you use our Google Workspace AI orchestration platform.</p>
          
          <h2 className="text-xl font-semibold text-ink-primary mt-8 mb-4">1. Information We Collect</h2>
          <p>Because Agent47 integrates directly with Google Workspace via OAuth, we request scopes to access your Gmail, Google Calendar, and Google Drive. We do NOT store your emails, documents, or calendar events permanently on our servers. Information is retrieved on-the-fly to provide context to the AI.</p>
          
          <h2 className="text-xl font-semibold text-ink-primary mt-8 mb-4">2. How We Use Information</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>To triage and summarize your Inbox.</li>
            <li>To manage and schedule your Calendar events.</li>
            <li>To synthesize and read your Google Docs.</li>
          </ul>

          <h2 className="text-xl font-semibold text-ink-primary mt-8 mb-4">3. Data Security and AI Models</h2>
          <p>We use Google Cloud services (such as Vertex AI and AlloyDB) for secure processing. Your Workspace data is passed directly to the Model Context Protocol (MCP) strictly for fulfilling your immediate prompts. We do not use your private enterprise data to train baseline AI models.</p>

          <h2 className="text-xl font-semibold text-ink-primary mt-8 mb-4">4. Google API User Data Policy</h2>
          <p>Agent47's use and transfer of information received from Google APIs to any other app will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-accent hover:underline" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>

          <h2 className="text-xl font-semibold text-ink-primary mt-8 mb-4">5. Contact Us</h2>
          <p>If you have questions about this policy, please contact us at support@agent47.example.com.</p>
        </div>
      </main>
    </div>
  );
}
