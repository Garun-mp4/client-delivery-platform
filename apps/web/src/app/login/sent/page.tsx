import Link from 'next/link';

const webmailProviders = {
  gmail: { label: 'Открыть Gmail', url: 'https://mail.google.com/' },
  mailru: { label: 'Открыть Mail.ru', url: 'https://mail.ru/' },
  yandex: { label: 'Открыть Яндекс Почту', url: 'https://mail.yandex.ru/' },
} as const;

export default async function SentPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string }>;
}) {
  const { provider } = await searchParams;
  const webmail =
    provider && provider in webmailProviders
      ? webmailProviders[provider as keyof typeof webmailProviders]
      : null;
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Письмо подготовлено</p>
        <h1>Проверьте почту</h1>
        <p className="lede">
          Если этот адрес имеет доступ, ссылка для входа появится в письме. Она одноразовая и
          действует недолго.
        </p>
        {webmail ? (
          <a className="provider-link" href={webmail.url} target="_blank" rel="noreferrer">
            {webmail.label}
          </a>
        ) : null}
        <Link className="text-link" href="/login">
          Вернуться ко входу
        </Link>
      </section>
    </main>
  );
}
