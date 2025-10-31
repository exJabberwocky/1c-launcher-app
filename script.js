document.addEventListener('DOMContentLoaded', async () => {
  let databases = [];
  let expandedCategories = new Set();
  let selectedBases = new Set();
  let currentConfig = '';

  // Элементы DOM
  const dbListContainer = document.getElementById('database-list');
  const searchInput = document.getElementById('search-input');
  const configBtn = document.getElementById('config-btn');
  const configNameEl = configBtn.querySelector('.config-name');
  const launchBtn = document.getElementById('launch-btn');
  const selectionInfo = document.getElementById('selection-info');
  const addBaseBtn = document.getElementById('add-base-btn');
  const addBaseModal = document.getElementById('add-base-modal');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  const addBaseForm = document.getElementById('add-base-form');
  const progressModal = document.getElementById('progress-modal');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const cancelBtn = document.getElementById('cancel-btn');

  console.log('1C Launcher: Script loaded');

  //  Очистка expandedCategories при пустом поиске
  searchInput.addEventListener('input', () => {
    renderApp();
  });

  //  Обработчик кнопки конфига
  configBtn.addEventListener('click', async () => {
    console.log('Config button clicked');
    try {
      const newConfig = await window.api.selectConfig();
      console.log('Selected config:', newConfig);
      if (newConfig) {
        currentConfig = newConfig;
        const filename = newConfig.split(/[\\/]/).pop() || 'Конфиг';
        configNameEl.textContent = filename;
        await window.api.saveConfigPath(newConfig);
        await loadAndRender();
      }
    } catch (err) {
      console.error('Config selection error:', err);
      alert(`Ошибка выбора конфига: ${err.message}`);
    }
  });

  //  Инициализация приложения
  async function init() {
    try {
      const configInfo = await window.api.getConfigInfo();
      console.log('Config info:', configInfo);

      currentConfig = configInfo.configPath;
      const filename = currentConfig.split(/[\\/]/).pop() || 'Конфиг';
      configNameEl.textContent = filename;
      const theme = configInfo.theme;
      document.documentElement.setAttribute('data-theme', theme);
      updateIcon(theme);
      // CHECK UPDATE
      const updateInfo = await window.api.checkForUpdates();
      if (updateInfo.available && !updateInfo.dismissed) {
        showUpdateModal(updateInfo);
      }

      if (configInfo.configExists) {
        await loadAndRender();
      } else {
        selectConfig();
      }
    } catch (err) {
      console.error('Init error:', err);
      configNameEl.textContent = 'Ошибка';
      selectConfig();
    }
  }

  //  Выбор конфига
  async function selectConfig() {
    try {
      const newConfig = await window.api.selectConfig();
      if (newConfig) {
        currentConfig = newConfig;
        await window.api.saveConfigPath(currentConfig);
        const filename = newConfig.split(/[\\/]/).pop() || 'Конфиг';
        configNameEl.textContent = filename;
        await loadAndRender();
      } else {
        // Отмена выбора
        dbListContainer.innerHTML = `
        <div style="text-align: center; padding: 80px; color: var(--text-secondary);">
        <h2>Выберите конфигурацию</h2>
        <p>Нажмите кнопку 📁 в верхней панели</p>
        </div>
        `;
      }
    } catch (err) {
      console.error('Select config error:', err);
      alert(`Ошибка выбора: ${err.message}`);
    }
  }

  //  Загрузка баз
  async function loadAndRender() {
    try {
      console.log('Loading config:', currentConfig);
      const result = await window.api.loadConfig(currentConfig);
      databases = result.databases;

      console.log(`Загружено баз: ${databases.length}`);

      if (databases.length === 0) {
        showEmptyState();
        return;
      }

      renderApp();
    } catch (err) {
      console.error('Load error:', err);
      dbListContainer.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #ff6b6b;">
      <h3>Ошибка загрузки</h3>
      <p>${err.message}</p>
      <button class="btn btn-primary" onclick="selectConfig()">Выбрать другой конфиг</button>
      </div>
      `;
    }
  }

  //  Пустое состояние
  function showEmptyState() {
    dbListContainer.innerHTML = `
    <div style="text-align: center; padding: 60px; color: var(--text-secondary);">
    <h3>Базы не найдены</h3>
    <p>Добавьте первую базу кнопкой "Добавить"</p>
    <button id="add-first-base" class="btn btn-primary" style="margin-top: 20px;">
    <img src="icons/Plus.svg" class="btn-icon" alt="Добавить">
    Добавьте первую базу
    </button>
    </div>
    `;
    document.getElementById('add-first-base')?.addEventListener('click', () => {
      addBaseBtn.click();
    });
  }

  //  Рендер приложения
  function renderApp() {
    const searchTerm = searchInput.value.toLowerCase();
    const filteredDBs = databases.filter(db =>
    db.name.toLowerCase().includes(searchTerm) ||
    db.address.toLowerCase().includes(searchTerm) ||
    db.login.toLowerCase().includes(searchTerm)
    );

    const groupedDBs = filteredDBs.reduce((acc, db) => {
      if (!acc[db.category]) acc[db.category] = [];
      acc[db.category].push(db);
      return acc;
    }, {});

    dbListContainer.innerHTML = '';

    if (Object.keys(groupedDBs).length === 0) {
      showEmptyState();
      return;
    }

    //  Сворачивание при пустом поиске
    if (searchTerm === '') {
      expandedCategories.clear();
    } else {
      // Раскрытие категорий с результатами поиска
      expandedCategories = new Set(Object.keys(groupedDBs));
    }

    Object.entries(groupedDBs).forEach(([category, items]) => {
      const isExpanded = expandedCategories.has(category);

      const groupEl = document.createElement('div');
      groupEl.className = `category-group ${isExpanded ? 'expanded' : ''}`;
      groupEl.dataset.category = category;

      const itemsHtml = items.map(db => `
      <div class="db-item" data-id="${db.id}">
      <div class="col-select">
      <input type="checkbox" data-id="${db.id}" ${selectedBases.has(db.id) ? 'checked' : ''}>
      </div>
      <div class="col-name">${db.name}</div>
      <div class="col-address">${db.address}</div>
      <div class="col-login">${db.login}</div>
      </div>
      `).join('');

      groupEl.innerHTML = `
      <div class="category-header">
      <input type="checkbox" class="category-checkbox" data-category="${category}">
      <img src="icons/ChevronRight.svg" class="chevron" alt="Chevron">
      <h3>${category}</h3>
      <span class="item-count">${items.length}</span>
      </div>
      <div class="db-items-wrapper">${itemsHtml}</div>
      `;

      dbListContainer.appendChild(groupEl);
      if (Object.keys(groupedDBs).length === 1) {
        groupEl.classList.add('expanded');
        expandedCategories.add(category);
        const wrapper = groupEl.querySelector('.db-items-wrapper');
        wrapper.style.maxHeight = wrapper.scrollHeight + 'px';
      }
    });

    updateFooterAndCategoryCheckboxes();
  }

  function updateFooterAndCategoryCheckboxes() {
    selectionInfo.textContent = `Выбрано: ${selectedBases.size}`;
    launchBtn.disabled = selectedBases.size === 0;

    document.querySelectorAll('.category-group').forEach(group => {
      const category = group.dataset.category;
      const checkbox = group.querySelector('.category-checkbox');
      const itemCheckboxes = group.querySelectorAll('.db-item input[type="checkbox"]');

      const allInCategory = Array.from(itemCheckboxes).map(cb => parseInt(cb.dataset.id));
      const selectedInCategory = allInCategory.filter(id => selectedBases.has(id));

      if (selectedInCategory.length === 0) {
        checkbox.checked = false;
        checkbox.indeterminate = false;
      } else if (selectedInCategory.length === allInCategory.length) {
        checkbox.checked = true;
        checkbox.indeterminate = false;
      } else {
        checkbox.checked = false;
        checkbox.indeterminate = true;
      }
    });
  }

  // Обработчики кликов
  dbListContainer.addEventListener('click', e => {
    const target = e.target;

    // if (target.closest('.category-header') && !target.matches('input[type="checkbox"]')) {
    //   const group = target.closest('.category-group');
    //   const category = group.dataset.category;
    //
    //   group.classList.toggle('expanded');
    //   if (expandedCategories.has(category)) {
    //     expandedCategories.delete(category);
    //   } else {
    //     expandedCategories.add(category);
    //     group.scrollIntoView({ behavior: 'smooth', block: 'start' });
    //   }
    //   return;
    // }

    if (target.closest('.category-header') && !target.matches('input[type="checkbox"]')) {
      const group = target.closest('.category-group');
      const category = group.dataset.category;
      const wrapper = group.querySelector('.db-items-wrapper');

      if (group.classList.contains('expanded')) {
        //  Сворачиваем
        group.classList.remove('expanded');
        expandedCategories.delete(category);
        wrapper.style.maxHeight = '0px';
      } else {
        //  РАСКРЫВАЕМ С АВТО-ВЫСОТОЙ
        group.classList.add('expanded');
        expandedCategories.add(category);

        // 🎯 МГНОВЕННО вычисляем реальную высоту
        wrapper.style.maxHeight = wrapper.scrollHeight + 'px';

        //  После анимации: убираем лимит (идеальная точность)
        setTimeout(() => {
          wrapper.style.maxHeight = 'none';
        }, 400);  // = transition duration
      }

      group.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (target.matches('.category-checkbox')) {
      const category = target.dataset.category;
      const itemsInCategory = databases.filter(db => db.category === category).map(db => db.id);

      if (target.checked) {
        itemsInCategory.forEach(id => selectedBases.add(id));
      } else {
        itemsInCategory.forEach(id => selectedBases.delete(id));
      }
      renderApp();
      return;
    }

    if (target.matches('input[type="checkbox"]')) {
      const dbId = parseInt(target.dataset.id);
      if (target.checked) selectedBases.add(dbId);
      else selectedBases.delete(dbId);
      updateFooterAndCategoryCheckboxes();
      return;
    }

    if (target.closest('.db-item')) {
      const dbItem = target.closest('.db-item');
      const dbId = parseInt(dbItem.dataset.id);
      const checkbox = dbItem.querySelector('input[type="checkbox"]');

      checkbox.checked = !checkbox.checked;
      if (checkbox.checked) selectedBases.add(dbId);
      else selectedBases.delete(dbId);
      updateFooterAndCategoryCheckboxes();
    }
  });

  dbListContainer.addEventListener('dblclick', async e => {
    const target = e.target;

    if (target.closest('.col-address')) {
      const dbItem = target.closest('.db-item');
      const dbId = parseInt(dbItem.dataset.id);
      const db = databases.find(d => d.id === dbId);
      if (db) {
        try {
          await window.api.openUrl(db.address);
        } catch (err) {
          alert(`Ошибка: ${err.message}`);
        }
      }
    }
  });

  launchBtn.addEventListener('click', async () => {
    const selectedIds = Array.from(selectedBases);
    if (selectedIds.length === 0) return;

    try {
      progressModal.style.display = 'flex';
      progressText.textContent = `Запуск ${selectedIds.length} баз...`;
      progressFill.style.width = '0%';

      const platforms = await window.api.getPlatforms();
      const platform = platforms[0];

      await window.api.launchBases({
        configFile: currentConfig,
        selectedIds,
        platform
      });

      let progress = 0;
      const interval = setInterval(() => {
        progress += 20;
        progressFill.style.width = `${progress}%`;
        if (progress >= 100) {
          clearInterval(interval);
          progressModal.style.display = 'none';
          selectedBases.clear();
          renderApp();
          alert(` Запущено ${selectedIds.length} баз`);
        }
      }, 300);
    } catch (err) {
      progressModal.style.display = 'none';
      alert(`❌ Ошибка запуска:\n${err.message}`);
    }
  });

  addBaseBtn.addEventListener('click', () => addBaseModal.style.display = 'flex');
  modalCancelBtn.addEventListener('click', () => addBaseModal.style.display = 'none');
  addBaseModal.addEventListener('click', e => {
    if (e.target === addBaseModal) addBaseModal.style.display = 'none';
  });

    addBaseForm.addEventListener('submit', async e => {
      e.preventDefault();

      const newDb = {
        category: document.getElementById('new-category').value.trim(),
                                 name: document.getElementById('new-name').value.trim(),
                                 address: document.getElementById('new-address').value.trim(),
                                 login: document.getElementById('new-login').value.trim(),
                                 password: document.getElementById('new-password').value.trim(),
      };

      try {
        await window.api.addBase({ configFile: currentConfig, newDb });
        addBaseModal.style.display = 'none';
        addBaseForm.reset();
        await loadAndRender();
        alert(' База добавлена');
      } catch (err) {
        alert(`❌ Ошибка добавления:\n${err.message}`);
      }
    });

    cancelBtn.addEventListener('click', () => {
      selectedBases.clear();
      renderApp();
    });

    //  ФУНКЦИЯ иконки
    function updateIcon(theme) {
      document.getElementById('theme-icon').src =
      theme === 'dark' ? 'icons/moon-star.svg' : 'icons/sun-alt.svg';
    }

    //  ПЕРЕКЛЮЧАТЕЛЬ
    document.getElementById('theme-toggle').addEventListener('click', async () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

      await window.api.saveTheme(newTheme);
      document.documentElement.setAttribute('data-theme', newTheme);
      updateIcon(newTheme);
    });

    //  Глобальная функция для кнопки "Выбрать другой"
    window.selectNewConfig = async () => {
      await selectConfig();
    };

    //  Запуск инициализации
    await init();
});
//  МОДАЛКА ОБНОВЛЕНИЯ
function showUpdateModal(info) {
  const modal = document.createElement('div');
  modal.id = 'update-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
  <div class="modal-content" style="width: 450px;">
  <h2> Доступно обновление!</h2>
  <p><strong>v${info.version}</strong> (${info.notes.split('\n')[0]})</p>
  <div class="form-actions" style="justify-content: space-between;">
  <button class="btn btn-cancel" onclick="this.closest('#update-modal').remove();">Позже</button>
  <a href="${info.url}" target="_blank" class="btn btn-primary">Обновить сейчас</a>
  </div>
  </div>
  `;
  document.body.appendChild(modal);

  // Позже → сохранить
  modal.querySelector('.btn-cancel').onclick = async () => {
    await window.api.dismissUpdate(info.version);
    modal.remove();
  };
}
