# Как написать мод

Вся игра написана как мод (`packages/base`), так что всё, что умеет она, умеет и твой мод. Отдельного "API для модов" нет: есть один `ModApi` из `packages/core/src/types.ts`.

## Два способа подключить

1. **Файл `.js` в собранной игре.** Меню -> "Подключить мод (.js)". Файл вызывает `TestCity.defineMod({ mod, locales })`. Доступны `TestCity.core` и `TestCity.base`. Пример: [examples/loud-music.mod.js](examples/loud-music.mod.js). Идущая игра не сбрасывается: новый мод получает своё стартовое состояние, остальное сохраняется.
2. **Пакет в репозитории.** Папка `packages/mods/<имя>`, как `cheats` или `example`, и строка в `packages/ui/src/game.ts`. Так удобнее, когда нужен TypeScript и тесты.

## Из чего состоит мод

```ts
const mod: Mod = {
  id: "my_mod",              // уникальное имя, оно же ключ раздела состояния
  version: 1,
  requires: ["base"],        // от кого зависит
  initState: () => ({ ... }),          // начальное state.mods.my_mod
  migrate: (slice, from) => slice,     // обновить свой раздел старого сейва
  register(api) { ... },               // всё остальное
};
```

## Что даёт `api`

| Что | Зачем | Пример в игре |
|---|---|---|
| `api.actions.register` | Действие игрока. `enumerate` возвращает, что доступно сейчас; `apply` меняет состояние | `systems/economy.ts` |
| `api.events.on(type, handler, priority?)` | Реагировать на события ядра и других модов | почти везде |
| `api.formulas.addFactor(formula, row)` | Добавить именованную строку в формулу (`base/consent`, `base/tip` или свою) | `systems/latents.ts` |
| `api.scenes.register` | Тип сцены: функция "состояние -> описание сцены или null". Побеждает сцена с большим `priority` | `systems/secrecy.ts` (сцена "застал") |
| `api.locations.register` | Комната | `systems/places.ts` |
| `api.phases.register` | Фаза дня | `index.ts` |
| `api.invariants.add` | Проверка "такого быть не должно". Боты гоняют её после каждого хода | везде |

Внутри обработчиков есть `ctx`:
- `ctx.state` - черновик состояния, его можно менять напрямую;
- `ctx.rng` - случайность (`float`, `int`, `chance`, `pick`, `weighted`). **Только она**: `Math.random` ломает сид и повторяемость;
- `ctx.emit(type, payload)` - послать событие другим;
- `ctx.log(key, params, tags?)` - строка в лог по ключу перевода;
- `ctx.engine` - читать реестры: `evaluate`, `listActions`, `location`...

## Правила, без которых всё сломается

- Меняй состояние только в `apply` действий и в обработчиках событий. `enumerate`, строки формул и `match` сцен - чистые функции: читают, не пишут.
- Никаких `Math.random`, `Date`, таймеров. Один сид должен давать одну игру.
- Своё храни в `state.mods[<id>]`. В чужой раздел лучше не писать, если есть экспортированная функция (`addMoney`, `changeHeroine`, `sendMessage`).
- В состоянии только то, что переживает JSON: числа, строки, массивы, объекты.
- Тексты по ключам, на обоих языках.
- Добавь хотя бы один инвариант: боты начнут проверять твой мод вместе с игрой.

## Рецепты

**Новая строка в согласии** (любой фактор желания):

```js
api.formulas.addFactor("base/consent", {
  id: "my_mod.full_moon",
  labelKey: "my_mod.factor.full_moon",
  order: 45,
  // input: { act, partner, loc, offer, pressure }; вернуть null = строка не показывается
  eval: (state, input) => (state.time.day % 28 === 0 ? 10 : null),
});
```

**Новый акт, наряд, тип гостя, комната** - это данные, код не нужен: `packages/base/content/*.yaml` плюс тексты в `locales`. Сборка скажет, чего не хватает.

**Реакция на то, что случилось:**

```js
api.events.on("encounter:started", (ctx, e) => {
  // e.payload: { patron, act, loc, verdict, witnessed, came, tier, intimate }
});
```

Список событий - в README, раздел "Как устроен ход".

**Действие со свободными параметрами** (число из поля ввода): не перечисляй его в `enumerate`, а дай `accepts(state, action)`. Так сделаны читы.

**Своё сообщение в её телефон:** `TestCity.base.sendMessage(ctx, patronId, { from, to, key, heat })`.

## Как проверить

```
pnpm check                                        # типы, тесты, боты на 14 дней
pnpm exec tsx packages/bots/src/run.ts --days 60  # длинный прогон со сводкой
```

Если мод лежит пакетом, добавь его в список в `packages/bots/src/run.ts`, и боты будут играть с ним.
