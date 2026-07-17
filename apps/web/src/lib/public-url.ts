export function publicAppUrl(baseUrl: string, path: string): URL {
  const base = new URL(baseUrl);
  const target = new URL(path, base);

  if (target.origin !== base.origin) {
    throw new Error('Public redirect must stay on the configured application origin');
  }

  return target;
}
