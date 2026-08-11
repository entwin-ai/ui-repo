import { NextResponse } from "next/server"
import { requireUser } from "@/lib/whatsapp/route-helpers"
import { status, WA_CARD_ID } from "@/lib/whatsapp/service"

export const dynamic = "force-dynamic"

/**
 * POST /api/whatsapp/sync — "Sync now".
 *
 * Triggers an on-demand run of the hourly whatsapp-sync workflow (capture +
 * vectorize) for this user, instead of waiting for the top of the hour.
 * Fire-and-forget; returns current status. If GitHub dispatch isn't configured,
 * it's a no-op that just returns status (the cron still covers it).
 */
export async function POST() {
  const auth = await requireUser()
  if ("error" in auth) return auth.error

  if (process.env.GH_REPO && process.env.GH_DISPATCH_TOKEN) {
    fetch(
      `https://api.github.com/repos/${process.env.GH_REPO}/actions/workflows/whatsapp-sync.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GH_DISPATCH_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ ref: "main", inputs: { user_email: auth.email } }),
      },
    ).catch(() => {})
  }
  return NextResponse.json({ dispatched: true, card: WA_CARD_ID, ...(await status(auth.email)) })
}
