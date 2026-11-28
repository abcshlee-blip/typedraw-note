"""v17 사진 오른쪽 클릭 메뉴 실측 — 라이브 페이지를 실제 크로미움으로 열어 오른쪽 클릭을 눌러 본다."""
import asyncio, os
from playwright.async_api import async_playwright

URL = "https://abcshlee-blip.github.io/typedraw-note/?v=17"
OUT = os.path.abspath("../reports/typedraw-note-v17")
os.makedirs(OUT, exist_ok=True)

def inside(box, w, h):
    return box["x"] >= 0 and box["y"] >= 0 and box["x"] + box["width"] <= w and box["y"] + box["height"] <= h

async def main():
    logs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1400, "height": 900}, device_scale_factor=2)
        page = await ctx.new_page()
        page.on("console", lambda m: logs.append(f"console {m.type}: {m.text}"))
        page.on("pageerror", lambda e: logs.append(f"pageerror: {e}"))

        await page.goto(URL, wait_until="load")
        await page.wait_for_timeout(800)

        await page.click("#btnNewBook")
        await page.fill("#promptInput", "사진메뉴 테스트")
        await page.click("#promptOk")
        await page.wait_for_timeout(700)

        await page.set_input_files("#photoInput", os.path.abspath("icon-512.png"))
        await page.wait_for_selector("#spread .obj-image img", timeout=8000)
        await page.wait_for_timeout(800)
        img = page.locator("#spread .obj-image img").first
        box = await img.bounding_box()
        print("image box", box)
        await page.screenshot(path=f"{OUT}/01-사진-넣음.png")

        menu = page.locator("#imgMenu")
        cx, cy = box["x"] + box["width"] * 0.45, box["y"] + box["height"] * 0.45

        # 1) 실제 오른쪽 클릭
        await page.mouse.click(cx, cy, button="right")
        await page.wait_for_timeout(400)
        print("menu visible after right click:", await menu.is_visible())
        mb = await menu.bounding_box()
        print("menu box", mb, "inside viewport:", inside(mb, 1400, 900))
        print("menu items", await page.locator("#imgMenu button").all_inner_texts())
        print("selected obj:", await page.locator("#spread .obj-image.selected").count())
        await page.screenshot(path=f"{OUT}/02-오른쪽클릭-메뉴.png")

        # 2) 바깥 클릭으로 닫힘
        await page.mouse.click(1250, 780)
        await page.wait_for_timeout(300)
        print("menu visible after outside click:", await menu.is_visible())

        # 3) Esc 로 닫힘
        await page.mouse.click(cx, cy, button="right")
        await page.wait_for_timeout(300)
        print("menu visible (2nd):", await menu.is_visible())
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(250)
        print("menu visible after Esc:", await menu.is_visible())

        # 4) 사진이 없는 빈 종이 오른쪽 클릭에는 앱 메뉴가 뜨지 않음
        await page.mouse.click(1050, 300, button="right")
        await page.wait_for_timeout(300)
        print("menu visible after right click on empty paper:", await menu.is_visible())

        # 5) 화면 가장자리 — 사진을 오른쪽 아래로 끌어 놓고 보이는 끝에서 오른쪽 클릭
        await page.mouse.move(cx, cy)
        await page.mouse.down()
        await page.mouse.move(1120, 690, steps=12)
        await page.mouse.up()
        await page.wait_for_timeout(500)
        box2 = await page.locator("#spread .obj-image img").first.bounding_box()
        print("image box after drag", box2)
        pr = await page.locator("#spread .page").nth(1).bounding_box()
        ex = min(box2["x"] + box2["width"], pr["x"] + pr["width"]) - 10
        ey = min(box2["y"] + box2["height"], pr["y"] + pr["height"]) - 10
        print("click point", (ex, ey), "page box", pr)
        await page.mouse.click(ex, ey, button="right")
        await page.wait_for_timeout(400)
        print("edge menu visible:", await menu.is_visible())
        mb2 = await menu.bounding_box()
        print("edge menu box", mb2, "inside viewport:", bool(mb2) and inside(mb2, 1400, 900))
        await page.screenshot(path=f"{OUT}/05-화면-가장자리-메뉴.png")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(200)

        # 6) 삭제 → 7) 되돌리기
        box3 = await page.locator("#spread .obj-image img").first.bounding_box()
        dx, dy = box3["x"] + box3["width"] * 0.5, box3["y"] + box3["height"] * 0.5
        await page.mouse.click(dx, dy, button="right")
        await page.wait_for_timeout(300)
        await page.click('#imgMenu [data-img="delete"]')
        await page.wait_for_timeout(500)
        print("images after delete:", await page.locator("#spread .obj-image").count())
        print("toast:", await page.locator("#toast").inner_text())
        await page.screenshot(path=f"{OUT}/03-삭제-후.png")

        await page.click("#btnUndo")
        await page.wait_for_timeout(700)
        print("images after undo:", await page.locator("#spread .obj-image").count())
        await page.screenshot(path=f"{OUT}/04-되돌리기-복구.png")

        # 8) 휠을 굴리면 메뉴가 닫히고 쪽은 넘어가지 않음
        box4 = await page.locator("#spread .obj-image img").first.bounding_box()
        wx, wy = box4["x"] + box4["width"] * 0.5, box4["y"] + box4["height"] * 0.5
        await page.mouse.click(wx, wy, button="right")
        await page.wait_for_timeout(300)
        await page.mouse.move(wx, wy)
        await page.mouse.wheel(0, 200)
        await page.wait_for_timeout(500)
        print("menu visible after wheel:", await menu.is_visible())
        print("page label:", await page.locator("#pageLabel").inner_text())

        # 9) 이미지 저장 — 다운로드
        await page.mouse.click(wx, wy, button="right")
        await page.wait_for_timeout(300)
        try:
            async with page.expect_download(timeout=8000) as dl:
                await page.click('#imgMenu [data-img="save"]')
            d = await dl.value
            print("download:", d.suggested_filename)
        except Exception as e:
            print("download failed:", e)

        # 10) 복사 — 클립보드 권한 있는 크로미움
        await page.mouse.click(wx, wy, button="right")
        await page.wait_for_timeout(300)
        await page.click('#imgMenu [data-img="copy"]')
        await page.wait_for_timeout(900)
        print("copy toast:", await page.locator("#toast").inner_text())

        # 11) 공유 — 헤드리스에는 공유 시트가 없어 안내가 나오는지
        await page.mouse.click(wx, wy, button="right")
        await page.wait_for_timeout(300)
        await page.click('#imgMenu [data-img="share"]')
        await page.wait_for_timeout(900)
        print("share toast:", await page.locator("#toast").inner_text())

        print("---- console/page errors ----")
        for l in logs:
            print(l)
        await b.close()

asyncio.run(main())
