"""Render silent, captioned architecture overviews with Pillow and ffmpeg.

Usage: python3 scripts/render_overviews.py
Requires Pillow, ffmpeg, and the configured font files. No app dependency changes.
"""
from pathlib import Path
import json
import math
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'videos'
OUT.mkdir(parents=True, exist_ok=True)
WIDTH, HEIGHT, FPS = 1280, 720, 12
BG = '#0e1622'
PANEL = '#182435'
LINE = '#344559'
TEXT = '#eef3fb'
MUTED = '#aab8cd'
GREEN = '#73e0bb'
RED = '#ffadab'
FONT_DIR = Path('/System/Library/Fonts/Supplemental')
FONTS = {}


def font(size, bold=False):
    key = (size, bold)
    if key not in FONTS:
        name = 'Arial Bold.ttf' if bold else 'Arial.ttf'
        FONTS[key] = ImageFont.truetype(str(FONT_DIR / name), size)
    return FONTS[key]


def lines_for(draw, text, size, width, bold=False):
    lines = []
    for paragraph in text.split('\n'):
        current = ''
        for word in paragraph.split():
            candidate = f'{current} {word}'.strip()
            if current and draw.textlength(candidate, font=font(size, bold)) > width:
                lines.append(current)
                current = word
            else:
                current = candidate
        lines.append(current)
    return lines


def paragraph(draw, text, xy, width, size=26, color=TEXT, bold=False, line_height=None):
    x, y = xy
    line_height = line_height or int(size * 1.3)
    for line in lines_for(draw, text, size, width, bold):
        draw.text((x, y), line, font=font(size, bold), fill=color)
        y += line_height
    return y


def node(draw, xy, title, subtitle='', active=False, accent=GREEN, width=240, height=90):
    x, y = xy
    draw.rounded_rectangle((x, y, x + width, y + height), 14, fill=PANEL, outline=accent if active else LINE, width=3 if active else 2)
    paragraph(draw, title, (x + 18, y + 15), width - 36, 23, TEXT, True)
    if subtitle:
        paragraph(draw, subtitle, (x + 18, y + 48), width - 36, 18, MUTED)


def arrow(draw, start, end, accent, phase=0, animated=True):
    draw.line([start, end], fill=LINE, width=3)
    dx, dy = end[0] - start[0], end[1] - start[1]
    distance = max(1, math.hypot(dx, dy))
    ux, uy = dx / distance, dy / distance
    px, py = -uy, ux
    tip = end
    draw.polygon([tip, (tip[0] - ux * 13 + px * 6, tip[1] - uy * 13 + py * 6), (tip[0] - ux * 13 - px * 6, tip[1] - uy * 13 - py * 6)], fill=accent)
    if animated:
        t = phase % 1
        x, y = start[0] + dx * t, start[1] + dy * t
        draw.ellipse((x - 6, y - 6, x + 6, y + 6), fill=accent)


def bullet_panel(draw, title, bullets, xy, width=520, color=GREEN):
    x, y = xy
    draw.rounded_rectangle((x, y, x + width, y + 320), 16, fill=PANEL, outline=LINE)
    draw.text((x + 24, y + 20), title, font=font(25, True), fill=color)
    cursor = y + 74
    for bullet in bullets:
        draw.ellipse((x + 25, cursor + 8, x + 33, cursor + 16), fill=color)
        cursor = paragraph(draw, bullet, (x + 50, cursor), width - 76, 23, TEXT) + 17


def layout_diagram(draw, accent, phase, labels):
    for index in range(4):
        x = 64 + index * 290
        active = index == 0 or index == 2
        draw.rounded_rectangle((x, 230, x + 262, 500), 12, fill=PANEL, outline=accent if active else LINE, width=2)
        draw.text((x + 18, 249), 'Deal' if index == 0 else f'Product {index}', font=font(23, True), fill=TEXT)
        for row, label in enumerate(labels):
            y = 296 + row * 56
            draw.text((x + 18, y), label, font=font(17), fill=MUTED)
            draw.rounded_rectangle((x + 18, y + 23, x + 244, y + 43), 5, fill='#24364d')
        if index == 0:
            draw.text((x + 18, 466), 'Shared + aggregate controls', font=font(16), fill=accent)
    draw.text((70, 524), 'Original structure: one deal, N product columns', font=font(22), fill=MUTED)


def field_flow(draw, accent, phase, kind):
    node(draw, (62, 280), 'Product input', 'Typed field edit', True, accent, width=220)
    middle = {'valtio': ('Small proxy', 'One product owns it'), 'zustand': ('Product store', 'Explicit set action'), 'jotai': ('Field atom', 'One dependency graph')}[kind]
    node(draw, (356, 280), *middle, True, accent, width=240)
    node(draw, (682, 280), 'Read subscription', {'valtio': 'Access-tracked snapshot', 'zustand': 'Field selector', 'jotai': 'useAtomValue'}[kind], True, accent, width=240)
    node(draw, (1004, 280), 'Input update', 'Only changed input', True, accent, width=214)
    arrow(draw, (285, 325), (350, 325), accent, phase)
    arrow(draw, (600, 325), (676, 325), accent, phase + .3)
    arrow(draw, (926, 325), (998, 325), accent, phase + .6)
    node(draw, (360, 436), 'Product B', 'No notification', False, accent)
    node(draw, (686, 436), 'Product C', 'No notification', False, accent)


def shared_flow(draw, accent, phase):
    node(draw, (510, 220), 'Canonical shared state', 'One value, many views', True, accent, width=290)
    for i, x in enumerate([140, 510, 880]):
        node(draw, (x, 412), f'Product {i + 1} input', 'Reads the same value', True, accent, width=260)
        arrow(draw, (655, 314), (x + 130, 406), accent, phase + i * .2)
    draw.text((70, 532), 'Bulk changes are commands. Summaries follow the data.', font=font(23), fill=MUTED)


def fanout_flow(draw, accent, phase):
    node(draw, (494, 215), 'One workspace store', 'Any field changes', True, accent, width=310)
    for i, x in enumerate([85, 500, 915]):
        node(draw, (x, 420), f'Selector {i + 1}', 'Runs, then compares', True, accent, width=280)
        arrow(draw, (649, 312), (x + 140, 414), accent, phase + i * .22)
    draw.text((70, 533), 'Selectors can skip React renders while still doing checks.', font=font(23), fill=MUTED)


def atom_flow(draw, accent, phase):
    node(draw, (110, 310), 'Changed field atom', 'One product', True, accent, width=280)
    node(draw, (528, 216), 'Derived field error', 'Cached validation', True, accent, width=290)
    node(draw, (528, 400), 'Invalid-field count', 'Update on validity change', True, accent, width=290)
    node(draw, (940, 310), 'Deal summary', 'No full-list scan', True, accent, width=240)
    arrow(draw, (392, 350), (522, 264), accent, phase)
    arrow(draw, (392, 360), (522, 446), accent, phase + .3)
    arrow(draw, (823, 446), (932, 356), accent, phase + .6)


def batch_flow(draw, accent, phase):
    node(draw, (73, 310), 'Broadcast command', 'Typed write transaction', True, accent, width=280)
    draw.rounded_rectangle((426, 218, 878, 530), 18, outline=accent, width=2)
    draw.text((448, 236), 'One transaction', font=font(22, True), fill=accent)
    for i in range(3):
        node(draw, (456, 286 + i * 74), f'Product {i + 1} field', '', True, accent, width=388, height=62)
        arrow(draw, (358, 356), (448, 317 + i * 74), accent, phase + i * .2)
    node(draw, (948, 310), 'Summary', 'One notification', True, accent, width=250)
    arrow(draw, (884, 360), (942, 360), accent, phase)


def apollo_flow(draw, accent, phase):
    node(draw, (72, 260), 'Apollo cache', 'Remote entities', True, accent, width=265)
    node(draw, (490, 260), 'Validated snapshot', 'Explicit load only', True, accent, width=300)
    node(draw, (940, 260), 'Isolated draft', 'Local edits', True, accent, width=265)
    arrow(draw, (341, 306), (484, 306), accent, phase)
    arrow(draw, (796, 306), (934, 306), accent, phase + .4)
    node(draw, (490, 438), 'Save captured revision', 'Newer edits stay dirty', True, accent, width=300)
    arrow(draw, (1070, 356), (796, 485), accent, phase + .2)
    arrow(draw, (484, 482), (204, 356), accent, phase + .6)


def live_flow(draw, accent, phase):
    node(draw, (70, 295), 'Apollo subscription', 'Display-only / no-cache', True, accent, width=285)
    node(draw, (495, 295), 'Latest-value channel', '10,000 messages / burst', True, accent, width=290)
    node(draw, (935, 295), 'React display', '1 frame notification', True, accent, width=285)
    arrow(draw, (359, 340), (489, 340), accent, phase)
    arrow(draw, (789, 340), (929, 340), accent, phase + .4)
    draw.text((72, 472), 'Virtualized wrapping columns keep the DOM bounded.', font=font(24), fill=MUTED)
    draw.text((72, 512), 'The deal controls stay mounted during scrolling.', font=font(24), fill=MUTED)


def choice(draw, accent, phase, title, body, metric):
    draw.rounded_rectangle((66, 232, 1214, 512), 20, fill=PANEL, outline=accent, width=2)
    paragraph(draw, title, (96, 264), 1070, 34, TEXT, True)
    paragraph(draw, body, (96, 330), 1050, 27, MUTED)
    draw.text((96, 453), metric, font=font(27, True), fill=accent)


STORIES = [
    {
        'slug': '01-valtio', 'name': 'Valtio: scoped proxies', 'accent': '#73e0bb', 'kind': 'valtio',
        'scenes': [
            {'seconds': 10, 'title': 'Preserve the UI. Partition the state.', 'visual': 'layout', 'caption': 'Keep one deal column and N product columns. Apollo owns remote data. Shared values live once; independent product fields live in small proxies.'},
            {'seconds': 13, 'title': 'How an isolated field update works', 'visual': 'field', 'caption': 'A typed action mutates one product proxy. Its access-tracked snapshot updates the subscribed input. Other product proxies receive no subscription notification.'},
            {'seconds': 13, 'title': 'Shared fields and deal summaries', 'visual': 'shared', 'caption': 'Linked inputs read one shared proxy. Broadcasts are explicit commands. Derive summaries or maintain counts in commands; avoid two-way synchronization effects.'},
            {'seconds': 13, 'title': 'Advantages', 'visual': 'benefits', 'bullets': ['Smallest migration from the parent', 'Concise, direct mutation syntax', 'Efficient product-scoped subscriptions', '0.62 ms / 2,000 scalar writes'], 'caption': 'Corrected Valtio keeps the existing programming style. Narrow subscriptions are efficient; no replacement library is required to fix state ownership.'},
            {'seconds': 13, 'title': 'Disadvantages', 'visual': 'costs', 'bullets': ['Proxy and snapshot roles must stay clear', 'Root subscriptions can still fan out', 'Derived state and bulk updates need care', 'Effects and live sources need cleanup'], 'caption': 'The library does not enforce good boundaries. Broad snapshots, duplicated values, and unmanaged effects can bring the original problems back.'},
            {'seconds': 10, 'title': 'When I would choose it', 'visual': 'choice', 'headline': 'Choose it for the smallest migration.', 'body': 'A strong option when direct mutations matter and derived relationships remain easy to manage.', 'metric': 'Fast scalar writes. More application-owned coordination.', 'caption': 'Valtio remains a defensible choice. Preserve canonical fields, typed commands, virtualization, and lifecycle cleanup regardless of the library.'},
        ],
    },
    {
        'slug': '02-zustand', 'name': 'Zustand: selectors and product stores', 'accent': '#ffc17b', 'kind': 'zustand',
        'scenes': [
            {'seconds': 9, 'title': 'Explicit actions behind the same columns', 'visual': 'layout', 'caption': 'Zustand keeps the original deal and product UI. Apollo handles remote entities. Actions change state; selectors choose what each input reads.'},
            {'seconds': 13, 'title': 'One store: selector checks still fan out', 'visual': 'fanout', 'caption': 'Workspace selectors can skip unrelated React renders, but every subscribed selector still checks an update. At 1,000 subscribers, 2,000 edits caused two million checks.'},
            {'seconds': 13, 'title': 'Shard by product to bound the work', 'visual': 'field', 'caption': 'A small store per product isolates local edits. Shared fields live in a separate store. Cross-product commands coordinate these stores explicitly.'},
            {'seconds': 13, 'title': 'Advantages', 'visual': 'benefits', 'bullets': ['Simple action and selector API', 'Useful middleware and debugging tools', 'Fastest scalar writes in this local test', '0.21 ms / 2,000 writes, sharded'], 'caption': 'Product stores made only one subscription check per edit. The timing measures scalar writes, not initialization, memory use, or browser latency.'},
            {'seconds': 13, 'title': 'Disadvantages', 'visual': 'costs', 'bullets': ['More stores to own and coordinate', 'Cross-product derivations need wiring', 'No single transaction across stores', 'Selector outputs need stable identities'], 'caption': 'Partitioning improves subscription work but increases coordination. Shared summaries and bulk commands require deliberate design across separate stores.'},
            {'seconds': 11, 'title': 'When I would choose it', 'visual': 'choice', 'headline': 'Choose it for command-heavy state.', 'body': 'A strong default when actions are explicit and there are few cross-field derived relationships.', 'metric': 'Workspace: 30.38 ms. Product stores: 0.21 ms.', 'caption': 'Both measurements cover 2,000 scalar writes at 1,000 subscribers. Shard only when measured fan-out justifies the extra store instances.'},
        ],
    },
    {
        'slug': '03-jotai-apollo', 'name': 'Jotai + Apollo: the selected architecture', 'accent': '#baa4ff', 'kind': 'jotai',
        'scenes': [
            {'seconds': 10, 'title': 'One isolated draft store per deal', 'visual': 'layout', 'caption': 'This is the implemented architecture. The original columns remain. Shared fields have canonical atoms; each independent product field has its own atom.'},
            {'seconds': 13, 'title': 'Field dependencies drive local updates', 'visual': 'atoms', 'caption': 'A field edit updates its dependency neighborhood. Validation is derived. An incremental invalid-field count updates the deal summary without scanning every product.'},
            {'seconds': 12, 'title': 'Broadcasts are atomic write commands', 'visual': 'batch', 'caption': 'One write transaction updates all current products. Empty values and repeated commands work. Subscribers see the completed update; new products start empty.'},
            {'seconds': 13, 'title': 'Apollo owns remote state; Jotai owns edits', 'visual': 'apollo', 'caption': 'Load once into a draft and save an explicit snapshot. Refetches do not silently overwrite edits. Save acknowledgements preserve changes made during the request.'},
            {'seconds': 12, 'title': 'Live displays stay outside the draft graph', 'visual': 'live', 'caption': 'Display-only subscriptions skip cache writes and publish once per animation frame. Wrapping product columns are virtualized while deal controls remain mounted.'},
            {'seconds': 13, 'title': 'Advantages and disadvantages', 'visual': 'tradeoffs', 'benefits': ['Explicit field and validation dependencies', 'Atomic cross-product write commands', 'Direct React hooks and scoped providers'], 'costs': ['More atom objects', 'Higher raw-write overhead than rivals', 'Bulk commands still cost O(N)'], 'caption': 'Jotai was selected for composition and maintainability. It is not the fastest scalar-write option: the local primitive test measured 1.59 milliseconds for 2,000 writes.'},
            {'seconds': 10, 'title': 'Why this is the current choice', 'visual': 'choice', 'headline': 'Clear ownership and predictable dependencies.', 'body': 'One input commit among 1,000 subscribed inputs. Typed snapshots connect to the host Apollo client.', 'metric': 'Real server wiring and draft persistence remain explicit.', 'caption': 'The adapter is tested with an actual Apollo client and a controlled link. Production wiring still needs generated operations, client configuration, and a server conflict policy.'},
        ],
    },
]


def render_frame(story, scene, scene_index, elapsed, total_elapsed, total_duration):
    image = Image.new('RGB', (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(image)
    accent = story['accent']
    draw.rounded_rectangle((50, 38, 76, 64), 6, fill=accent)
    draw.text((92, 37), story['name'], font=font(25, True), fill=TEXT)
    draw.text((50, 101), scene['title'], font=font(36, True), fill=TEXT)
    draw.text((52, 155), f"{scene_index + 1:02d} / {len(story['scenes']):02d}   |   CAPTIONS ONLY", font=font(17), fill=MUTED)
    phase = elapsed / 1.9
    visual = scene['visual']
    if visual == 'layout':
        layout_diagram(draw, accent, phase, ['Shared code', 'Shared code', 'Independent field'])
    elif visual == 'field':
        field_flow(draw, accent, phase, story['kind'])
    elif visual == 'shared':
        shared_flow(draw, accent, phase)
    elif visual == 'fanout':
        fanout_flow(draw, accent, phase)
    elif visual == 'atoms':
        atom_flow(draw, accent, phase)
    elif visual == 'batch':
        batch_flow(draw, accent, phase)
    elif visual == 'apollo':
        apollo_flow(draw, accent, phase)
    elif visual == 'live':
        live_flow(draw, accent, phase)
    elif visual in ('benefits', 'costs'):
        bullet_panel(draw, 'What you gain' if visual == 'benefits' else 'What you must manage', scene['bullets'], (70, 216), width=1140, color=accent if visual == 'benefits' else RED)
    elif visual == 'tradeoffs':
        bullet_panel(draw, 'Advantages', scene['benefits'], (65, 218), width=550, color=accent)
        bullet_panel(draw, 'Disadvantages', scene['costs'], (645, 218), width=570, color=RED)
    elif visual == 'choice':
        choice(draw, accent, phase, scene['headline'], scene['body'], scene['metric'])
    draw.rounded_rectangle((40, 574, 1240, 680), 12, fill='#223249')
    caption_lines = lines_for(draw, scene['caption'], 25, 1140)
    if len(caption_lines) > 3:
        raise ValueError(f"Caption needs more than three lines: {story['slug']} / {scene_index}")
    paragraph(draw, scene['caption'], (66, 590 + (3 - len(caption_lines)) * 8), 1140, 25, TEXT, line_height=30)
    draw.text((50, 694), 'Local scalar benchmark: Node 24.20.0, 1,000 subscribers. Not browser latency.', font=font(13), fill=MUTED)
    draw.rectangle((0, 715, WIDTH, 719), fill=LINE)
    draw.rectangle((0, 715, int(WIDTH * total_elapsed / total_duration), 719), fill=accent)
    return image


def timecode(seconds, separator=','):
    milliseconds = int(seconds * 1000)
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, milliseconds = divmod(remainder, 1000)
    return f'{hours:02d}:{minutes:02d}:{seconds:02d}{separator}{milliseconds:03d}'


def render(story):
    path = OUT / f"{story['slug']}.mp4"
    total_duration = sum(scene['seconds'] for scene in story['scenes'])
    command = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{WIDTH}x{HEIGHT}', '-r', str(FPS), '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(path)]
    with (OUT / f"{story['slug']}.render.log").open('wb') as log:
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=log)
        timeline = []
        cursor = 0
        for index, scene in enumerate(story['scenes']):
            if index == 0:
                render_frame(story, scene, index, 0, 0, total_duration).save(OUT / f"{story['slug']}.jpg", quality=92)
            timeline.append((cursor, cursor + scene['seconds'], scene))
            for frame in range(scene['seconds'] * FPS):
                elapsed = frame / FPS
                image = render_frame(story, scene, index, elapsed, cursor + elapsed, total_duration)
                process.stdin.write(image.tobytes())
            cursor += scene['seconds']
        process.stdin.close()
        if process.wait() != 0:
            raise RuntimeError(f'ffmpeg failed; see {log.name}')
    (OUT / f"{story['slug']}.render.log").unlink()
    srt = []
    vtt = ['WEBVTT\n']
    for index, (start, end, scene) in enumerate(timeline, 1):
        text = f"{scene['title']}\n{scene['caption']}"
        srt.append(f'{index}\n{timecode(start)} --> {timecode(end)}\n{text}\n')
        vtt.append(f'{timecode(start, ".")} --> {timecode(end, ".")}\n{text}\n')
    (OUT / f"{story['slug']}.srt").write_text('\n'.join(srt))
    (OUT / f"{story['slug']}.vtt").write_text('\n'.join(vtt))
    print(f'{path.name}: {total_duration}s, {path.stat().st_size / 1024 / 1024:.2f} MiB', flush=True)
    return {'file': path.name, 'durationSeconds': total_duration, 'bytes': path.stat().st_size, 'width': WIDTH, 'height': HEIGHT, 'fps': FPS, 'audio': False}


def main():
    results = [render(story) for story in STORIES]
    (OUT / 'manifest.json').write_text(json.dumps(results, indent=2) + '\n')


if __name__ == '__main__':
    main()
