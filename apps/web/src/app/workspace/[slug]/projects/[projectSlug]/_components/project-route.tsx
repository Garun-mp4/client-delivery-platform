interface ProjectRouteProps {
  readonly progress: number;
  readonly status: string;
  readonly responsibility: string;
  readonly action: string;
  readonly result: string;
  readonly actionHref?: string;
  readonly actionLabel?: string;
}

export function ProjectRoute({
  progress,
  status,
  responsibility,
  action,
  result,
  actionHref,
  actionLabel,
}: ProjectRouteProps) {
  return (
    <section className="project-route" aria-labelledby="project-route-title">
      <div className="project-route-heading">
        <div>
          <p className="section-label">Маршрут проекта</p>
          <h2 id="project-route-title">{action}</h2>
        </div>
        <span className="route-progress">{progress}%</span>
      </div>
      <div
        aria-label={`Выполнено ${progress}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress}
        className="route-track"
        role="progressbar"
      >
        <span style={{ inlineSize: `${Math.min(100, Math.max(0, progress))}%` }} />
      </div>
      <dl className="route-steps">
        <div>
          <dt>Состояние</dt>
          <dd>{status}</dd>
        </div>
        <div>
          <dt>Сейчас действует</dt>
          <dd>{responsibility}</dd>
        </div>
        <div>
          <dt>После этого</dt>
          <dd>{result}</dd>
        </div>
      </dl>
      {actionHref && actionLabel ? (
        <Link className="button-primary route-action" href={actionHref}>
          {actionLabel}
        </Link>
      ) : null}
    </section>
  );
}
import Link from 'next/link';
