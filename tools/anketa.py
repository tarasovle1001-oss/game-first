#!/usr/bin/env python3
"""One file out, one file back.
  python3 tools/anketa.py export <since-commit> out.yaml   - every Russian line added since that commit, plus the prompt words for close-ups
  python3 tools/anketa.py merge filled.yaml                - puts the filled lines into ru.yaml and prompt.yaml
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

def merge(path):
    got = lines(open(path, encoding="utf-8").read())
    ru = open(RU, encoding="utf-8").read().split("\n")
    n = 0
    for i, l in enumerate(ru):
        m = LINE.match(l)
        if m and m.group(1) in got and not m.group(1).startswith("prompt.") and json.loads(m.group(2)) != got[m.group(1)]:
            ru[i] = f"{m.group(1)}: {json.dumps(got[m.group(1)], ensure_ascii=False)}"; n += 1
    open(RU, "w", encoding="utf-8").write("\n".join(ru))
    words = {k[7:]: v for k, v in got.items() if k.startswith("prompt.") and v.strip()}
    p = open(PROMPT, encoding="utf-8").read()
    p = re.sub(r"^details:\n(?:  .*\n)*", "", p, flags=re.M).rstrip("\n") + "\n"
    if words: p += "details:\n" + "".join(f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}\n" for k, v in sorted(words.items()))
    open(PROMPT, "w", encoding="utf-8").write(p)
    print(f"{n} game lines changed, {len(words)} prompt lines set. Now: pnpm content")

if __name__ == "__main__":
    export(sys.argv[2], sys.argv[3]) if sys.argv[1] == "export" else merge(sys.argv[2])
