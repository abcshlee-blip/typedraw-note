"""v17 보조 실측 — 클립보드 복사(권한 허용), 삭제 후 새로고침 유지, 도구 바꾸면 메뉴 닫힘, 터치 길게 누름."""
import asyncio, os
from playwright.async_api import async_playwright

URL = "https://abcshlee-blip.github.io/typedraw-note/?v=17"
OUT = os.path.abspath("../reports/typedraw-note-v17")

async def main():
    logs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1400, "height": 900}, device_scale_factor=2,
                                  permissions=["clipboard-read", "clipboard-write"], has_touch=True)
        page = await ctx.new_page()
        page.on("pageerror", lambda e: logs.append(f"pageerror: {e}"))
        await page.goto(URL, wait_until="load")
        await page.wait_for_timeout(700)

        await page.click("#btnNewBook")
        await page.fill("#promptInput", "복사 테스트")
        await page.click("#promptOk")
        await page.wait_for_timeout(600)
        await page.set_input_files("#photoInput", os.path.abspath("icon-512.png"))
        await page.wait_for_selector("#spread .obj-image img", timeout=8000)
        await page.wait_for_timeout(700)

        box = await page.locator("#spread .obj-image img").first.bounding_box()
        cx, cy = box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.5

        # 클립보드 복사
        await page.mouse.click(cx, cy, button="right")
        await page.wait_for_timeout(300)
        await page.click('#imgMenu [data-img="copy"]')
        await page.wait_for_timeout(1000)
        print("copy toast:", await page.locator("#toast").inner_text())
        clip = await page.evaluate("""async () => {
          const items = await navigator.clipboard.read();
          return items.map(i => i.types.join(','));
        }""")
        print("clipboard types:", clip)

        # 도구를 바꾸면 메뉴가 닫힘
        await page.mouse.click(cx, cy, button="right")
        await page.wait_for_timeout(300)
        print("menu before tool switch:", await page.locator("#imgMenu").is_visible())
        await page.click('.tool[data-tool="pen"]')
        await page.wait_for_timeout(300)
        print("menu after tool switch:", await page.locator("#imgMenu").is_visible())

        # 터치로 길게 누르기(CDP) — 앱 메뉴가 뜨지 않아야 함
        await page.evaluate("() => 1")
        cdp = await ctx.new_cdp_session(page)
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart",
            "touchPoints": [{"x": cx, "y": cy, "id": 1}]})
        await page.wait_for_timeout(900)
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        await page.wait_for_timeout(400)
        print("menu after touch long press:", await page.locator("#imgMenu").is_visible())
        print("browser contextmenu prevented? (앱 메뉴 없음이면 정상)")

        # 삭제 후 새로고침해도 사진이 없어야 함(자동 저장)
        await page.mouse.click(cx, cy, button="right")
        await page.wait_for_timeout(300)
        await page.click('#imgMenu [data-img="delete"]')
        await page.wait_for_timeout(900)
        print("images before reload:", await page.locator("#spread .obj-image").count())
        await page.reload(wait_until="load")
        await page.wait_for_timeout(1200)
        # 책장에서 첫 노트 열기(마지막 쓴 노트)
        await page.locator(".book").first.click()
        await page.wait_for_timeout(1200)
        print("images after reload:", await page.locator("#spread .obj-image").count())
        await page.screenshot(path=f"{OUT}/06-삭제-새로고침-유지.png")

        print("---- errors ----")
        for l in logs:
            print(l)
        await b.close()

asyncio.run(main())
