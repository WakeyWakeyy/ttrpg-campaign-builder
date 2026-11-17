import { clerkMiddleware } from "@clerk/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { canAccessAlpha, privateAlphaPolicy } from "./private-alpha";

const localMiddleware = clerkMiddleware();

function rejected(status: number) {
  return new Response(status === 503 ? "Private Alpha unavailable" : "Not found", {
    status, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });
}

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  let policy;
  try {
    policy = privateAlphaPolicy();
  } catch {
    return rejected(503);
  }
  if (!policy) return localMiddleware(request, event);
  if (request.nextUrl.origin !== policy.origin || request.headers.get("host")?.toLowerCase() !== policy.host) {
    return rejected(404);
  }

  return clerkMiddleware(async auth => {
    const isSignInLanding = request.nextUrl.pathname === "/" && ["GET", "HEAD"].includes(request.method);
    // Clerk also uses Server Actions for session transitions. App actions authorize in requireActor.
    if (isSignInLanding || request.method === "POST") return;
    const { userId } = await auth();
    if (!userId) return rejected(401);
    if (!canAccessAlpha(policy, userId)) return rejected(404);
  }, { authorizedParties: [policy.origin] })(request, event);
}
