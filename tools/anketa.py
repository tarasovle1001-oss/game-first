#!/usr/bin/env python3
"""One file out, one file back.
  python3 tools/anketa.py export <since-commit> out.yaml   - every Russian line added since that commit, plus the prompt words for close-ups
  python3 tools/anketa.py merge filled.yaml                - puts the filled lines into ru.yaml and prompt.yaml
  python3 tools/anketa.py cover cover.csv out.yaml [areas]   - the lines the game shows most (tools/text-cover.ts writes the csv), each with empty slots for more wordings
  python3 tools/anketa.py merge filled.yaml                - also takes new wordings (`key#2`): adds them to ru.yaml, and to en.yaml as a copy of the English line until translated
The file is plain `key: "text"`. Part 1: game lines (Russian). Part 2: prompt words (English tags), keys start with `prompt.`."""
import json, re, subprocess, sys
RU = "packages/base/locales/ru.yaml"
PROMPT = "packages/base/content/prompt.yaml"
LINE = re.compile(r'^([\w.]+): (".*")\s*$')

def lines(text):
    return {m.group(1): json.loads(m.group(2)) for m in map(LINE.match, text.split("\n")) if m}

def export(since, out):
    old = lines(subprocess.run(["git", "show", f"{since}:{RU}"], capture_output=True, text=True).stdout)
    new = lines(open(RU, encoding="utf-8").read())
    PLAIN = ("log.doors", "log.work", "log.open_early", "log.day", "log.her.")  # nothing to spice up there
    keys = [k for k in new if k.startswith("log.") and old.get(k) != new[k] and not k.startswith(PLAIN)]
    ins = re.findall(r"^\| `(\w+)` \| ([^|]+) \| ([^|]+) \|", open("docs/INSERTS.md", encoding="utf-8").read(), re.M)
    have = {}
    m = re.search(r"^details:\n((?:  .*\n)*)", open(PROMPT, encoding="utf-8").read(), re.M)
    if m:
        for l in m.group(1).split("\n"):
            mm = re.match(r'  "?([\w.+]+)"?: (".*")', l)
            if mm: have[mm.group(1)] = json.loads(mm.group(2))
    q = lambda s: json.dumps(s, ensure_ascii=False)
    o = ["# test-city: анкета. Один файл туда, один обратно.",
         "# Как заполнять: меняй только текст в кавычках справа. Ключи слева, {слова в скобках} и \\\" внутри строк не трогать.",
         "# Строка устраивает - оставь как есть. Файл вернуть целиком.",
         "", "# ===== ЧАСТЬ 1. Строки игры (русский). Сейчас это нейтральные заглушки: нужны живые, откровенные формулировки. =====",
         "# Группа видна по ключу: log.bed.* - постель с мужем, log.join.* - муж присоединился к ней с гостем, log.moment.* - мелочи у столика,",
         "# log.group.* - компания в малом зале, log.towels.* / log.room_door.* / log.send_up.* - номера наверху, log.alone.* / log.nerve.* - его тело,",
         "# log.cage.* / log.bed.cage.* - клетка, log.bath.* - душ вдвоём, log.roam.* - гость вышел из зала, log.talk.* - слова и касания мужа.", ""]
    group = None
    for k in sorted(keys):
        g = ".".join(k.split(".")[:2])
        if g != group: o.append(f"# --- {g}"); group = g
        o.append(f"{k}: {q(new[k])}")
    o += ["", "# ===== ЧАСТЬ 2. Слова промпта для вставок (английские теги через запятую). =====",
          "# Вставка - крупный план без лиц, квадрат. Строка prompt.<вставка> - что в кадре. Строки prompt.<метка>.<значение> добавляются к ней.",
          "# Жидкости - гипертрофированно. Пусто = вставка пока не генерится.", ""]
    for i, who, tags in ins:
        o.append(f"# {i}: в кадре {who.strip()}; метки: {tags.strip()}")
        o.append(f"prompt.{i}: {q(have.get(i, ''))}")
    o += ["", "# метки: что добавить к словам вставки при этом значении"]
    TAGS = {"size": ["0", "1", "2", "3", "4"], "tsize": ["0", "1", "2", "3", "4"], "gape": ["0", "1", "2", "3"], "wet": ["0", "1", "2", "3"], "wear": ["on", "aside", "bare"],
            "cage": ["1", "leak"], "leak": ["1"], "bare": ["1"], "fin": ["1"], "ring": ["1"], "level": ["1", "2"], "busy": ["hand", "mouth", "sex"], "who": ["self", "her"], "marks": ["inside", "anus", "thighs", "chest", "face", "mouth"]}
    NOTE = {"size": "размер мужчины, 0 крошечный .. 4 огромный", "tsize": "размер игрушки, 0..4", "gape": "растяжение, 0 нет .. 3 сильно", "wet": "её влажность, 0 только следы .. 3 течёт",
            "wear": "бельё / одежда на этом месте: на месте, сдвинуто, нет", "cage": "муж в клетке: 1 сухо, leak течёт", "marks": "чужие следы на ней: где"}
    for tg, vals in TAGS.items():
        if tg in NOTE: o.append(f"# {tg}: {NOTE[tg]}")
        for v in vals: o.append(f"prompt.{tg}.{v}: {q(have.get(f'{tg}.{v}', ''))}")
    open(out, "w", encoding="utf-8").write("\n".join(o) + "\n")
    print(f"{len(keys)} lines, {len(ins)} close-ups -> {out}")

EN = "packages/base/locales/en.yaml"
KEYLINE = re.compile(r'^"?([\w.#+-]+)"?: (".*")\s*$')
def keyed(text):
    return {m.group(1): json.loads(m.group(2)) for m in map(KEYLINE.match, text.split("\n")) if m}
AREAS = "log.act,log.fin,log.take,log.bed,log.enc,log.crowd,log.join,log.group,log.husband,log.night,log.her.starts,log.her.night,log.solo,log.alone,log.caught,log.owes,log.moment,log.refuse,thought.take,thought.size,thought.bed"

def cover(csv_path, out, areas=AREAS):
    """The anketa built from what the game actually shows: most shown first, more empty slots where a line repeats most."""
    ru = keyed(open(RU, encoding="utf-8").read())
    want = tuple(areas.split(","))
    rows = []
    for line in open(csv_path, encoding="utf-8").read().split("\n")[1:]:
        fam, per, var, _ = line.rsplit(",", 3)
        if fam.startswith(want) and float(per) > 0: rows.append((float(per), fam))
    rows.sort(reverse=True)
    q = lambda t: json.dumps(t, ensure_ascii=False)
    o = ["# test-city: анкета по покрытию. Правила и контекст - в docs/GROK-TZ.md (прочитать сначала).",
         "# Каждая группа: сколько раз за игру (30 дней) строка выпадает, сейчас написанные варианты, и пустые слоты.",
         "# Заполнить пустые \"\" новыми вариантами той же ситуации; существующие можно переписать живее. Ключи и {слова в скобках} не трогать.", ""]
    n_new = 0
    for per, fam in rows:
        have = sorted([k for k in ru if k == fam or re.fullmatch(re.escape(fam) + r"(#\d+|\.\d+)", k)], key=lambda k: (len(k), k))
        if not have: continue
        target = 6 if per >= 20 else 5 if per >= 8 else 4 if per >= 3 else 3
        o.append(f"# --- {fam}: {per:.0f} раз за игру, вариантов сейчас {len(have)}")
        for k in have: o.append(f"{q(k) if '#' in k else k}: {q(ru[k])}")
        numbered = any(re.search(r"\.\d+$", k) for k in have)
        if numbered: continue  # families numbered .1/.2/.3 are picked by the game itself: their count is fixed in code
        used = {int(k.split("#")[1]) for k in have if "#" in k} | {1}
        i = 2
        while len(used) < target:
            if i not in used:
                o.append(f"{q(fam + '#' + str(i))}: \"\""); used.add(i); n_new += 1
            i += 1
    open(out, "w", encoding="utf-8").write("\n".join(o) + "\n")
    print(f"{len(rows)} families, {n_new} empty slots -> {out}")

def merge(path):
    # new wordings first: `key#N` that the game does not have yet
    got_all = keyed(open(path, encoding="utf-8").read())
    ru_now, en_now = keyed(open(RU, encoding="utf-8").read()), keyed(open(EN, encoding="utf-8").read())
    fresh = {k: v for k, v in got_all.items() if "#" in k and v.strip() and k not in ru_now}
    if fresh:
        with open(RU, "a", encoding="utf-8") as f: f.write("".join(f"{json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}\n" for k, v in fresh.items()))
        todo = [k for k in fresh if k not in en_now]
        with open(EN, "a", encoding="utf-8") as f: f.write("".join(f"{json.dumps(k)}: {json.dumps(en_now.get(k.split('#')[0], ''), ensure_ascii=False)}\n" for k in todo))
        open("docs/TRANSLATE.txt", "a", encoding="utf-8").write("".join(k + "\n" for k in todo))
        print(f"{len(fresh)} new wordings added; {len(todo)} wait for English (docs/TRANSLATE.txt)")
    changed = {k: v for k, v in got_all.items() if "#" in k and v.strip() and k in ru_now and ru_now[k] != v}
    if changed:
        lines_ = open(RU, encoding="utf-8").read().split("\n")
        for i, l in enumerate(lines_):
            m = KEYLINE.match(l)
            if m and m.group(1) in changed: lines_[i] = f"{json.dumps(m.group(1))}: {json.dumps(changed[m.group(1)], ensure_ascii=False)}"
        open(RU, "w", encoding="utf-8").write("\n".join(lines_))
    got = lines(open(path, encoding="utf-8").read())
    ru = open(RU, encoding="utf-8").read().split("\n")
    n = 0
    for i, l in enumerate(ru):
        m = LINE.match(l)
        if m and m.group(1) in got and not m.group(1).startswith("prompt.") and json.loads(m.group(2)) != got[m.group(1)]:
            ru[i] = f"{m.group(1)}: {json.dumps(got[m.group(1)], ensure_ascii=False)}"; n += 1
    open(RU, "w", encoding="utf-8").write("\n".join(ru))
    words = {k[7:]: v for k, v in got.items() if k.startswith("prompt.") and v.strip()}
    if words:  # an anketa without the prompt part leaves prompt.yaml alone
        p = open(PROMPT, encoding="utf-8").read()
        p = re.sub(r"^details:\n(?:  .*\n)*", "", p, flags=re.M).rstrip("\n") + "\n"
        p += "details:\n" + "".join(f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}\n" for k, v in sorted(words.items()))
        open(PROMPT, "w", encoding="utf-8").write(p)
    print(f"{n} game lines changed, {len(words)} prompt lines set. Now: pnpm content")

if __name__ == "__main__":
    if sys.argv[1] == "export": export(sys.argv[2], sys.argv[3])
    elif sys.argv[1] == "cover": cover(*sys.argv[2:5])
    else: merge(sys.argv[2])
