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

          const results = generateEmails({ firstName, lastName, domain }).map((email) => ({
            email,
            detail: "Generated from a common work email pattern",
          }));

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
  const lastInitial = lastName[0];
  const names = [
    firstName,
    lastName,
    `${firstName}.${lastName}`,
    `${firstName}${lastName}`,
    `${firstInitial}${lastName}`,
    `${firstInitial}.${lastName}`,
    `${firstName}${lastInitial}`,
    `${lastName}${firstInitial}`,
    `${lastName}.${firstName}`,
    `${firstName}-${lastName}`,
    `${firstName}_${lastName}`,
  ];

  return [...new Set(names)].map((name) => `${name}@${domain}`);
}
