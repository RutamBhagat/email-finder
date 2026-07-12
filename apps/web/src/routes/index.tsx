import { Button } from "@email-finder/ui/components/button";
import { Input } from "@email-finder/ui/components/input";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, LoaderCircle, Mail, Search, ShieldQuestion } from "lucide-react";
import { useState, type FormEvent } from "react";

type SearchResponse = {
  domain: string;
  mxHost?: string;
  results: { email: string; detail: string }[];
  error?: string;
};

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [domain, setDomain] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState("");

  async function findEmails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setData(null);

    try {
      const response = await fetch("/api/find-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, domain }),
      });
      const result = (await response.json()) as SearchResponse;
      if (!response.ok) throw new Error(result.error ?? "Search failed.");
      setData(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function copyEmail({ email }: { email: string }) {
    await navigator.clipboard.writeText(email);
    setCopied(email);
    window.setTimeout(() => setCopied(""), 1_500);
  }

  return (
    <main className="min-h-screen bg-[#fbfcfd] text-[#25313c]">
      <section
        className="min-h-[760px] border-b border-[#e8ecf0] px-4 pt-5 sm:px-7 sm:pt-7"
        style={{
          backgroundImage:
            "linear-gradient(#e8ecf0 1px, transparent 1px), linear-gradient(90deg, #e8ecf0 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      >
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between rounded-full bg-white px-5 shadow-[0_10px_35px_rgba(32,45,58,0.06)] sm:h-20 sm:px-8">
          <a href="#" className="flex items-center gap-2.5 text-xl font-bold tracking-[-0.04em] sm:text-2xl">
            <span className="grid size-8 place-items-center rounded-full bg-[#f05a3c] text-white">
              <Mail className="size-4" />
            </span>
            mailroute
          </a>
          <span className="rounded-full bg-[#fff0eb] px-3 py-1.5 text-xs font-semibold text-[#d94d32]">
            Free to use
          </span>
        </nav>

        <div className="mx-auto flex max-w-5xl flex-col items-center pb-24 pt-24 text-center sm:pt-32">
          <p className="mb-5 text-sm font-semibold text-[#586572]">Work email finder</p>
          <h1 className="max-w-4xl text-4xl font-semibold leading-[1.04] tracking-[-0.055em] sm:text-6xl lg:text-[72px]">
            <span className="text-[#f05a3c]">Find a work email</span> from a name and company.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-[#697681] sm:text-lg">
            Generate likely address patterns and inspect the company&apos;s mail route.
          </p>

          <form
            onSubmit={findEmails}
            className="mt-12 grid w-full overflow-hidden rounded-xl border border-[#d9dfe5] bg-white shadow-[0_14px_40px_rgba(32,45,58,0.08)] sm:grid-cols-[0.8fr_0.8fr_1.2fr_auto]"
          >
            {[
              { id: "firstName", value: firstName, setValue: setFirstName, placeholder: "First name" },
              { id: "lastName", value: lastName, setValue: setLastName, placeholder: "Last name" },
              { id: "domain", value: domain, setValue: setDomain, placeholder: "company.com" },
            ].map((field) => (
              <div key={field.id} className="border-b border-[#e1e5e9] p-2 sm:border-b-0 sm:border-r">
                <label htmlFor={field.id} className="sr-only">{field.placeholder}</label>
                <Input
                  id={field.id}
                  value={field.value}
                  onChange={(event) => field.setValue(event.target.value)}
                  placeholder={field.placeholder}
                  className="h-14 border-0 px-4 text-base shadow-none focus-visible:ring-0 sm:h-16"
                  required
                />
              </div>
            ))}
            <Button
              type="submit"
              disabled={loading}
              className="h-[72px] gap-3 bg-[#f05a3c] px-7 text-white hover:bg-[#dd4d31] sm:h-full sm:min-w-44"
            >
              {loading ? "Checking…" : "Find emails"}
              {loading ? <LoaderCircle className="animate-spin" /> : <Search />}
            </Button>
          </form>

          {error && <p role="alert" className="mt-4 text-sm text-[#b43d28]">{error}</p>}
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-4xl">
          {!data && !loading && (
            <div className="grid gap-8 sm:grid-cols-3">
              {[
                ["01", "Generate", "Build common patterns from the person's name."],
                ["02", "Route", "Find the company's preferred mail server."],
                ["03", "Review", "Copy the most likely addresses for your research."],
              ].map(([number, title, description]) => (
                <div key={number} className="border-t border-[#dfe4e8] pt-5">
                  <p className="font-mono text-xs text-[#f05a3c]">{number}</p>
                  <h2 className="mt-4 text-lg font-semibold">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#71808c]">{description}</p>
                </div>
              ))}
            </div>
          )}

          {data && (
            <div>
              <div className="mb-7 border-b border-[#dfe4e8] pb-6">
                <p className="text-sm font-medium text-[#f05a3c]">Results for {data.domain}</p>
                <h2 className="mt-1 text-3xl font-semibold">Likely addresses</h2>
                <p className="mt-2 truncate font-mono text-xs text-[#7d8891]">{data.mxHost ?? "No MX host found"}</p>
              </div>
              <div className="overflow-hidden rounded-xl border border-[#dfe4e8] bg-white">
                {data.results.map((result) => (
                  <div key={result.email} className="flex items-center gap-4 border-b border-[#edf0f2] px-4 py-4 last:border-0 sm:px-6">
                    <span title={result.detail} className="grid size-8 place-items-center rounded-full bg-[#fff5d9] text-[#876817]">
                      <ShieldQuestion className="size-4" />
                    </span>
                    <p className="min-w-0 flex-1 truncate font-mono text-sm font-medium">{result.email}</p>
                    <Button type="button" variant="ghost" size="icon" onClick={() => copyEmail({ email: result.email })}>
                      {copied === result.email ? <Check /> : <Copy />}
                    </Button>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-center text-xs text-[#7b8791]">
                These are likely patterns, not delivery guarantees. Cloudflare Workers cannot connect to SMTP port 25.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
