import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clipboard,
  Clock3,
  Copy,
  FileText,
  Heart,
  History,
  LayoutTemplate,
  Loader2,
  Menu,
  Moon,
  PanelLeft,
  PenLine,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react';
import {
  useAnalyzePrompt,
  useGeneratePrompt,
  useHealthCheck,
  useImprovePrompt,
  useOptimizePrompt,
  useRunPlayground,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';

const queryClient = new QueryClient();
const HISTORY_KEY = 'promptly-history-v1';
const DRAFT_KEY = 'promptly-draft-v1';
const PREFS_KEY = 'promptly-prefs-v1';

const templates = [
  { id: 'research-brief', label: 'Research brief', type: 'Research', title: 'Turn a question into a useful research brief', description: 'Frame a research question, surface the right sources, and make the output easy to act on.', prompt: 'I need to research a topic and turn what I learn into a clear brief for a product team.' },
  { id: 'launch-copy', label: 'Launch copy', type: 'Writing', title: 'Write launch copy with a point of view', description: 'Give a writer the context and constraints to find a sharper angle, not more filler.', prompt: 'Write launch copy for a new product. Make it specific, confident, and grounded in the audience problem.' },
  { id: 'product-spec', label: 'Product spec', type: 'Product', title: 'Shape a product idea into a spec', description: 'Move from a half-formed feature idea to a brief with decisions, edge cases, and acceptance criteria.', prompt: 'Help me turn this feature idea into a concise product specification for engineering and design.' },
  { id: 'content-system', label: 'Content system', type: 'Strategy', title: 'Design a repeatable content system', description: 'Create an operating rhythm with inputs, quality bars, and reusable formats.', prompt: 'Design a practical content system for a small team that needs to publish consistently without losing its voice.' },
  { id: 'decision-memo', label: 'Decision memo', type: 'Leadership', title: 'Make a decision memo people can scan', description: 'Clarify the decision, trade-offs, evidence, and recommendation in one focused document.', prompt: 'Turn this messy set of notes into a decision memo that makes the recommendation and trade-offs clear.' },
  { id: 'interview-guide', label: 'Interview guide', type: 'Research', title: 'Ask better questions in user interviews', description: 'Build an interview guide that tests assumptions without leading the person you are talking to.', prompt: 'Create a thoughtful user interview guide to understand how people currently solve this problem.' },
];

function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function cn(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function Button({ children, variant = 'primary', className, ...props }: { children: ReactNode; variant?: 'primary' | 'quiet' | 'outline' | 'danger'; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2.5 text-[12px] font-bold tracking-[-.01em] transition-all duration-200 disabled:pointer-events-none disabled:opacity-45',
        variant === 'primary' && 'bg-primary text-primary-foreground hover:brightness-110 active:scale-[.98]',
        variant === 'quiet' && 'text-muted-foreground hover:bg-muted hover:text-foreground',
        variant === 'outline' && 'border border-border bg-card text-foreground hover:border-primary/50 hover:bg-muted',
        variant === 'danger' && 'border border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/15',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function IconButton({ label, children, className, ...props }: { label: string; children: ReactNode; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button aria-label={label} data-testid={`button-${label.toLowerCase().replaceAll(' ', '-')}`} className={cn('inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', className)} {...props}>{children}</button>;
}

function Tag({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'green' | 'yellow' | 'coral' }) {
  const tones = {
    muted: 'bg-muted text-muted-foreground',
    green: 'bg-primary/10 text-primary',
    yellow: 'bg-accent/70 text-accent-foreground',
    coral: 'bg-destructive/10 text-destructive',
  };
  return <span className={cn('mono inline-flex items-center rounded-md px-2 py-1 text-[10px] uppercase tracking-[.08em]', tones[tone])}>{children}</span>;
}

function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="mb-3 flex items-center justify-between"><p className="mono text-[10px] font-medium uppercase tracking-[.16em] text-muted-foreground">{children}</p>{action}</div>;
}

function LoadingRows() {
  return <div className="space-y-3" data-testid="state-loading"><div className="shimmer h-24 rounded-xl" /><div className="shimmer h-16 rounded-xl" /><div className="shimmer h-16 rounded-xl" /></div>;
}

function EmptyState({ icon: Icon, title, body, action }: { icon: typeof FileText; title: string; body: string; action?: ReactNode }) {
  return <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 p-8 text-center" data-testid="state-empty"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/60 text-accent-foreground"><Icon size={21} /></div><h3 className="display text-2xl">{title}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

function ErrorState({ onRetry, message = 'The request did not make it through.' }: { onRetry?: () => void; message?: string }) {
  return <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-5" data-testid="state-error"><div className="flex items-start gap-3"><CircleAlert className="mt-0.5 text-destructive" size={18} /><div><p className="font-bold text-sm">Something got in the way.</p><p className="mt-1 text-sm text-muted-foreground">{message}</p>{onRetry && <Button onClick={onRetry} variant="outline" className="mt-4 h-8 px-2.5 py-1.5 text-[11px]"><RotateCcw size={13} /> Try again</Button>}</div></div></div>;
}

function Logo() {
  return <Link href="/" data-testid="link-home" className="group flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-accent text-accent-foreground shadow-[3px_3px_0_hsl(var(--primary))] transition-transform group-hover:rotate-6"><Sparkles size={16} strokeWidth={2.5} /></span><span className="text-[16px] font-extrabold tracking-[-.05em]">promptly<span className="text-primary">.</span></span></Link>;
}

function Sidebar({ mobileOpen, closeMobile }: { mobileOpen: boolean; closeMobile: () => void }) {
  const [location] = useLocation();
  const nav = [
    { href: '/', label: 'New prompt', icon: PenLine },
    { href: '/templates', label: 'Templates', icon: LayoutTemplate },
    { href: '/history', label: 'History', icon: History },
  ];
  const tools = [
    { href: '/analyze', label: 'Analyze', icon: BarChart3 },
    { href: '/optimize', label: 'Optimize', icon: WandSparkles },
  ];
  return <aside className={cn('fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform duration-300 md:translate-x-0', mobileOpen ? 'translate-x-0' : '-translate-x-full')} data-testid="sidebar">
    <div className="flex items-center justify-between px-2"><Logo /><IconButton label="close menu" onClick={closeMobile} className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"><X size={18} /></IconButton></div>
    <div className="mt-10">
      <p className="mono mb-2 px-2 text-[9px] uppercase tracking-[.18em] text-sidebar-foreground/40">Workspace</p>
      <nav className="space-y-1">
        {nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={closeMobile} data-testid={`link-${label.toLowerCase().replace(' ', '-')}`} className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] font-semibold transition-colors', location === href ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground')}><Icon size={16} /><span>{label}</span>{location === href && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />}</Link>)}
      </nav>
    </div>
    <div className="mt-8">
      <p className="mono mb-2 px-2 text-[9px] uppercase tracking-[.18em] text-sidebar-foreground/40">Tools</p>
      <nav className="space-y-1">
        {tools.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={closeMobile} data-testid={`link-${label.toLowerCase()}`} className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] font-semibold transition-colors', location === href ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground')}><Icon size={16} /><span>{label}</span></Link>)}
      </nav>
    </div>
    <div className="mt-auto">
      <div className="mb-4 rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-3.5"><div className="mb-2 flex items-center gap-2 text-sidebar-primary"><Zap size={14} fill="currentColor" /><span className="mono text-[9px] uppercase tracking-[.14em]">Local-first</span></div><p className="text-[11px] leading-5 text-sidebar-foreground/60">Your drafts stay on this device. No account, no inbox.</p></div>
      <Link href="/settings" onClick={closeMobile} data-testid="link-settings" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] font-semibold text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"><Settings2 size={16} /> Settings</Link>
      <div className="mt-4 flex items-center justify-between border-t border-sidebar-border px-2 pt-4"><span className="mono text-[9px] uppercase tracking-[.12em] text-sidebar-foreground/30">v0.4 / local</span><span className="h-2 w-2 rounded-full bg-sidebar-primary" title="Local workspace ready" /></div>
    </div>
  </aside>;
}

function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const health = useHealthCheck();
  useEffect(() => { document.title = 'Promptly — make the ask precise'; }, []);
  return <div className="grain min-h-[100dvh] bg-background"><Sidebar mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} />{mobileOpen && <button aria-label="close navigation overlay" data-testid="button-close-navigation-overlay" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm md:hidden" />}<main className="min-h-[100dvh] md:pl-[248px]"><header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-border/70 bg-background/85 px-5 backdrop-blur-md md:px-9"><div className="flex items-center gap-3"><IconButton label="open menu" onClick={() => setMobileOpen(true)} className="md:hidden"><Menu size={19} /></IconButton><div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Workspace / <span className="text-foreground">Promptly</span></div></div><div className="flex items-center gap-3"><div className="hidden items-center gap-2 text-[11px] text-muted-foreground sm:flex"><span className={cn('h-1.5 w-1.5 rounded-full', health.isError ? 'bg-destructive' : 'bg-primary')} /> {health.isError ? 'API offline' : health.isLoading ? 'Checking engine' : 'Engine ready'}</div><Link href="/settings" data-testid="link-header-settings" className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground"><Settings2 size={15} /></Link></div></header>{children}</main></div>;
}

function ResultCard({ result, onCopy, onSave, onOptimize, onAnalyze, onPlay }: { result: any; onCopy: () => void; onSave: () => void; onOptimize: () => void; onAnalyze: () => void; onPlay: () => void }) {
  return <div className="fade-up space-y-4" data-testid="result-prompt">
    <div className="flex items-start justify-between gap-4"><div><Tag tone="green">{result.promptType || 'Structured prompt'}</Tag><h2 className="display mt-3 text-3xl leading-tight">{result.title || 'Untitled prompt'}</h2><p className="mt-1 text-sm text-muted-foreground">{result.intent}</p></div><div className="flex gap-1"><IconButton label="copy prompt" onClick={onCopy}><Copy size={16} /></IconButton><IconButton label="save prompt" onClick={onSave}><Save size={16} /></IconButton></div></div>
    <div className="rounded-xl border border-primary/20 bg-card p-5 shadow-[0_5px_0_hsl(var(--primary)/.10)]"><div className="mb-3 flex items-center justify-between"><span className="mono text-[10px] uppercase tracking-[.14em] text-primary">Prompt / ready to use</span><CheckCircle2 size={16} className="text-primary" /></div><p className="whitespace-pre-wrap text-[13px] leading-7 text-foreground" data-testid="text-generated-prompt">{result.prompt}</p></div>
    <div className="grid gap-3 sm:grid-cols-2">{[
      ['Context', result.context, 'green'],
      ['Output format', result.outputFormat, 'yellow'],
    ].map(([label, value, tone]) => <div key={label} className="rounded-xl border border-border bg-card p-4"><SectionLabel>{label}</SectionLabel><p className="text-xs leading-5 text-muted-foreground">{value || 'Not specified'}</p></div>)}</div>
    <DetailList label="Requirements" items={result.requirements} tone="green" /><DetailList label="Constraints" items={result.constraints} tone="yellow" />
    {(result.missingInformation?.length > 0 || result.suggestions?.length > 0) && <div className="rounded-xl border border-border bg-card p-4"><SectionLabel>Next pass</SectionLabel><ul className="space-y-2 text-xs leading-5 text-muted-foreground">{[...(result.missingInformation || []).slice(0, 2), ...(result.suggestions || []).slice(0, 2)].map((item: string, i: number) => <li key={`${item}-${i}`} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-foreground" />{item}</li>)}</ul></div>}
    <div className="flex flex-wrap gap-2 pt-1"><Button onClick={onOptimize} variant="outline" data-testid="button-optimize-result"><WandSparkles size={14} /> Optimize further</Button><Button onClick={onAnalyze} variant="quiet" data-testid="button-analyze-result"><BarChart3 size={14} /> Inspect quality</Button><Button onClick={onPlay} variant="quiet" data-testid="button-run-result"><Play size={14} /> Run in playground</Button></div>
  </div>;
}

function DetailList({ label, items, tone }: { label: string; items?: string[]; tone: 'green' | 'yellow' }) {
  if (!items?.length) return null;
  return <div className="rounded-xl border border-border bg-card p-4"><SectionLabel>{label}</SectionLabel><div className="flex flex-wrap gap-2">{items.map((item, i) => <Tag key={`${item}-${i}`} tone={tone}>{item}</Tag>)}</div></div>;
}

function Home() {
  const [, setLocation] = useLocation();
  const [idea, setIdea] = useState(() => readLocal<{ idea: string }>(DRAFT_KEY, { idea: '' }).idea);
  const [promptType, setPromptType] = useState('General');
  const [preset, setPreset] = useState(() => readLocal<{ preset: string }>(PREFS_KEY, { preset: 'Balanced' }).preset);
  const [result, setResult] = useState<any>(null);
  const [playground, setPlayground] = useState<any>(null);
  const generate = useGeneratePrompt();
  const run = useRunPlayground();
  const search = typeof window !== 'undefined' ? window.location.search : '';
  useEffect(() => {
    const requested = new URLSearchParams(search).get('template');
    const selected = templates.find((item) => item.id === requested);
    if (selected) setIdea(selected.prompt);
  }, [search]);
  useEffect(() => { writeLocal(DRAFT_KEY, { idea, preset }); }, [idea, preset]);
  const saveResult = (next: any) => {
    setResult(next);
    const history = readLocal<any[]>(HISTORY_KEY, []);
    const item = { ...next, id: crypto.randomUUID(), source: idea, createdAt: new Date().toISOString(), favorite: false };
    writeLocal(HISTORY_KEY, [item, ...history].slice(0, 60));
  };
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!idea.trim()) return;
    generate.mutate({ data: { input: idea, promptType, preset } }, { onSuccess: saveResult });
  };
  const copy = () => { if (result?.prompt) navigator.clipboard?.writeText(result.prompt); };
  const runPrompt = () => { if (result?.prompt) run.mutate({ data: { prompt: result.prompt, preset } }, { onSuccess: setPlayground }); };
  return <div className="mx-auto max-w-[1240px] px-5 py-9 md:px-9 md:py-12"><div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="mono mb-3 text-[10px] uppercase tracking-[.2em] text-primary">Prompt workspace / 01</p><h1 className="display max-w-[620px] text-[clamp(2.8rem,6vw,5.2rem)] leading-[.92] tracking-[-.04em]">Make the ask<br /><i>precise.</i></h1><p className="mt-5 max-w-md text-sm leading-6 text-muted-foreground">Start with the rough idea. Promptly finds the shape underneath and gives you something worth handing to a model.</p></div><div className="flex items-center gap-2"><Tag tone="yellow">Local draft</Tag><span className="mono text-[10px] text-muted-foreground">autosaved</span></div></div>
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(370px,.9fr)]">
      <form onSubmit={submit} className="space-y-4" data-testid="form-generate-prompt"><div className="rounded-xl border border-border bg-card p-5 shadow-[0_8px_0_hsl(var(--foreground)/.04)] md:p-6"><div className="mb-5 flex items-center justify-between"><SectionLabel>Raw material</SectionLabel><span className="mono text-[10px] text-muted-foreground">{idea.length}/12000</span></div><textarea data-testid="input-rough-idea" value={idea} onChange={(event) => setIdea(event.target.value)} placeholder="What are you trying to make, solve, decide, or explain?" className="min-h-[280px] w-full bg-transparent text-[17px] leading-8 outline-none placeholder:text-muted-foreground/50 md:min-h-[330px]" /><div className="mt-5 flex flex-col justify-between gap-3 border-t border-border pt-4 sm:flex-row sm:items-center"><div className="flex flex-wrap items-center gap-2"><select data-testid="select-prompt-type" value={promptType} onChange={(event) => setPromptType(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-[11px] font-semibold outline-none"><option>General</option><option>Writing</option><option>Research</option><option>Product</option><option>Code</option><option>Strategy</option></select><select data-testid="select-model-preset" value={preset} onChange={(event) => setPreset(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-[11px] font-semibold outline-none"><option>Balanced</option><option>Precise</option><option>Creative</option></select></div><Button type="submit" disabled={!idea.trim() || generate.isPending} data-testid="button-generate-prompt">{generate.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {generate.isPending ? 'Finding the shape…' : 'Shape this prompt'} <ArrowUpRight size={14} /></Button></div></div>{generate.isError && <ErrorState onRetry={() => submit()} message="The prompt engine could not shape this idea. Your draft is still safe here." />}</form>
      <div className="min-w-0">{generate.isPending ? <LoadingRows /> : result ? <ResultCard result={result} onCopy={copy} onSave={() => { const history = readLocal<any[]>(HISTORY_KEY, []); writeLocal(HISTORY_KEY, [{ ...result, id: crypto.randomUUID(), source: idea, createdAt: new Date().toISOString(), favorite: false }, ...history].slice(0, 60)); }} onOptimize={() => { writeLocal(DRAFT_KEY, { idea: result.prompt, preset }); setLocation('/optimize'); }} onAnalyze={() => { writeLocal(DRAFT_KEY, { idea: result.prompt, preset }); setLocation('/analyze'); }} onPlay={runPrompt} /> : <div className="flex h-full min-h-[420px] flex-col justify-between rounded-xl border border-dashed border-border bg-card/35 p-6"><div><div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><PanelLeft size={18} /></div><h2 className="display text-3xl">Your result<br /><i>will land here.</i></h2><p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">A clear title, a useful structure, and enough detail to get a better answer on the first try.</p></div><div className="space-y-3 border-t border-border pt-5"><p className="mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">A good prompt has</p>{['A clear job to be done', 'Context the model can use', 'Constraints that protect the output'].map((text, i) => <div key={text} className="flex items-center gap-3 text-xs"><span className="mono text-primary">0{i + 1}</span><span>{text}</span></div>)}</div></div>}</div>
    </div>
    {playground && <div className="fade-up mt-8 rounded-xl border border-primary/25 bg-primary/5 p-5" data-testid="playground-result"><div className="mb-3 flex items-center justify-between"><SectionLabel action={<Tag tone="green">{playground.model}</Tag>}>Playground output</SectionLabel><span className="mono text-[10px] text-muted-foreground">{playground.generationTimeMs}ms</span></div><p className="whitespace-pre-wrap text-sm leading-7">{playground.response}</p></div>}
    {run.isPending && <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Running against the selected model…</div>}
  </div>;
}

function TemplatesPage() {
  const [, setLocation] = useLocation();
  return <Page title="Starting points" eyebrow="Template library / 02" intro="Good prompts are easier to make when you are not staring at an empty field. Pick a shape, then make it yours."><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{templates.map((template, index) => <button key={template.id} data-testid={`card-template-${template.id}`} onClick={() => setLocation(`/?template=${template.id}`)} className="lift group rounded-xl border border-border bg-card p-5 text-left"><div className="mb-12 flex items-start justify-between"><Tag tone={index % 2 ? 'yellow' : 'green'}>{template.type}</Tag><ArrowUpRight size={17} className="text-muted-foreground transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" /></div><h2 className="display text-2xl leading-tight">{template.title}</h2><p className="mt-3 text-xs leading-5 text-muted-foreground">{template.description}</p><div className="mt-5 flex items-center gap-2 text-[11px] font-bold text-primary">Use this shape <ChevronRight size={13} /></div></button>)}</div><div className="mt-8 rounded-xl border border-border bg-sidebar p-6 text-sidebar-foreground md:flex md:items-center md:justify-between"><div><Tag tone="yellow">Tip</Tag><h2 className="display mt-3 text-2xl">The template is not the answer.</h2><p className="mt-1 text-sm text-sidebar-foreground/60">It is just a better first sentence.</p></div><Link href="/" data-testid="link-write-from-scratch" className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-sidebar-primary md:mt-0">Write from scratch <ArrowUpRight size={14} /></Link></div></Page>;
}

function HistoryPage() {
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<any[]>(() => readLocal(HISTORY_KEY, []));
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => items.filter((item) => `${item.title} ${item.prompt} ${item.promptType}`.toLowerCase().includes(query.toLowerCase())), [items, query]);
  const update = (next: any[]) => { setItems(next); writeLocal(HISTORY_KEY, next); };
  const restore = (item: any) => { writeLocal(DRAFT_KEY, { idea: item.prompt, preset: 'Balanced' }); setLocation('/'); };
  const duplicate = (item: any) => update([{ ...item, id: crypto.randomUUID(), title: `${item.title} copy`, createdAt: new Date().toISOString(), favorite: false }, ...items]);
  return <Page title="Your archive" eyebrow="Local history / 03" intro="Every prompt you shape lands here. Search the thinking, not just the final words."><div className="mb-5 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input data-testid="input-search-history" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your prompts…" className="h-11 w-full rounded-lg border border-border bg-card pl-10 pr-4 text-sm outline-none ring-primary/30 focus:ring-2" /></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 size={14} /> {items.length} saved {items.length === 1 ? 'prompt' : 'prompts'}</div></div>{!items.length ? <EmptyState icon={History} title="Nothing here yet." body="Shape your first prompt and it will become part of your local archive." action={<Link href="/" data-testid="link-create-first-prompt" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-xs font-bold text-primary-foreground"><Plus size={14} /> Create a prompt</Link>} /> : !filtered.length ? <EmptyState icon={Search} title="No matches." body="Try a different word or search by prompt type." /> : <div className="space-y-3">{filtered.map((item) => <article key={item.id} data-testid={`card-history-${item.id}`} className="lift rounded-xl border border-border bg-card p-4 sm:p-5"><div className="flex items-start gap-4"><div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-primary sm:flex"><FileText size={17} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Tag tone="green">{item.promptType || 'General'}</Tag><span className="mono text-[10px] text-muted-foreground">{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div><h2 className="mt-2 truncate font-bold tracking-[-.02em]">{item.title}</h2><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.prompt}</p></div><div className="flex shrink-0 gap-0.5"><IconButton label="favorite prompt" onClick={() => update(items.map((entry) => entry.id === item.id ? { ...entry, favorite: !entry.favorite } : entry))} className={item.favorite ? 'text-destructive' : ''}><Heart size={15} fill={item.favorite ? 'currentColor' : 'none'} /></IconButton><IconButton label="duplicate prompt" onClick={() => duplicate(item)}><Copy size={15} /></IconButton><IconButton label="restore prompt" onClick={() => restore(item)}><RotateCcw size={15} /></IconButton><IconButton label="delete prompt" onClick={() => update(items.filter((entry) => entry.id !== item.id))} className="hover:text-destructive"><Trash2 size={15} /></IconButton></div></div></article>)}</div>}</Page>;
}

function Page({ title, eyebrow, intro, children }: { title: string; eyebrow: string; intro: string; children: ReactNode }) {
  return <div className="mx-auto max-w-[1100px] px-5 py-9 md:px-9 md:py-12"><div className="mb-10 max-w-2xl"><p className="mono mb-3 text-[10px] uppercase tracking-[.2em] text-primary">{eyebrow}</p><h1 className="display text-[clamp(2.8rem,5vw,4.5rem)] leading-[.95] tracking-[-.04em]">{title}</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">{intro}</p></div>{children}</div>;
}

function AnalysisResultView({ result }: { result: any }) {
  const score = result.clarity?.toLowerCase().includes('high') ? 88 : result.clarity?.toLowerCase().includes('low') ? 44 : 72;
  return <div className="fade-up space-y-4" data-testid="analysis-result"><div className="grid gap-3 sm:grid-cols-[160px_1fr]"><div className="rounded-xl bg-sidebar p-5 text-sidebar-foreground"><p className="mono text-[10px] uppercase tracking-[.15em] text-sidebar-foreground/50">Clarity</p><p className="display mt-2 text-5xl text-sidebar-primary">{score}</p><p className="mt-1 text-xs text-sidebar-foreground/60">out of 100</p></div><div className="rounded-xl border border-border bg-card p-5"><SectionLabel>Readout</SectionLabel><div className="grid gap-4 sm:grid-cols-2"><div><p className="mono text-[9px] uppercase text-muted-foreground">Intent</p><p className="mt-1 text-sm">{result.intent}</p></div><div><p className="mono text-[9px] uppercase text-muted-foreground">Prompt type</p><p className="mt-1 text-sm">{result.promptType}</p></div><div><p className="mono text-[9px] uppercase text-muted-foreground">Structure</p><p className="mt-1 text-sm">{result.structure}</p></div><div><p className="mono text-[9px] uppercase text-muted-foreground">Context</p><p className="mt-1 text-sm">{result.context}</p></div></div></div></div><AnalysisList title="Ambiguities" items={result.ambiguity} tone="coral" /><AnalysisList title="What is already working" items={[...(result.requirements || []), ...(result.outputRequirements || [])]} tone="green" /><AnalysisList title="Weak spots" items={result.weaknesses} tone="yellow" /><AnalysisList title="Suggested next moves" items={result.suggestions} tone="green" /></div>;
}

function AnalysisList({ title, items, tone }: { title: string; items?: string[]; tone: 'coral' | 'yellow' | 'green' }) {
  return <div className="rounded-xl border border-border bg-card p-5"><SectionLabel>{title}</SectionLabel>{items?.length ? <ul className="space-y-3">{items.map((item, i) => <li key={`${item}-${i}`} className="flex gap-3 text-sm leading-6"><span className={cn('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', tone === 'coral' ? 'bg-destructive' : tone === 'yellow' ? 'bg-accent-foreground' : 'bg-primary')} />{item}</li>)}</ul> : <p className="text-sm text-muted-foreground">Nothing notable here. That is a good sign.</p>}</div>;
}

function AnalyzePage() {
  const [input, setInput] = useState(() => readLocal<{ idea: string }>(DRAFT_KEY, { idea: '' }).idea);
  const [result, setResult] = useState<any>(null);
  const analyze = useAnalyzePrompt();
  const submit = (event: FormEvent) => { event.preventDefault(); if (input.trim()) analyze.mutate({ data: { input } }, { onSuccess: setResult }); };
  return <Page title="Inspect the ask." eyebrow="Prompt analysis / 04" intro="See what your prompt communicates, where it gets fuzzy, and what would make the next answer more reliable."><div className="grid gap-8 lg:grid-cols-[minmax(300px,.75fr)_minmax(0,1.25fr)]"><form onSubmit={submit} className="space-y-3"><div className="rounded-xl border border-border bg-card p-5"><SectionLabel>Existing prompt</SectionLabel><textarea data-testid="input-analyze-prompt" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Paste the prompt you want to inspect…" className="min-h-[300px] w-full bg-transparent text-sm leading-7 outline-none placeholder:text-muted-foreground/50" /><div className="mt-4 border-t border-border pt-4"><Button type="submit" disabled={!input.trim() || analyze.isPending} data-testid="button-analyze-prompt">{analyze.isPending ? <Loader2 size={15} className="animate-spin" /> : <BarChart3 size={15} />} {analyze.isPending ? 'Reading between the lines…' : 'Analyze prompt'}</Button></div></div>{analyze.isError && <ErrorState onRetry={() => submit({ preventDefault: () => undefined } as FormEvent)} />}</form><div>{analyze.isPending ? <LoadingRows /> : result ? <AnalysisResultView result={result} /> : <EmptyState icon={BarChart3} title="A sharper read is one click away." body="Paste any prompt, even one you did not make in Promptly. We will look at intent, structure, ambiguity, and the output you asked for." />}</div></div></Page>;
}

function OptimizePage() {
  const [input, setInput] = useState(() => readLocal<{ idea: string }>(DRAFT_KEY, { idea: '' }).idea);
  const [result, setResult] = useState<any>(null);
  const [focus, setFocus] = useState('Make it clearer');
  const optimize = useOptimizePrompt();
  const improve = useImprovePrompt();
  const submit = (event: FormEvent) => { event.preventDefault(); if (input.trim()) optimize.mutate({ data: { input, action: focus } }, { onSuccess: setResult }); };
  const apply = (action: string) => { setFocus(action); if (result?.prompt) improve.mutate({ data: { input: result.prompt, action } }, { onSuccess: setResult }); };
  return <Page title="Give it an edge." eyebrow="Prompt optimizer / 05" intro="Optimization is not about making a prompt longer. It is about making every sentence earn its place."><div className="grid gap-8 lg:grid-cols-[minmax(300px,.75fr)_minmax(0,1.25fr)]"><form onSubmit={submit} className="space-y-3"><div className="rounded-xl border border-border bg-card p-5"><SectionLabel>Prompt to improve</SectionLabel><textarea data-testid="input-optimize-prompt" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Paste a rough or already-good prompt…" className="min-h-[260px] w-full bg-transparent text-sm leading-7 outline-none placeholder:text-muted-foreground/50" /><div className="mt-4 border-t border-border pt-4"><p className="mono mb-2 text-[9px] uppercase tracking-[.14em] text-muted-foreground">Primary focus</p><div className="flex flex-wrap gap-2">{['Make it clearer', 'Add useful context', 'Tighten the output', 'Remove ambiguity'].map((option) => <button type="button" key={option} data-testid={`button-focus-${option.toLowerCase().replaceAll(' ', '-')}`} onClick={() => setFocus(option)} className={cn('rounded-md border px-2.5 py-2 text-[11px] font-semibold transition-colors', focus === option ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>{option}</button>)}</div><Button type="submit" disabled={!input.trim() || optimize.isPending} className="mt-4 w-full" data-testid="button-optimize-prompt">{optimize.isPending ? <Loader2 size={15} className="animate-spin" /> : <WandSparkles size={15} />} {optimize.isPending ? 'Working the wording…' : 'Optimize prompt'}</Button></div></div>{optimize.isError && <ErrorState onRetry={() => submit({ preventDefault: () => undefined } as FormEvent)} />}</form><div>{optimize.isPending || improve.isPending ? <LoadingRows /> : result ? <div className="fade-up space-y-4" data-testid="optimized-result"><div className="rounded-xl border border-primary/20 bg-card p-5"><div className="mb-4 flex items-center justify-between"><Tag tone="green">Improved prompt</Tag><IconButton label="copy optimized prompt" onClick={() => navigator.clipboard?.writeText(result.prompt)}><Clipboard size={15} /></IconButton></div><h2 className="display text-3xl">{result.title}</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-7">{result.prompt}</p></div><div className="rounded-xl border border-border bg-card p-5"><SectionLabel>Keep iterating</SectionLabel><div className="grid gap-2 sm:grid-cols-3">{['Make it clearer', 'Tighten the output', 'Add useful context'].map((action) => <button key={action} onClick={() => apply(action)} data-testid={`button-iterate-${action.toLowerCase().replaceAll(' ', '-')}`} className="rounded-lg border border-border px-3 py-3 text-left text-[11px] font-semibold hover:border-primary/50 hover:bg-muted">{action}<ChevronRight size={13} className="mt-2 text-primary" /></button>)}</div></div></div> : <EmptyState icon={WandSparkles} title="Better is a direction." body="Bring a prompt with a little promise. We will improve it without sanding off the point of view." />}</div></div></Page>;
}

function SettingsPage() {
  const [prefs, setPrefs] = useState(() => readLocal(PREFS_KEY, { theme: 'light', preset: 'Balanced' }));
  const health = useHealthCheck();
  const update = (next: any) => { const value = { ...prefs, ...next }; setPrefs(value); writeLocal(PREFS_KEY, value); if (next.theme) document.documentElement.classList.toggle('dark', next.theme === 'dark'); };
  useEffect(() => { document.documentElement.classList.toggle('dark', prefs.theme === 'dark'); }, [prefs.theme]);
  return <Page title="Make it yours." eyebrow="Preferences / 06" intro="Promptly is designed to stay quiet and close. Set the defaults you want, then get back to the work."><div className="max-w-2xl space-y-4"><div className="rounded-xl border border-border bg-card p-5"><SectionLabel>Appearance</SectionLabel><div className="flex items-center justify-between gap-4"><div><h2 className="text-sm font-bold">Interface theme</h2><p className="mt-1 text-xs text-muted-foreground">Saved on this device only.</p></div><div className="flex rounded-lg border border-border p-1">{[['light', Sun], ['dark', Moon]].map(([value, Icon]: any) => <button key={value} onClick={() => update({ theme: value })} data-testid={`button-theme-${value}`} className={cn('flex items-center gap-2 rounded-md px-3 py-2 text-[11px] font-bold capitalize', prefs.theme === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}><Icon size={13} />{value}</button>)}</div></div></div><div className="rounded-xl border border-border bg-card p-5"><SectionLabel>Generation defaults</SectionLabel><div className="flex items-center justify-between gap-4"><div><h2 className="text-sm font-bold">Model preset</h2><p className="mt-1 text-xs text-muted-foreground">Affects new prompts and playground runs.</p></div><select data-testid="select-settings-preset" value={prefs.preset} onChange={(event) => update({ preset: event.target.value })} className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold outline-none"><option>Balanced</option><option>Precise</option><option>Creative</option></select></div></div><div className="rounded-xl border border-border bg-card p-5"><SectionLabel>Workspace health</SectionLabel><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', health.isError ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary')}>{health.isError ? <CircleAlert size={16} /> : <Check size={16} />}</span><div><h2 className="text-sm font-bold">{health.isError ? 'Engine unavailable' : 'Prompt engine connected'}</h2><p className="mt-1 text-xs text-muted-foreground">{health.isError ? 'You can still work with local drafts.' : 'Requests are ready when you are.'}</p></div></div><span className="mono text-[10px] text-muted-foreground">{health.isLoading ? 'checking' : health.isError ? 'offline' : 'online'}</span></div></div><div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5"><SectionLabel>Local data</SectionLabel><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-bold">Clear local workspace</h2><p className="mt-1 text-xs text-muted-foreground">Permanently remove your saved prompts and current draft.</p></div><Button variant="danger" onClick={() => { localStorage.removeItem(HISTORY_KEY); localStorage.removeItem(DRAFT_KEY); }} data-testid="button-clear-local-data"><Trash2 size={14} /> Clear data</Button></div></div></div></Page>;
}

function NotFound() {
  return <Page title="That page wandered off." eyebrow="404 / not found" intro="There is nothing at this address, but your drafts are still where you left them."><Link href="/" data-testid="link-return-home" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-xs font-bold text-primary-foreground">Back to workspace <ArrowUpRight size={14} /></Link></Page>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><AppShell><Switch><Route path="/" component={Home} /><Route path="/templates" component={TemplatesPage} /><Route path="/history" component={HistoryPage} /><Route path="/analyze" component={AnalyzePage} /><Route path="/optimize" component={OptimizePage} /><Route path="/settings" component={SettingsPage} /><Route component={NotFound} /></Switch></AppShell></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;