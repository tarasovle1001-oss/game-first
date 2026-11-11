# test-city

Симулятор: кафе, героиня, муж, посетители. Рабочее название, см. диздок.
Все персонажи взрослые (18+).

## Команды

```
pnpm install
pnpm check     # typecheck + тесты + боты
pnpm bot       # боты без экрана: --days 14 --seeds 20
pnpm dev       # игра в браузере с горячей перезагрузкой
pnpm build     # dist/index.html - один файл, открывается с диска
pnpm content   # проверить YAML и пересобрать контент (вызывается остальными командами сама)
```

Полезное для отладки:

```
pnpm exec tsx packages/bots/src/probe.ts 14 1     # что она отвечала гостям за 14 дней, сид 1
pnpm exec tsx packages/bots/src/run.ts --days 60 --seeds 8   # длинный прогон, сводка по балансу
pnpm exec tsx tools/scene-sheet.ts sheet.html    # все схемы сцен на одной странице
pnpm exec tsx tools/make-save.ts save.json 12 2  # сейв с идущей сценой (день от 12, сид 2)
```

Решения, принятые по ходу: [docs/DECISIONS.md](docs/DECISIONS.md).

## Пакеты

| Пакет | Что внутри | От чего зависит |
|---|---|---|
| `packages/core` | Движок: состояние, действия, события, сид, фазы, локации, формулы, сцены, сейвы | только immer |
| `packages/base` | Сама игра как мод поверх core | core |
| `packages/schematics` | SVG-схемы сцен из манекенов | ничего |
| `packages/mods/example` | Пример стороннего мода на публичном API | core |
| `packages/mods/cheats` | Читы для отладки, тоже мод | core, base |
| `packages/bots` | Боты, инварианты, интеграционные тесты | core, base, моды |
| `packages/ui` | React: читает состояние, шлёт действия | core, base, моды |

## Правила

- `core` не знает про игру. В нём нет слов "кафе" или "патрон".
- Любая фича идёт через `ModApi` (`packages/core/src/types.ts`). Не получается - расширяем API, а не лезем в ядро.
- В ядре и модах нет `Math.random` и `Date`: случайность только через `ctx.rng`, иначе ломаются сид и повторяемость.
- Состояние меняется только в обработчиках действий и событий. Сцена и всё на экране выводятся из состояния, не хранятся.
- Каждый мод хранит своё в `state.mods[modId]` и сам мигрирует свой раздел сейва.
- Тексты только по ключам, EN и RU обязаны совпадать по набору ключей (проверяет тест).

## Как устроен ход

`dispatch(state, action)` -> проверка, что действие есть в `listActions` -> `apply` -> очередь событий до опустошения -> новое состояние.

События ядра: `game:init`, `day:start`, `phase:enter`, `phase:exit`, `day:end`, `entity:moved`.

События игры (`base`): `shift:start`, `shift:tick`, `shift:end`, `patron:arrived`, `patron:served`, `patron:left`, `patron:forgotten`, `encounter:proposed`, `encounter:started`, `encounter:refused`, `encounter:ended`, `money:changed`, `heroine:changed`, `husband:act`, `husband:refused`, `caught`, `caught:resolved`, `mode:changed`, `phone:number`, `phone:message`, `phone:peeked`, `phone:call`, `phone:buttdial`.

Формулы: `base/consent` (согласие), `base/tip` (чаевые). Мод добавляет свою строку через `api.formulas.addFactor`.

## Контент

Всё в `packages/base/content`: `locations/`, `patron-types/`, `acts.yaml`, `scenes.yaml`, `consent.yaml`, `body.yaml`, `secrecy.yaml`, `phone.yaml`, `balance.yaml`, `names.yaml`. Тексты в `packages/base/locales/en.yaml` и `ru.yaml`.
