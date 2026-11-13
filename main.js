import { boot } from './catalog.js';
import './compare.js';

/* Переключение вкладок "Каталог" / "Сравнение". */
const tabButtons = document.querySelectorAll('.tab-btn');
const views = { catalog: document.getElementById('catalogView'), compare: document.getElementById('compareView') };

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', String(b === btn));
    });
    Object.entries(views).forEach(([key, section]) => {
      section.hidden = key !== btn.dataset.tab;
    });
  });
});

/* Предпросмотр фото: закрытие и доступность. */
const photoModal = document.getElementById('photoModal');
document.getElementById('photoClose').addEventListener('click', () => photoModal.close());
photoModal.addEventListener('click', (e) => {
  if (e.target === photoModal) photoModal.close();
});

boot();
