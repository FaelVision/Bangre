/**
 * Answers as fast as possible, touching nothing. The browser calls it to learn
 * whether the server is really reachable: `navigator.onLine` only says a
 * network interface is up, and a school wifi with no internet behind it, or a
 * phone with no data credit, is "online" by that measure.
 */
export function GET() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
