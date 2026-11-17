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
  if (request.nextUrl.origin !== policy.origin) return rejected(404);

  return clerkMiddleware(async auth => {
    const { userId } = await auth();
    if (userId) return canAccessAlpha(policy, userId) ? undefined : rejected(404);
    const isSignInLanding = request.nextUrl.pathname === "/" && ["GET", "HEAD"].includes(request.method);
    return isSignInLanding ? undefined : rejected(401);
  }, { authorizedParties: [policy.origin] })(request, event);
}
