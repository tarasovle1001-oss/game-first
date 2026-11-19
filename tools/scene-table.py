"""The table of pictures: every situation the game has, the layout it shows now, and a first guess at the kind of picture it needs.
Usage: pnpm exec tsx tools/scene-audit.ts 20 3 audit.json && python3 tools/scene-table.py audit.json out.csv
Rows that come from content (acts, bed, layouts) are read from the yaml; situations that have no picture rule at all are listed by hand at the bottom
of this file - when a rule is written for one of them, move it out of GAPS."""
import csv, json, sys, pathlib, yaml

root = pathlib.Path(__file__).resolve().parent.parent / "packages/base"
load = lambda p: yaml.safe_load((root / p).read_text(encoding="utf-8"))
audit = json.loads(pathlib.Path(sys.argv[1]).read_text()) if len(sys.argv) > 1 else {"layouts": []}
out = sys.argv[2] if len(sys.argv) > 2 else "scene-table.csv"
ru = load("locales/ru.yaml")
acts, scenes, intim, floor, manners = load("content/acts.yaml"), load("content/scenes.yaml"), load("content/intimacy.yaml")["bedroom"], load("content/floor.yaml"), load("content/manners.yaml")
layout = {s["id"]: s for s in scenes}
share = {l["id"]: l["share"] for l in audit["layouts"]}
ROLE = {"wife": "она", "husband": "муж", "patron": "гость", "patron2": "гость 2", "patron3": "гость 3", "watcher": "зевака"}
who = lambda lid: ", ".join(ROLE[f["role"]] for f in layout[lid]["figures"]) if lid in layout else ""
men = lambda lid: sum(1 for f in layout[lid]["figures"] if f["role"] not in ("wife", "watcher")) if lid in layout else 0
name = lambda *keys: next((ru[k] for k in keys if k in ru), keys[0])

FULL, SPLIT, PORTRAIT, MARK, NONE = "общий план", "портрет + вставки", "только её портрет", "портрет с меткой (новой сцены не надо)", "картинка не нужна"
# positions that rarely come out whole (a guess from how tangled the bodies are): decided by the generation test
TANGLED = {"sixty_nine", "patron_sixty_nine", "facesitting", "fisting_him", "pegging", "dildo_him", "prostate", "footjob", "thigh_ride", "patron_thigh_job", "patron_titfuck", "titfuck", "rimming_her", "rimming_him", "patron_deepthroat", "patron_standing_sex", "edging", "tease_denial", "spank_him", "ignore_handjob", "cleanup", "toy_on_her", "chastity"}
def guess(lid, tier=None):
    if lid not in layout: return ""
    m = men(lid)
    if lid.startswith(("fin_", "patron_fin_")): return MARK if lid.endswith(("face", "mouth", "chest", "hands")) else SPLIT
    if lid.startswith("came_") and lid[5:] in ("chastity", "tease_denial", "edging"): return PORTRAIT
    if m >= 2: return SPLIT
    if m == 0: return PORTRAIT
    if lid in TANGLED or lid.startswith("came_") and lid[5:] in TANGLED: return SPLIT
    return FULL

rows = []
def add(group, what, when, lid, comp=None, note="", status=None):
    has = lid in layout
    sh = share.get(lid, "") if has else ""
    st = status or ("нет картинки" if not has else "есть макет" if (sh or 0) > 0 else "есть макет, боты не дошли")
    rows.append([group, what, when, lid if has else (lid or "-"), who(lid), sh, st, comp if comp is not None else guess(lid), "", note])

# 1. guests: every act
for a in acts:
    if a.get("only") == "husband": continue
    add("Гость: акт", name(f"act.{a['id']}"), f"встреча с гостем, ступень {a['tier']}", a["scene"])
for s in scenes:
    if s["id"].startswith("patron_fin_"): add("Гость: финал", name(f"scene.{s['id']}"), "он кончил, 3-5 минут после", s["id"])
for lid in ["group_spitroast", "group_spitroast_hand", "group_dp", "group_airtight", "group_oral_hand", "group_sex_hand"]:
    add("Гость: группа в зале", name(f"scene.{lid}"), "к встрече присоединились второй и третий", lid)
for lid, when in [("join_husband", "муж присоединился к ней с гостем"), ("join_hand", "муж присоединился: рука"), ("join_mouth", "муж присоединился: рот"), ("join_take", "муж присоединился: берёт её"), ("caught", "муж вошёл и застал")]:
    add("Гость + муж", name(f"scene.{lid}"), when, lid)
for lid, when in [("flash", "на спор: показать"), ("walk_naked", "на спор: пройти голой"), ("striptease", "стриптиз для гостя"), ("body_shot", "выпить с её тела"), ("sauna_massage", "массаж в сауне"), ("deal", "гость пришёл к мужу с деньгами"), ("table_sit", "муж подсел к гостю"), ("serving", "она работает в зале, ничего не происходит")]:
    if lid in layout and not any(r[3] == lid for r in rows): add("Зал", name(f"scene.{lid}"), when, lid)
# 2. the bed
bed = list(dict.fromkeys(intim["ask"] + intim["switchTo"]))
for a in bed:
    lid = "sex" if a == "sex" else a
    add("Муж: постель", name(f"act.{a}"), "сцена с мужем", lid if a != "kiss" else "", note="поцелуй на ночь - строка без сцены" if a == "kiss" else "")
for a in dict.fromkeys(intim["ownEnd"] + intim["his"] + ["rimming_him", "rimming_her"]):
    add("Муж: финал акта", name(f"scene.came_{a}"), "этот акт закончился", f"came_{a}")
for s in scenes:
    if s["id"].startswith(("fin_", "lead_")): add("Муж: финал", name(f"scene.{s['id']}"), "куда он кончил / чем она закончила", s["id"])
for lid, when in [("wants_him", "она сама тянется к нему"), ("cold_back", "отказала, отвернулась"), ("left_wanting", "он кончил, она нет"), ("finishing_herself", "доводит себя сама после него"), ("faking_it", "изображает оргазм"), ("premature_finish", "ранний финал"), ("came_too_soon_foreplay", "кончил ещё до начала"), ("went_soft", "упал"), ("by_hand", "он сам, рядом с ней"), ("talk", "разговор ночью"), ("sleeping", "спят"), ("night_awake", "лежат без сна"), ("fd_tease", "она дразнит (её власть)"), ("fd_facesit", "садится на лицо (её власть)"), ("fd_ignore", "игнорирует (её власть)")]:
    add("Муж: ночь", name(f"scene.{lid}"), when, lid)
# 3. the day
for lid, when in [("her_cook", "она готовит, муж рядом"), ("her_tidy", "прибирает зал"), ("her_rest", "отдыхает"), ("her_dress", "одевается к смене"), ("bath_walkin", "он вошёл, пока она моется"), ("bath_together", "моются вместе"), ("idle", "ничего особенного: кто в комнате")]:
    add("День", name(f"scene.{lid}"), when, lid)

# 4. what has no picture rule at all: shown as "idle" or "serving", or as nothing
GAPS = [
    ("Муж и она: касания и слова", [(name(f"action.talk.{o['id']}"), ("касание" if o["group"] == "touch" else "разговор") + ", днём и в смену; ночью - сцена \"разговор\"") for o in manners["talk"]["options"]],
     PORTRAIT, "Касаний 12: обнять, поцеловать, под юбку... Сейчас на экране 'ничего особенного'. Дёшево: её портрет с реакцией; для поцелуя и объятия годится макет 'kissing'."),
    ("Она сама подходит к мужу", [("Обнимает просто так", "она подошла сама"), ("Дразнит", "она подошла сама"), ("Ищет утешения", "после плохого вечера"), ("Жалуется на гостя", "к ней пристают"), ("Рассказывает, что было", "после встречи с гостем")], PORTRAIT, "Пять видов подхода, все без картинки."),
    ("Мелочи у столиков", [(name(f"log.moment.{m['id']}", f"log.moment.{m['id']}.good")[:70], "смена, зал") for m in floor["moments"]["list"]], NONE, f"{len(floor['moments']['list'])} коротких событий. Идут строкой под картинкой 'она работает'. Отдельные кадры вряд ли окупятся."),
    ("Её ящик с игрушками", [("Сеанс с игрушкой перед сменой", "если муж рядом или режим просмотра"), ("Только пальцы", "то же, без игрушки"), ("Игрушка ночью рядом с мужем", "она не дождалась")], PORTRAIT, "Сцены нет вообще. Нужен один макет 'она одна в спальне' + метка размера игрушки."),
    ("Компания в малом зале / сауне", [("Заходит с подносом", "ход 1"), ("Её забалтывают", "ход 2"), ("Усадили к себе (лёгкое)", "исход"), ("Не отпустили (далеко)", "исход, их несколько"), ("Вырвалась", "исход"), ("Муж вошёл и увёл", "он в дверях")], SPLIT, "Картинки нет ни на одном шаге: компания не числится 'встречей'. Групповые макеты group_* есть, но правило их сюда не подставляет."),
    ("Номера наверху", [("Понесла полотенца после закрытия", "один бросок"), ("Осталась на часы", "один бросок"), ("Отправил её наверх (ночью)", "один бросок"), ("Заглянула к постояльцу утром", "один бросок")], FULL, "Считается сразу, времени у сцены нет - показывать нечего, пока номера не по ходам. Потом годятся обычные макеты гостя."),
    ("Город", [("Свидание / прогулка вдвоём", "день"), ("Зал вдвоём", "день"), ("Магазины вдвоём, примерка", "день"), ("Жиголо", "она одна в городе, за кадром"), ("Днём у любовника", "за кадром")], PORTRAIT, "Примерка - её портрет в новом наряде (уже умеем по метке одежды). Жиголо и любовник задуманы за кадром."),
    ("Его тело", [("Наедине с собой: рука", "он один"), ("Наедине с собой: игрушка", "он один"), ("Она вошла и застала", "дверь открылась"), ("Мокрый сон: заметила", "утро"), ("Клетка надета (состояние)", "все сцены с ним, пока заперт")], NONE, "Сцены без неё - по решению 12.11 муж рисуется вставками. Клетке нужна метка в ключе картинки, иначе в сценах с ним её не будет видно."),
    ("Разное", [("Слушает у двери", "она за дверью с гостем"), ("Звонок ей по телефону", "смена"), ("Работает в зале сам", "смена"), ("Итог дня", "утро")], NONE, "Текстом."),
]
for group, items, comp, note in GAPS:
    for i, (what, when) in enumerate(items):
        rows.append([group, what, when, "-", "", "", "нет картинки", comp, "", note if i == 0 else ""])

head = ["Группа", "Ситуация", "Когда", "Макет сейчас", "Кто в кадре", "Доля ходов у ботов, %", "Статус", "Какой кадр (предложение)", "Решение Алексея", "Комментарий"]
with open(out, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f); w.writerow(head); w.writerows(rows)
pathlib.Path(out).with_suffix(".json").write_text(json.dumps({"head": head, "rows": rows}, ensure_ascii=False))
from collections import Counter
print(len(rows), "rows;", dict(Counter(r[6] for r in rows)), "|", dict(Counter(r[7] for r in rows)))
used = {r[3] for r in rows}
print("layouts not in the table:", sorted(set(layout) - used))
