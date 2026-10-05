import Link from "next/link";

export default function NotFound() {
  return <main><h1>Not found</h1><p>This campaign or location is unavailable.</p><Link href="/">All campaigns</Link></main>;
}
