/**
 * Каталог подарков — зеркало data/gifts.json для браузера
 * (window.DS_GIFTS_DATA). Собрано scripts/fetch-gifts.mjs из листа «Подарки».
 * Структура: { [тип]: [{ id, image, price }] }. Типы: basic (базовая
 * страница), friendversary (приход с годовщины). Не редактировать вручную —
 * правь таблицу и перегоняй скриптом.
 */
window.DS_GIFTS_DATA = {
  "friendversary": [
    {
      "id": "friendversary-1",
      "image": "assets/gifts/2c88625b66d012f5.gif",
      "price": "0 ОК"
    },
    {
      "id": "friendversary-2",
      "image": "assets/gifts/87ab9618f8d32ff1.webp",
      "price": "0 ОК"
    },
    {
      "id": "friendversary-3",
      "image": "assets/gifts/62a8065ef24ed574.jpg",
      "price": "0 ОК"
    },
    {
      "id": "friendversary-4",
      "image": "assets/gifts/2ae0737717d8c24e.gif",
      "price": "0 ОК"
    },
    {
      "id": "friendversary-5",
      "image": "assets/gifts/15f2ca0817f1d351.jpg",
      "price": "0 ОК"
    },
    {
      "id": "friendversary-6",
      "image": "assets/gifts/5e6d61ff848b8a76.jpg",
      "price": "0 ОК"
    }
  ],
  "basic": [
    {
      "id": "basic-1",
      "image": "assets/gifts/5aa90cf1d5001c51.gif",
      "price": "0 ОК"
    },
    {
      "id": "basic-2",
      "image": "assets/gifts/a80cb5926503b03a.jpg",
      "price": "0 ОК"
    },
    {
      "id": "basic-3",
      "image": "assets/gifts/0b5f1dfc84df8270.gif",
      "price": "0 ОК"
    },
    {
      "id": "basic-4",
      "image": "assets/gifts/b4001253d8302881.gif",
      "price": "0 ОК"
    },
    {
      "id": "basic-5",
      "image": "assets/gifts/d7d90bc43c674792.gif",
      "price": "0 ОК"
    },
    {
      "id": "basic-6",
      "image": "assets/gifts/bb5a45d04c2ef81d.gif",
      "price": "0 ОК"
    }
  ]
};
