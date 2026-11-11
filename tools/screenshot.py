"""Open dist/index.html from disk, click through some actions, save a screenshot.
Usage: python3 tools/screenshot.py out.png "Button label" "Other label*5" ..."""
import os, sys, pathlib
from playwright.sync_api import sync_playwright

out = sys.argv[1]
page_url = pathlib.Path(__file__).resolve().parent.parent.joinpath("dist/index.html").as_uri()
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": int(os.environ.get("W", 1500)), "height": int(os.environ.get("H", 900))})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(page_url)
    page.wait_for_selector(".app")
    save = os.environ.get("SAVE")
    if save:
        page.evaluate("s => localStorage.setItem('test-city.save', s)", open(save, encoding="utf-8").read())
    for label in sys.argv[2:]:
        name, _, times = label.partition("*")
        for _ in range(int(times or 1)):
            page.locator("button", has_text=name).first.click()
    page.screenshot(path=out, full_page=True)
    print("errors:", errors or "none")
    browser.close()
