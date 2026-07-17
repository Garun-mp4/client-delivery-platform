export function formRecord(form: FormData): Record<string, unknown> {
  return Object.fromEntries(form.entries());
}
