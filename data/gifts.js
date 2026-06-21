/**
 * Каталог подарков (картинки/цены) — зеркало data/gifts.json для браузера
 * (window.DS_GIFTS_DATA), чтобы не зависеть от fetch локального json.
 * Поля: id (для send-gift.html?gift=ID), image (URL постера), price ("N ОК").
 * Сюда заменяем картинки на свои — сетка подарков соберётся автоматически.
 */
window.DS_GIFTS_DATA = [
  { id: 'cake',    image: 'https://cdn.fkimages.ru/posts/big/kartinka-s-dnem-rozhdeniya-odnoklassniku-s-nadpisyu-239.jpg', price: '0 ОК' },
  { id: 'bouquet', image: 'https://cool.klev.club/uploads/posts/2025-05/2630/na_den_rozhdeniya_odnoklassniku_15_9e514099.jpg',          price: '0 ОК' },
  { id: 'classic', image: 'https://cdn.fkimages.ru/posts/big/kartinka-s-dnem-rozhdeniya-odnoklassnik-1841.jpg',                   price: '0 ОК' },
  { id: 'heart',   image: 'https://play-lh.googleusercontent.com/DIUjj_0djlD0xfteoleEnmD6CkmpIqMoHMwuH3AvhL85duDITmjEr9w_ib_VAC3ejQc=w240-h480-rw', price: '0 ОК' },
  { id: 'social',  image: 'https://123ot.ru/img/00003/skachaty-besplatno-whatsapp-odnoklassniki-instagram-774945.jpg',            price: '2 ОК' },
  { id: 'flowers', image: 'https://kartinki-life.ru/articles/2020/02/07/kartinki-i-otkrytki-s-dnjom-rozhdeniya-22-7.jpg',          price: '5 ОК' }
];
