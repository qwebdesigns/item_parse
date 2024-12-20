// Функция для загрузки данных из JSON
async function loadData() {
    try {
        const response = await fetch('https://blockade3d.com/api_classic/handler.php?NETWORK=1&CMD=2000&PWD=2b984b3689f5f6f96d65357b6c93c042&API_VERSION=2');
        
        // Проверка на успешный ответ
        if (!response.ok) {
            throw new Error('Сетевая ошибка: ' + response.status);
        }

        const data = await response.json();

        // Преобразуем текст в формате Unicode
        const decodedData = data.map(item => {
            return {
                ...item,
                item_name_en: item.item_name_en ? decodeUnicode(item.item_name_en) : item.item_name_en,
                item_name_ru: item.item_name_ru ? decodeUnicode(item.item_name_ru) : item.item_name_ru,
                item_type: {
                    ...item.item_type,
                    name: item.item_type && item.item_type.name ? decodeUnicode(item.item_type.name) : item.item_type.name
                },
                item_category: {
                    ...item.item_category,
                    name: item.item_category && item.item_category.name ? decodeUnicode(item.item_category.name) : item.item_category.name
                }
            };
        });

        renderTable(decodedData);

        // Добавляем обработчики событий для заголовков
        const headers = document.querySelectorAll('#data-table th');
        headers.forEach((header, index) => {
            header.addEventListener('click', () => {
                const isAscending = header.classList.toggle('ascending');
                const sortedData = sortData(decodedData, index, isAscending);
                renderTable(sortedData);
            });

            // Добавляем возможность изменения ширины столбца
            const resizer = document.createElement('div');
            resizer.className = 'resizer';
            header.appendChild(resizer);

            let startX, startWidth;

            resizer.addEventListener('mousedown', (e) => {
                startX = e.clientX;
                startWidth = header.offsetWidth;
                document.addEventListener('mousemove', resizeColumn);
                document.addEventListener('mouseup', stopResize);
            });

            function resizeColumn(e) {
                const newWidth = startWidth + (e.clientX - startX);
                header.style.width = `${newWidth}px`;
            }

            function stopResize() {
                document.removeEventListener('mousemove', resizeColumn);
                document.removeEventListener('mouseup', stopResize);
            }
        });
    } catch (error) {
        // Выводим сообщение об ошибке
        document.getElementById('error-message').innerText = 'Ошибка загрузки данных: ' + error.message;
    }
}

// Функция для декодирования текста в формате Unicode
function decodeUnicode(str) {
    if (str) {
        return str.replace(/\\u([\dA-Fa-f]{4})/g, (match, grp) => String.fromCharCode(parseInt(grp, 16)));
    }
    return str; // Возвращаем str, если оно null или undefined
}


// Функция для сортировки данных
function sortData(data, columnIndex, ascending) {
    return data.sort((a, b) => {
        const aValue = getValueByColumnIndex(a, columnIndex);
        const bValue = getValueByColumnIndex(b, columnIndex);

        if (aValue < bValue) return ascending ? -1 : 1;
        if (aValue > bValue) return ascending ? 1 : -1;
        return 0;
    });
}

// Функция для получения значения по индексу столбца
function getValueByColumnIndex(item, index) {
    const key = headerOrder[index]; // Получаем ключ из headerOrder
    switch (key) {
        case 'item_id': return parseInt(item.item_id); // Преобразуем в число
        case 'icon': return item.icon; // Для иконок сортировка не имеет смысла
        case 'item_type': return item.item_type.name; // Получаем имя типа
        case 'item_category': return item.item_category.name; // Получаем имя категории
        case 'item_min_lvl': return parseInt(item.item_min_lvl); // Преобразуем в число для корректной сортировки
        case 'item_visible': 
            return item.item_visible && item.item_visible.name ? item.item_visible.name : ''; // Сортируем по имени
        case 'item_theme': 
            return item.item_theme ? item.item_theme.toString() : ''; // Преобразуем в строку для сортировки
        case 'item_cost_gold': return parseFloat(item.item_cost_gold); // Преобразуем в число для корректной сортировки
        case 'item_buy_amount': return parseInt(item.item_buy_amount); // Преобразуем в число для корректной сортировки
        case 'item_name_ru': return item.item_name_ru; // Название на русском
        case 'item_name_en': return item.item_name_en; // Название на английском
        case 'upgrades': return item.upgrades.map(upgrade => upgrade.name).join(', '); // Сортируем по именам улучшений
        default: return '';
    }
}

// Функция для рендеринга таблицы
const headerOrder = [
    'item_id',
    'icon',
    'item_type',
    'item_category',
    'item_min_lvl',
    'item_visible',
    'item_theme',
    'item_cost_gold',
    'item_buy_amount',
    'item_name_ru',
    'item_name_en',
    'upgrades'
];

function renderTable(data) {
    const tableBody = document.getElementById('data-table').getElementsByTagName('tbody')[0];
    tableBody.innerHTML = ''; // Очищаем таблицу перед рендерингом

    // Создаем строки таблицы
    data.forEach(item => {
        const row = tableBody.insertRow();
        headerOrder.forEach(key => {
            const cell = row.insertCell();
            // Проверяем, является ли значение изображением
            if (key === 'icon') {
                cell.innerHTML = `<img src="${item[key]}" alt="Icon" width="50" style="cursor: pointer;" onclick="openImage('${item[key]}')">`;
            } else if (key === 'upgrades' && Array.isArray(item[key])) {
                // Если это массив (например, upgrades), отображаем его как строку
                cell.innerText = item[key].map(upgrade => upgrade.name).join(', '); // Отображаем только имена
            } else if (typeof item[key] === 'object' && item[key] !== null) {
                // Если это объект, проверяем наличие поля name
                cell.innerText = item[key].name ? item[key].name : JSON.stringify(item[key]); // Отображаем только имя, если оно есть
            } else {
                cell.innerText = item[key]; // Устанавливаем текст ячейки
            }
        });
    });
}
// Загружаем данные при загрузке страницы
window.onload = loadData;


function openImage(src) {
    const modal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image');
    modalImage.src = src; // Устанавливаем источник изображения
    modal.style.display = 'flex'; // Показываем модальное окно
}

// Функция для закрытия модального окна
function closeModal() {
    const modal = document.getElementById('image-modal');
    modal.style.display = 'none'; // Скрываем модальное окно
}

// Добавляем обработчик события для закрытия модального окна
document.getElementById('close-modal').onclick = closeModal;

// Закрытие модального окна при клике вне изображения
document.getElementById('image-modal').onclick = function(event) {
    if (event.target === this) {
        closeModal();
    }
};