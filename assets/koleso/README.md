# assets/koleso

Картинки для флоу «Колесо призов» (`koleso/`).

Имена файлов — ASCII-слаги (транслит), чтобы пути работали в вебе без
percent-encoding.

## UI-иконки (кнопки/счётчик)
| Файл | Где используется |
|---|---|
| `moi-prizy.png` | кнопка «Мои призы» (`.rl-action__img`) |
| `zadaniia.png` | кнопка «Задания» |
| `biletik.png` | счётчик билетов + CTA «Крутить колесо» |

## Призы барабана (`.rl-prize__img` на `koleso/koleso.html`)
`aifon.png`, `ozon-promokod.png`, `telefon.png`, `pylesos.png`, `fen.png`,
`chainik.png`, `chainik-igrushka.png`, `gril.png`, `barbekiu.png`,
`shveinaia.png`, `mebel.png`, `podarok.png`, `oki.png`.

## Формат
- PNG с прозрачностью (3D-рендеры) или фото на белом — подиум барабана белый.
- Призы рисуются в подиуме 168×168 (картинка `object-fit:contain` 140×140).
- Иконки кнопок — отрисовка 84px с «вылетом» над карточкой.
