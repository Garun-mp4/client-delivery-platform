# Garun Workspace interface system

## Intent

Спокойный стол передачи клиентского проекта. Владелец быстро находит узкое место, клиент видит одно
следующее действие. Интерфейс содержательный и уверенный, но не выглядит ни технической админкой, ни
набором одинаковых SaaS-карточек.

## Domain

Маршрут проекта, этап, передача результата, ожидание стороны, отметка проверки, доказательство
решения, рабочая папка, хронология.

## Color world

Тёплая бумага, чернила графитового цвета, тёмно-зелёная отметка «принято», янтарный стикер ожидания,
приглушённая красная правка, серо-синяя техническая пометка.

## Signature

`ProjectRoute`: состояние → ответственная сторона → следующее действие → ожидаемый результат.
Signature повторяется в workspace overview, project overview, project list, client next action и
будущих review/approval screens.

## Rejected defaults

- Generic equal card grid → приоритетный action rail и неравномерная содержательная композиция.
- Одинаковая sidebar для всех → role-based shell и контекстная project navigation.
- Страница сущности/формы → сначала цель и следующий шаг, детали раскрываются ниже.

## Tokens

- Canvas: `--canvas-paper`
- Surface base/raised/inset: `--surface-sheet`, `--surface-raised`, `--surface-inset`
- Ink hierarchy: `--ink-primary`, `--ink-secondary`, `--ink-tertiary`, `--ink-muted`
- Borders: `--border-soft`, `--border-default`, `--border-emphasis`
- Brand/action: `--marker-green`, `--marker-green-strong`, `--marker-green-soft`
- Waiting: `--note-amber`, `--note-amber-soft`
- Danger: `--revision-red`, `--revision-red-soft`
- Informational: `--blueprint`, `--blueprint-soft`

## Depth

Borders plus quiet surface shifts. Canvas and navigation share one background; raised menus use one
surface level above their parent. Inputs are inset. Shadows are reserved for floating layers only.

## Typography

Large product/page headings: Georgia fallback editorial serif until a privacy-safe font strategy is
approved. UI/body: system sans stack. Labels use 600 weight; metadata uses 500. Large headings use
tight tracking and balanced wrapping. Data uses tabular numerals.

## Spacing and shape

- Base unit: 4 px.
- Common gaps: 8, 12, 16, 24, 32, 48 px.
- Control radius: 8 px.
- Panel radius: 12 px.
- Floating layer radius: 14 px.
- Touch target: minimum 44 px.

## Reusable patterns

- `AppShell`: role-aware primary navigation, workspace identity, user/session action, mobile rail.
- `PageHeader`: location, clear title, short purpose and optional one primary action.
- `ProjectNav`: project-local sections, current location.
- `ProjectRoute`: responsibility and next-action narrative.
- `ActionPanel`: one dominant CTA, context and expected result.
- `EmptyState`: why empty, what happens next, one relevant action.
- `FormSection`: purpose before fields, inline errors, pending submit.

## Motion

120–180 ms for control feedback, deceleration easing, transform/opacity only. No bounce. All
non-essential motion disabled for reduced-motion preference.
