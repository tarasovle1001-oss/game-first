# Свободные вставки: ключи для пака

Ключ файла: `detail_<id>/<кто>/any/<метки>` - комнаты в крупном плане нет, фон пустой и размытый (`prompt.yaml: style.detail`), один файл на все комнаты. Собирает `detailsFor` в `packages/base/src/systems/look.ts`. Нет файла - вставка не показывается. Решения Алексея и что в кадре - лист "Вставки" в таблице сцен.

Проба: один нейтральный вариант на вставку, 4 кадра. Вставки квадратные.

| id | кто в кадре | метки | вариантов |
|---|---|---|---|
| `bulge` | patron | size 0-4; bare (сауна) | 10 |
| `guest_flash` | patron | size 0-4 | 5 |
| `touch_bulge` | patron / husband | size 0-4; у мужа cage: 1 / leak | 8 |
| `grope_breast` | patron / husband | wear: on / bare | 2 |
| `grope_butt` | patron / husband | wear: on / aside / bare | 3 |
| `grope_thigh` | patron | - | 1 |
| `grope_under` | patron | wear: on / aside / bare; wet 1-3 | 9 |
| `tip_tuck` | wife | - | 1 |
| `upskirt` | wife | wear: on / bare | 2 |
| `show_breasts` | wife | wear: on / bare; marks | 4 |
| `show_pussy` | wife | wear: on / aside / bare; gape 0-3; marks | 24 |
| `show_butt` | wife | wear; gape 0-3; marks | 24 |
| `wet` | wife | wet 0-3; marks | 8 |
| `nipples` | wife | level 1-2 | 2 |
| `panties_off` | wife | - | 1 |
| `hickey` | wife | - | 1 |
| `toy_v` | wife | tsize 0-4; gape 0-3 | 20 |
| `toy_a` | wife | tsize 0-4; gape 0-3 | 20 |
| `toy_him` | husband | tsize 0-4; who: self | 5 |
| `him_bulge` | husband | cage: нет / 1 / leak | 3 |
| `him_cage` | husband | leak | 2 |
| `him_cum_pants` | husband | cage | 3 |
| `him_cum_early` | husband | cage | 2 |
| `him_soft` | husband | - | 1 |
| `him_ruined` | husband | cage | 2 |
| `him_alone` | husband | - | 1 |
| `wet_sheet` | husband | - | 1 |
| `join_hand_lazy` | husband | size; cage | 6 |
| `join_ruined` | husband | - | 1 |
| `phone_ear` | wife | - | 1 |
| `phone_busy` | wife | busy: hand / mouth / sex | 3 |
| `throat_bulge` | wife | size 2-4 | 3 |
| `belly_bulge` | wife | size 2-4 | 3 |
| `xray_v` | wife | size 0-4; fin | 10 |
| `xray_a` | wife | size 0-4; fin | 10 |
| `kiss_close` | wife | - | 1 |
| `touch_bare` | patron / husband | size 0-4; ring (у гостя) | 10 |
| `gape_v` | wife | gape 0-3; marks | 8 |
| `gape_a` | wife | gape 0-3; marks | 8 |
| `marks_face` | wife | marks: face / mouth | 3 |
| `toy_drawer` | wife | tsize 0-4 | 5 |
| `xray_toy` | wife | tsize 0-4; at: v / a | 10 |

Всего 42 вставки, около 250 вариантов по меткам (комнату пак может не различать). Слова промпта для них - `prompt.yaml: details`, заполняются анкетой (`tools/anketa.py`).
