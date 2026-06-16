# assets/new-vision-icons

Пак иконок **New Vision** — отдельный от общего `assets/icons` (другой визуальный
язык). Сюда кладём только то, что у NV расходится с Q3.

## Таб-бар (первый потребитель)

Иконки таб-бара подключаются через модификатор `.tabbar.__vision`
(см. `new-vision/components/nv-tabbar.css`). Каждый слот — одна SVG, маской
(`mask`), поэтому цвет берётся из `currentColor`, заливка в самом SVG не важна.

Ожидаемые файлы (имена = слоты `.tabbar-icon.__slot-*`):

| слот         | файл              |
|--------------|-------------------|
| `feed`       | `feed.svg`        |
| `book`       | `book.svg`        |
| `message`    | `message.svg`     |
| `discussion` | `discussion.svg`  |
| `clip`       | `clip.svg`        |
| `menu`       | `menu.svg`        |

> Набор и порядок слотов у NV может отличаться от Q3 — финальный список
> сверяем с макетом Figma (нодой NV-таб-бара) и правим `nv-tabbar.css`.

Размер вьюпорта SVG — 24×24 (как у общего набора `*_24.svg`).
