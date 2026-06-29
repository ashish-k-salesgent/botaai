import { Link } from "react-router-dom";
import { ArrowRight, Bot, MessagesSquare, ShieldCheck, Layers, Zap, BookOpen } from "lucide-react";

const LOGOS = [
  "https://images.unsplash.com/photo-1764344815160-0e2afc6939a0?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODl8MHwxfHNlYXJjaHwzfHxjb21wYW55JTIwbG9nbyUyMHdoaXRlJTIwYmFja2dyb3VuZHxlbnwwfHx8fDE3ODI2MzExOTJ8MA&ixlib=rb-4.1.0&q=85",
  "https://images.pexels.com/photos/21898300/pexels-photo-21898300.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  "https://images.pexels.com/photos/26576975/pexels-photo-26576975.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-[var(--text-primary)]">
      {/* Nav */}
      <header className="border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" data-testid="brand-logo">
            <div className="w-7 h-7 bg-[var(--brand-primary)] flex items-center justify-center">
              <span className="text-white font-display font-black text-sm">B</span>
            </div>
            <span className="font-display font-black text-xl tracking-tighter">BotAAI</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
            <a href="#features" className="hover:text-[var(--brand-primary)]">Product</a>
            <a href="#pricing" className="hover:text-[var(--brand-primary)]">Pricing</a>
            <a href="#widget" className="hover:text-[var(--brand-primary)]">Widget SDK</a>
            <Link to="/widget-demo" className="hover:text-[var(--brand-primary)]">Demo</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" data-testid="nav-login" className="text-sm font-medium px-4 py-2 hover:bg-[var(--bg-soft)]">
              Log in
            </Link>
            <Link
              to="/signup"
              data-testid="nav-signup"
              className="text-sm font-semibold px-4 py-2 bg-[var(--text-primary)] text-white hover:bg-black"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-[var(--border)]">
        <div className="absolute inset-0 grid-bg" />
        <div className="max-w-7xl mx-auto px-6 pt-20 pb-24 relative">
          <div className="grid lg:grid-cols-12 gap-10 items-end">
            <div className="lg:col-span-7">
              <div className="label-mono text-[var(--brand-primary)] mb-6">
                ✱ AI Customer Support · RAG · Live Chat · Tickets
              </div>
              <h1 className="font-display font-black tracking-tighter text-5xl sm:text-6xl lg:text-7xl leading-[0.92]">
                Customer support
                <br />
                <span className="text-[var(--brand-primary)]">that ships itself.</span>
              </h1>
              <p className="mt-6 text-[var(--text-secondary)] max-w-xl text-base leading-relaxed">
                BotAAI is a multi-tenant SaaS that gives every application its own AI agent,
                knowledge base, live chat console and Jira-style ticket board — embeddable in
                three lines of code.
              </p>
              <div className="mt-8 flex items-center gap-3">
                <Link
                  to="/signup"
                  data-testid="hero-cta-signup"
                  className="group inline-flex items-center gap-2 bg-[var(--brand-primary)] text-white px-5 py-3 text-sm font-semibold hover:bg-[var(--brand-primary-hover)]"
                >
                  Start 14-day trial
                  <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  to="/widget-demo"
                  data-testid="hero-cta-demo"
                  className="inline-flex items-center gap-2 border border-[var(--text-primary)] px-5 py-3 text-sm font-semibold hover:bg-[var(--text-primary)] hover:text-white"
                >
                  Try the widget
                </Link>
              </div>
              <div className="mt-6 flex items-center gap-4 text-xs text-[var(--text-muted)] font-mono">
                <span>✓ No credit card</span>
                <span>✓ Bring your own RAG</span>
                <span>✓ Self-serve API</span>
              </div>
            </div>

            <div className="lg:col-span-5">
              {/* Mock chat preview */}
              <div className="border border-[var(--text-primary)] bg-white">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-[var(--brand-success)]" />
                    <span className="label-mono">ERP · Live</span>
                  </div>
                  <span className="label-mono text-[var(--text-muted)]">BOTAAI-104</span>
                </div>
                <div className="p-4 space-y-3">
                  <ChatBubble who="bot" text="Hello Ashish 👋 How can I help today?" />
                  <ChatBubble who="user" text="Invoice is not generating." />
                  <ChatBubble
                    who="bot"
                    text="I'm sorry. I've classified this as a Bug · High. Would you like me to create a support ticket?"
                  />
                  <div className="flex gap-2">
                    <span className="border border-[var(--text-primary)] px-3 py-1 text-xs font-semibold">YES</span>
                    <span className="border border-[var(--border)] px-3 py-1 text-xs">NO</span>
                  </div>
                </div>
                <div className="px-4 py-2 border-t border-[var(--border)] flex justify-between label-mono text-[var(--text-muted)]">
                  <span>RAG hit · 0.82</span>
                  <span>Auto-ticket created</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Marquee */}
      <section className="border-b border-[var(--border)] py-6 overflow-hidden">
        <div className="flex items-center gap-12 marquee whitespace-nowrap">
          {[...Array(4)].flatMap((_, i) =>
            ["ERP", "Retail POS", "Restaurant POS", "Route Planning", "Warehouse", "Field Service"].map((x) => (
              <span key={`${i}-${x}`} className="label-mono text-[var(--text-muted)]">
                · {x}
              </span>
            ))
          )}
        </div>
      </section>

      {/* Features bento */}
      <section id="features" className="border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="grid lg:grid-cols-3 gap-6 mb-12">
            <div>
              <div className="label-mono text-[var(--brand-primary)] mb-3">/ Platform</div>
              <h2 className="font-display font-black tracking-tighter text-4xl">
                One platform. Every team.
              </h2>
            </div>
            <p className="lg:col-span-2 text-[var(--text-secondary)] text-base leading-relaxed">
              Multi-tenant by default. Every customer gets their own bot, knowledge base, tickets,
              live chat queue and admin dashboard — completely isolated, white-labeled, and
              embeddable inside any product.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-px bg-[var(--border)] border border-[var(--border)]">
            {[
              { i: Bot, t: "AI Agent (RAG)", d: "Gemini 3 Flash with bag-of-words retrieval. Confidence-aware fallback to ticket." },
              { i: BookOpen, t: "Knowledge Base", d: "PDFs, Markdown, FAQs, URLs. Auto chunk + embed. Per-tenant isolation." },
              { i: MessagesSquare, t: "Live Chat", d: "Agent console with claim/transfer/close. Auto convert chat to ticket." },
              { i: Layers, t: "Kanban Tickets", d: "9-column board. Drag, assign, comment, resolve. Jira meets Linear." },
              { i: Zap, t: "Auto-Classify", d: "Every message gets category, priority, sentiment & urgency score." },
              { i: ShieldCheck, t: "Multi-tenant SaaS", d: "Client ID + secret, trial → plan, super admin, full audit trail." },
            ].map((f) => (
              <div key={f.t} className="bg-white p-6 lg:col-span-2">
                <f.i size={20} className="text-[var(--brand-primary)] mb-4" />
                <div className="font-display font-bold text-lg mb-1">{f.t}</div>
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed">{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Widget SDK */}
      <section id="widget" className="border-b border-[var(--border)] bg-[var(--bg-soft)]">
        <div className="max-w-7xl mx-auto px-6 py-20 grid lg:grid-cols-2 gap-12">
          <div>
            <div className="label-mono text-[var(--brand-primary)] mb-3">/ Widget SDK</div>
            <h2 className="font-display font-black tracking-tighter text-4xl">
              Three lines. <br />Done.
            </h2>
            <p className="mt-4 text-[var(--text-secondary)] max-w-md">
              Drop the script, pass your Client ID, and the bot is live in the bottom-right of any
              application — themed to your brand.
            </p>
            <Link to="/widget-demo" data-testid="widget-demo-link" className="mt-6 inline-flex items-center gap-2 underline underline-offset-4 font-semibold">
              See live demo <ArrowRight size={14} />
            </Link>
          </div>
          <pre className="bg-[var(--text-primary)] text-white text-xs font-mono p-6 overflow-x-auto leading-relaxed">
{`<!-- Embed BotAAI in any application -->
<script
  src="https://botaai.io/widget.js"
  data-client="botaai_xxxxxxxxxxxx"
  data-secret="********************************"
  data-theme="dark"
></script>

// or initialize programmatically
window.BotAAI?.init({
  clientId: "botaai_xxxxxxxxxxxx",
  visitor: { name: "Ashish", email: "..." }
});`}
          </pre>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <div className="label-mono text-[var(--brand-primary)] mb-3">/ Pricing</div>
            <h2 className="font-display font-black tracking-tighter text-4xl">
              Start free. Scale forever.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: "Trial", price: "$0", period: "14 days", feats: ["1 Bot", "100 messages/day", "Unlimited tickets", "Email support"] },
              { name: "Growth", price: "$49", period: "/ month", feats: ["3 Bots", "10k messages/mo", "Live chat", "Custom branding"], featured: true },
              { name: "Enterprise", price: "Custom", period: "annual", feats: ["Unlimited bots", "SSO + SLA", "Dedicated infra", "24/7 support"] },
            ].map((p) => (
              <div
                key={p.name}
                className={`border p-6 ${p.featured ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-white" : "border-[var(--border)] bg-white"}`}
              >
                <div className="label-mono opacity-70">{p.name}</div>
                <div className="font-display font-black tracking-tighter text-5xl mt-3">{p.price}</div>
                <div className="text-sm opacity-70 mb-6">{p.period}</div>
                <ul className="space-y-2 text-sm mb-6">
                  {p.feats.map((f) => (
                    <li key={f} className="flex items-center gap-2">→ {f}</li>
                  ))}
                </ul>
                <Link
                  to="/signup"
                  data-testid={`pricing-${p.name.toLowerCase()}-cta`}
                  className={`block text-center py-2.5 text-sm font-semibold ${
                    p.featured ? "bg-white text-[var(--text-primary)]" : "bg-[var(--text-primary)] text-white"
                  }`}
                >
                  Get started
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trusted by */}
      <section className="border-b border-[var(--border)] py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="label-mono text-center text-[var(--text-muted)] mb-8">Trusted by builders</div>
          <div className="grid grid-cols-3 gap-6 max-w-3xl mx-auto opacity-70">
            {LOGOS.map((l, i) => (
              <div key={i} className="aspect-[3/1] bg-[var(--bg-soft)] overflow-hidden border border-[var(--border)]">
                <img src={l} className="w-full h-full object-cover grayscale" alt="" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[var(--text-primary)] text-white">
        <div className="max-w-5xl mx-auto px-6 py-24 text-center">
          <h2 className="font-display font-black tracking-tighter text-5xl">
            Ship support that ships itself.
          </h2>
          <p className="text-white/70 mt-4 max-w-xl mx-auto">
            14-day trial. No credit card. Your first ticket in five minutes.
          </p>
          <Link
            to="/signup"
            data-testid="footer-cta-signup"
            className="mt-8 inline-flex items-center gap-2 bg-white text-[var(--text-primary)] px-6 py-3 text-sm font-semibold hover:bg-[var(--brand-warning)]"
          >
            Start free trial <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-[var(--border)] py-8">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-xs text-[var(--text-muted)] font-mono">
          <span>© 2026 BotAAI</span>
          <span>Made with caffeine and crisp 1px borders</span>
        </div>
      </footer>
    </div>
  );
}

function ChatBubble({ who, text }) {
  if (who === "bot") {
    return (
      <div className="max-w-[85%] bg-[var(--bg-soft)] border border-[var(--border)] px-3 py-2 text-sm">
        {text}
      </div>
    );
  }
  return (
    <div className="max-w-[85%] ml-auto bg-[var(--text-primary)] text-white px-3 py-2 text-sm">
      {text}
    </div>
  );
}
