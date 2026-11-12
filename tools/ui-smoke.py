"""UI smoke run: opens dist/index.html, starts a fixed game, plays a day and a half by pressing the main buttons,
opens every tab and dumps what is on screen. Run before and after a UI change and diff the two files.
Usage: python3 tools/ui-smoke.py out.txt [out.png]"""
import sys, pathlib
from playwright.sync_api import sync_playwright

out = sys.argv[1]
url = pathlib.Path(__file__).resolve().parent.parent.joinpath("dist/index.html").as_uri()
dump = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 1700, "height": 1000})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(url)
    page.wait_for_selector(".app")
    page.locator('input[type="number"]').fill("7")
    page.get_by_role("button", name="Любопытная").click()
    page.get_by_role("button", name="NTS").click()
    page.locator(".modal button, button").filter(has_text="Начать").first.click()
    snap = lambda tag: dump.append(f"=== {tag}\n" + page.locator(".app").inner_text())
    click = lambda name: page.get_by_role("button", name=name, exact=True).first.click()
    for name in ["Прозрачный режим", "Инспектор"]:
        click(name)
    snap("start")
    for step in range(60):
        # the first enabled wait of an hour if there is one, otherwise the next phase
        hour = page.locator("button:not([disabled])").filter(has_text="60").first
        nxt = page.locator("button:not([disabled])").filter(has_text="Следующая фаза").first
        (hour if hour.count() and step % 3 else nxt if nxt.count() else hour).click()
        if step % 6 == 0:
            for tab in ["Она", "Гости", "Почему", "Счёт"]:
                t = page.locator(".tabs button").filter(has_text=tab).first
                if t.count():
                    t.click()
                    snap(f"step {step} tab {tab}")
    snap("end")
    if len(sys.argv) > 2:
        page.screenshot(path=sys.argv[2], full_page=True)
    browser.close()
pathlib.Path(out).write_text("\n".join(dump), encoding="utf-8")
print(f"{len(dump)} snapshots, {sum(len(d) for d in dump)} chars, errors: {errors or 'none'}")
