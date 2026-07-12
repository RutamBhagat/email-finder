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
  let socket: import("node:net").Socket | undefined;
  let lineReader: import("node:readline").Interface | undefined;

  try {
    const { createConnection } = await import("node:net");
    const { createInterface } = await import("node:readline");
    socket = createConnection({ host: mxHost, port: 25 });
    lineReader = createInterface({ input: socket, crlfDelay: Infinity });
    const lines = lineReader[Symbol.asyncIterator]();

    await waitForConnection({ socket });

    const greeting = await readReply({ lines, phase: "SMTP greeting", socket });
    if (greeting.code !== 220) throw new Error(`Mail server refused the connection (${greeting.code})`);

    const hello = await sendCommand({ command: "EHLO mailroute.local", lines, phase: "SMTP greeting", socket });
    if (!isAccepted({ code: hello.code })) throw new Error(`Mail server refused the greeting (${hello.code})`);

    const sender = await sendCommand({ command: "MAIL FROM:<>", lines, phase: "sender check", socket });
    if (!isAccepted({ code: sender.code })) throw new Error(`Mail server refused verification (${sender.code})`);

    const randomEmail = `${crypto.randomUUID().replaceAll("-", "")}@${domain}`;
    const catchAll = await sendCommand({ command: `RCPT TO:<${randomEmail}>`, lines, phase: "catch-all check", socket });

    if (isAccepted({ code: catchAll.code })) {
      return candidates.map((candidate) => ({
        ...candidate,
        confidence: "Unknown",
        detail: "This domain accepts random addresses (catch-all)",
      }));
    }
    if (!isMailboxRejected({ reply: catchAll })) {
      return candidates.map((candidate) => ({
        ...candidate,
        confidence: "Unknown",
        detail: isTemporary({ code: catchAll.code })
          ? `The mail server temporarily deferred verification (${catchAll.code})`
          : `The mail server would not verify recipients (${catchAll.code})`,
      }));
    }

    const results = [];
    for (const candidate of candidates) {
      const reply = await sendCommand({
        command: `RCPT TO:<${candidate.email}>`,
        lines,
        phase: `recipient check for ${candidate.email}`,
        socket,
      });
      results.push({
        ...candidate,
        confidence: isAccepted({ code: reply.code }) ? "Likely valid" : isMailboxRejected({ reply }) ? "Rejected" : "Unknown",
        detail: isAccepted({ code: reply.code })
          ? "Accepted by the company mail server"
          : isMailboxRejected({ reply })
            ? "Rejected by the company mail server"
            : isTemporary({ code: reply.code })
              ? `The mail server temporarily deferred verification (${reply.code})`
              : `The mail server did not give a clear answer (${reply.code})`,
      });
    }

    return results.sort((a, b) => Number(b.confidence === "Likely valid") - Number(a.confidence === "Likely valid"));
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "SMTP verification failed";
    return candidates.map((candidate) => ({
      ...candidate,
      confidence: "Unknown",
      detail: message,
    }));
  } finally {
    lineReader?.close();
    if (socket && !socket.destroyed) socket.end("QUIT\r\n");
  }
}

async function waitForConnection({ socket }: { socket: import("node:net").Socket }) {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("SMTP connection timed out"));
    }, 10_000);
    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`SMTP connection failed: ${error.message}`));
    });
  });
}

async function sendCommand({
  command,
  lines,
  phase,
  socket,
}: {
  command: string;
  lines: AsyncIterator<string>;
  phase: string;
  socket: import("node:net").Socket;
}) {
  socket.write(`${command}\r\n`);
  return readReply({ lines, phase, socket });
}

async function readReply({ lines, phase, socket }: { lines: AsyncIterator<string>; phase: string; socket: import("node:net").Socket }) {
  const response = [];
  const first = await readLine({ lines, phase, socket });
  response.push(first);

  const code = Number(first.slice(0, 3));
  if (first[3] === "-") {
    while (true) {
      const next = await readLine({ lines, phase, socket });
      response.push(next);
      if (next.startsWith(`${code} `)) break;
    }
  }
  return { code, message: response.join(" ") };
}

async function readLine({
  lines,
  phase,
  socket,
}: {
  lines: AsyncIterator<string>;
  phase: string;
  socket: import("node:net").Socket;
}) {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`${phase} timed out`));
    }, 30_000);
    async function readNextLine() {
      try {
        const line = await lines.next();
        if (line.done) reject(new Error(`SMTP connection closed during ${phase}`));
        else if (!line.value.trim()) await readNextLine();
        else resolve(line.value);
      } catch (error) {
        reject(error);
      }
    }
    readNextLine().finally(() => clearTimeout(timeout));
  });
}

function isAccepted({ code }: { code: number }) {
  return code === 250 || code === 251;
}

function isTemporary({ code }: { code: number }) {
  return code >= 400 && code < 500;
}

function isMailboxRejected({ reply }: { reply: { code: number; message: string } }) {
  return reply.code >= 500 && reply.code < 600 && /(?:^|\s)5\.1\.1(?:\s|$)/.test(reply.message);
}
