import transliterate from "@sindresorhus/transliterate";
import { createFileRoute } from "@tanstack/react-router";
import { getDomain } from "tldts";

type MxAnswer = {
  data: string;
};

export const Route = createFileRoute("/api/find-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            firstName?: string;
            lastName?: string;
            domain?: string;
          };
          const firstName = normalizeName({ value: body.firstName ?? "" });
          const lastName = normalizeName({ value: body.lastName ?? "" });
          const domain = normalizeDomain({ value: body.domain ?? "" });

          if (!firstName || !lastName || !isDomain({ value: domain })) {
            return Response.json(
              { error: "Enter a first name, last name, and valid domain." },
              { status: 400 },
            );
          }

          const response = await fetch(
            `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
            { headers: { accept: "application/dns-json" } },
          );
          const dns = (await response.json()) as { Answer?: MxAnswer[] };
          const mxHost = dns.Answer?.map((answer) => answer.data)
            .sort((a, b) => Number(a.split(" ")[0]) - Number(b.split(" ")[0]))
            .at(0)
            ?.split(" ")
            .at(1)
            ?.replace(/\.$/, "");

          if (!mxHost) {
            return Response.json({ error: "No mail server was found for this domain." }, { status: 422 });
          }

          const candidates = generateEmails({ firstName, lastName, domain });
          const results = import.meta.env.DEV
            ? await checkMailboxes({ candidates, domain, mxHost })
            : candidates;

          return Response.json({ domain, mxHost, results });
        } catch {
          return Response.json({ error: "The mail route lookup failed." }, { status: 422 });
        }
      },
    },
  },
});

function normalizeName({ value }: { value: string }) {
  return transliterate(value.trim().toLowerCase()).replace(/[^a-z]/g, "");
}

function normalizeDomain({ value }: { value: string }) {
  return getDomain(value.trim().toLowerCase()) ?? "";
}

function isDomain({ value }: { value: string }) {
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(value);
}

function generateEmails({ firstName, lastName, domain }: { firstName: string; lastName: string; domain: string }) {
  const firstInitial = firstName[0];
  const candidates = [
    {
      name: `${firstName}.${lastName}`,
      confidence: "Best guess",
      detail: "The most common professional naming pattern",
    },
    {
      name: `${firstInitial}${lastName}`,
      confidence: "Alternative",
      detail: "A common compact company pattern",
    },
    {
      name: firstName,
      confidence: "Alternative",
      detail: "Often used by smaller teams",
    },
  ];

  return candidates.map(({ name, confidence, detail }) => ({
    email: `${name}@${domain}`,
    confidence,
    detail,
  }));
}

async function checkMailboxes({
  candidates,
  domain,
  mxHost,
}: {
  candidates: ReturnType<typeof generateEmails>;
  domain: string;
  mxHost: string;
}) {
  try {
    const { createConnection } = await import("node:net");
    const { createInterface } = await import("node:readline");
    const socket = createConnection({ host: mxHost, port: 25 });
    socket.setTimeout(8_000, () => socket.destroy());
    const lines = createInterface({ input: socket, crlfDelay: Infinity })[Symbol.asyncIterator]();

    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });

    await readReply({ lines });
    await sendCommand({ command: "EHLO mailroute.local", lines, socket });
    await sendCommand({ command: "MAIL FROM:<>", lines, socket });

    const randomEmail = `${crypto.randomUUID().replaceAll("-", "")}@${domain}`;
    const catchAllCode = await sendCommand({ command: `RCPT TO:<${randomEmail}>`, lines, socket });

    if (isAccepted({ code: catchAllCode })) {
      socket.end("QUIT\r\n");
      return candidates.map((candidate) => ({
        ...candidate,
        confidence: "Unknown",
        detail: "This domain accepts random addresses (catch-all)",
      }));
    }
    if (!isRejected({ code: catchAllCode })) throw new Error("SMTP verification unavailable");

    const results = [];
    for (const candidate of candidates) {
      const code = await sendCommand({ command: `RCPT TO:<${candidate.email}>`, lines, socket });
      results.push({
        ...candidate,
        confidence: isAccepted({ code }) ? "Likely valid" : isRejected({ code }) ? "Rejected" : "Unknown",
        detail: isAccepted({ code })
          ? "Accepted by the company mail server"
          : isRejected({ code })
            ? "Rejected by the company mail server"
            : "The company mail server did not give a clear answer",
      });
    }

    socket.end("QUIT\r\n");
    return results.sort((a, b) => Number(b.confidence === "Likely valid") - Number(a.confidence === "Likely valid"));
  } catch {
    return candidates.map((candidate) => ({
      ...candidate,
      confidence: "Unknown",
      detail: "The local SMTP check was blocked or timed out",
    }));
  }
}

async function sendCommand({ command, lines, socket }: { command: string; lines: AsyncIterator<string>; socket: import("node:net").Socket }) {
  socket.write(`${command}\r\n`);
  return readReply({ lines });
}

async function readReply({ lines }: { lines: AsyncIterator<string> }) {
  const first = await lines.next();
  if (first.done) throw new Error("SMTP connection closed");

  const code = Number(first.value.slice(0, 3));
  if (first.value[3] === "-") {
    while (true) {
      const next = await lines.next();
      if (next.done) throw new Error("SMTP connection closed");
      if (next.value.startsWith(`${code} `)) break;
    }
  }
  return code;
}

function isAccepted({ code }: { code: number }) {
  return code === 250 || code === 251;
}

function isRejected({ code }: { code: number }) {
  return code >= 500 && code < 600;
}
