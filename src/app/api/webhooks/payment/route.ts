import { getDb } from "@/db";
import { handlePaymentWebhook, webhookSecret } from "@/lib/payments";

export async function POST(request: Request) {
  // Signatures are computed over the exact bytes, so read the raw body.
  const raw = await request.text();
  const result = await handlePaymentWebhook(
    await getDb(),
    raw,
    request.headers.get("x-signature"),
    webhookSecret(),
  );
  if (result.status === "rejected") return Response.json(result, { status: 401 });
  // 200 for duplicates/ignored too: the provider should stop retrying them.
  return Response.json(result);
}
