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
    switch (index) {
        case 0: return parseInt(item.item_id); // Преобразуем в число
        case 1: return item.icon; // Для иконок сортировка не имеет смысла
        case 2: return item.item_name_en;
        case 3: return item.item_name_ru;
        case 4: return item.item_type.name;
        case 5: return item.item_category.name;
        case 6: return parseFloat(item.item_cost_gold); // Преобразуем в число для корректной сортировки
        case 7: return parseInt(item.item_min_lvl); // Преобразуем в число для корректной сортировки
        default: return '';
    }
}

// Функция для рендеринга таблицы
function renderTable(data) {
    const tableBody = document.getElementById('data-table').getElementsByTagName('tbody')[0];
    tableBody.innerHTML = ''; // Очищаем таблицу перед рендерингом

    data.forEach(item => {
        const row = tableBody.insertRow();
        row.insertCell(0).innerText = item.item_id;
        row.insertCell(1).innerHTML = `<img src="${item.icon}" alt="Icon" width="50">`;
        row.insertCell(2).innerText = item.item_name_en;
        row.insertCell(3).innerText = item.item_name_ru;
        row.insertCell(4).innerText = item.item_type.name;
        row.insertCell(5).innerText = item.item_category.name;
        row.insertCell(6).innerText = item.item_cost_gold;
        row.insertCell(7).innerText = item.item_min_lvl;
    });
}
// Функция для рендеринга таблицы
function renderTable(data) {
    const tableBody = document.getElementById('data-table').getElementsByTagName('tbody')[0];
    tableBody.innerHTML = ''; // Очищаем таблицу перед рендерингом

    data.forEach(item => {
        const row = tableBody.insertRow();
        row.insertCell(0).innerText = item.item_id;

        // Создаем элемент изображения
        const imgCell = row.insertCell(1);
        const imgElement = document.createElement('img');
        imgElement.src = item.icon;
        imgElement.alt = "Icon";
        imgElement.width = 50;

        // Добавляем обработчики событий для увеличения изображения
        imgElement.addEventListener('mouseover', () => {
            const previewImg = document.getElementById('preview-img');
            const imagePreview = document.getElementById('image-preview');
            previewImg.src = item.icon; // Устанавливаем источник увеличенного изображения
            imagePreview.style.display = 'block'; // Показываем увеличенное изображение
        });

        imgElement.addEventListener('mousemove', (e) => {
            const imagePreview = document.getElementById('image-preview');
            imagePreview.style.top = `${e.clientY + 10}px`; // Позиционируем увеличенное изображение
            imagePreview.style.left = `${e.clientX + 10}px`;
        });

        imgElement.addEventListener('mouseout', () => {
            const imagePreview = document.getElementById('image-preview');
            imagePreview.style.display = 'none'; // Скрываем увеличенное изображение
        });

        imgCell.appendChild(imgElement);
        row.insertCell(2).innerText = item.item_name_en;
        row.insertCell(3).innerText = item.item_name_ru;
        row.insertCell(4).innerText = item.item_type.name;
        row.insertCell(5).innerText = item.item_category.name;
        row.insertCell(6).innerText = item.item_cost_gold;
        row.insertCell(7).innerText = item.item_min_lvl;
    });
}
// Загружаем данные при загрузке страницы
window.onload = loadData;