"""Open dist/index.html from disk, click through some actions, save a screenshot.
Usage: python3 tools/screenshot.py out.png "Button label" "Other label*5" ..."""
import sys, pathlib
from playwright.sync_api import sync_playwright

out = sys.argv[1]
page_url = pathlib.Path(__file__).resolve().parent.parent.joinpath("dist/index.html").as_uri()
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 1100, "height": 1000})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(page_url)
    page.wait_for_selector("main")
    for label in sys.argv[2:]:
        name, _, times = label.partition("*")
        for _ in range(int(times or 1)):
            page.get_by_role("button", name=name, exact=True).first.click()
    page.screenshot(path=out, full_page=True)
    print("errors:", errors or "none")
    browser.close()
