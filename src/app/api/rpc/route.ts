/**
 * /api/rpc — server-side proxy to the Neo N3 RPC node.
 *
 * The browser fetches /api/rpc (same origin → no CORS).
 * This handler forwards the request to NEO_RPC_TARGET server-side
 * (server-to-server has no CORS restrictions).
 *
 * Used only for private / local networks where NEXT_PUBLIC_NEO_RPC_URL
 * is set to "/api/rpc". Public networks (MainNet/TestNet) use their
 * known public RPC URLs directly from the browser.
 */

import { NextRequest, NextResponse } from "next/server";

const NEO_RPC_TARGET = process.env.NEO_RPC_TARGET ?? "";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!NEO_RPC_TARGET) {
    return NextResponse.json(
      { error: "NEO_RPC_TARGET is not configured" },
      { status: 503 }
    );
  }

  const body = await request.text();

  try {
    const upstream = await fetch(NEO_RPC_TARGET, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Upstream RPC unreachable: ${String(err)}` },
      { status: 502 }
    );
  }
}
