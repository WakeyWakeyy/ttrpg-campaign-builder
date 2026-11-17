import clerkProxy from "./infrastructure/auth/clerk/proxy";

export default clerkProxy;

// Next.js requires matcher values to be statically analyzable here.
export const config = {
  matcher: ["/((?!_next/static/|_next/image(?:/|$)|favicon\\.ico$).*)"],
};
