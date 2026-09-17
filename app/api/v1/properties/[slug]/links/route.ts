import { NextResponse, type NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { issueProspectLinkForSlug } from "@/lib/links-service";

/** POST /api/v1/properties/{slug}/links — issue a tokenized prospect link. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return auth.response;
  const { slug } = await params;

  let body: { ghl_contact_id?: string; locale?: string; expires_days?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // empty body is fine — defaults apply
  }

  const result = await issueProspectLinkForSlug({
    slug,
    ghlContactId: body.ghl_contact_id,
    locale: body.locale,
    expiresDays: body.expires_days,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(
    {
      url: result.url,
      token: result.token,
      expires_at: result.expires_at,
      published: result.published,
      sms: result.sms,
    },
    { status: 201 },
  );
}
