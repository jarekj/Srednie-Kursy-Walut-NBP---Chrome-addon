document.addEventListener("DOMContentLoaded", () => {
  const datePicker = document.getElementById("date-picker");
  const btnFirstYear = document.getElementById("btn-first-year");
  const btnPrev = document.getElementById("btn-prev");
  const btnToday = document.getElementById("btn-today");
  const btnNext = document.getElementById("btn-next");

  const infoNumber = document.getElementById("info-number");
  const infoDate = document.getElementById("info-date");

  const ratesBody = document.getElementById("rates-body");
  const toastContainer = document.getElementById("toast-container");

  const tabAll = document.getElementById("tab-all");
  const tabFav = document.getElementById("tab-fav");

  // Elementy modalu wykresu
  const chartModal = document.getElementById("chart-modal");
  const chartTitle = document.getElementById("chart-title");
  const modalClose = document.getElementById("modal-close");
  const btnModalBack = document.getElementById("btn-modal-back");
  const chartCanvas = document.getElementById("chart-canvas");
  const periodButtons = document.querySelectorAll(".period-btn");

  let currentRates = [];
  let favoriteCurrencies = [];
  let activeTab = "all";

  // Stan aktywnego wykresu
  let activeChartCurrency = null;
  let activeChartName = "";
  let activeChartPeriod = "30";

  const formatDateString = (dateObj) => {
    return dateObj.toISOString().split("T")[0];
  };

  const formatRate = (rate) => {
    if (rate === undefined || rate === null) return "";
    return rate.toString().replace(".", ",");
  };

  const todayStr = formatDateString(new Date());
  datePicker.value = todayStr;

  chrome.storage.local.get(["favorites"], (result) => {
    if (result.favorites) {
      favoriteCurrencies = result.favorites;
    }
    fetchRates(todayStr);
  });

  const fetchRates = async (dateStr) => {
    ratesBody.innerHTML =
      '<tr><td colspan="5" style="text-align: center; color: #6c757d; padding: 10px;">Pobieranie...</td></tr>';
    infoNumber.textContent = "--";
    infoDate.textContent = "--";

    try {
      const response = await fetch(
        `https://api.nbp.pl/api/exchangerates/tables/A/${dateStr}/?format=json`,
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Brak tabeli NBP dla tej daty.");
        }
        throw new Error("Błąd połączenia z API.");
      }

      const data = await response.json();
      infoNumber.textContent = data[0].no;
      infoDate.textContent = data[0].effectiveDate;
      currentRates = data[0].rates;

      renderRates();
    } catch (error) {
      ratesBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #dc3545; font-weight: 500; padding: 10px;">${error.message}</td></tr>`;
    }
  };

  const renderRates = () => {
    ratesBody.innerHTML = "";

    const filteredRates =
      activeTab === "all"
        ? currentRates
        : currentRates.filter((rate) => favoriteCurrencies.includes(rate.code));

    if (filteredRates.length === 0) {
      const emptyMsg =
        activeTab === "all"
          ? "Brak danych"
          : "Brak ulubionych. Oznacz walutę gwiazdką!";
      ratesBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #6c757d; padding: 15px;">${emptyMsg}</td></tr>`;
      return;
    }

    filteredRates.forEach((rate) => {
      const tr = document.createElement("tr");
      const isFav = favoriteCurrencies.includes(rate.code);

      // Gwiazdka
      const tdStar = document.createElement("td");
      tdStar.className = "star-cell";
      const starSpan = document.createElement("span");
      starSpan.className = `star ${isFav ? "active" : ""}`;
      starSpan.innerHTML = isFav ? "★" : "☆";
      starSpan.dataset.code = rate.code;
      tdStar.appendChild(starSpan);

      // Nazwa
      const tdName = document.createElement("td");
      tdName.textContent = rate.currency;
      tdName.className = "copyable";
      tdName.title = "Kliknij, aby skopiować";

      // Kod
      const tdCode = document.createElement("td");
      tdCode.textContent = rate.code;
      tdCode.className = "copyable";
      tdCode.style.textAlign = "center";
      tdCode.title = "Kliknij, aby skopiować";

      // Kurs
      const tdRate = document.createElement("td");
      tdRate.textContent = formatRate(rate.mid);
      tdRate.className = "copyable";
      tdRate.style.textAlign = "right";
      tdRate.title = "Kliknij, aby skopiować";

      // Trend (Przycisk Wykresu)
      const tdChart = document.createElement("td");
      tdChart.className = "chart-cell";
      const chartIcon = document.createElement("span");
      chartIcon.className = "chart-trigger";
      chartIcon.innerHTML = "📈";
      chartIcon.title = "Pokaż wykres trendu";
      chartIcon.dataset.code = rate.code;
      chartIcon.dataset.name = rate.currency;
      tdChart.appendChild(chartIcon);

      tr.appendChild(tdStar);
      tr.appendChild(tdName);
      tr.appendChild(tdCode);
      tr.appendChild(tdRate);
      tr.appendChild(tdChart);
      ratesBody.appendChild(tr);
    });
  };

  const toggleFavorite = (code) => {
    const index = favoriteCurrencies.indexOf(code);
    if (index > -1) {
      favoriteCurrencies.splice(index, 1);
    } else {
      favoriteCurrencies.push(code);
    }

    chrome.storage.local.set({ favorites: favoriteCurrencies }, () => {
      renderRates();
    });
  };

  const copyValue = (value) => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        showToast(`Skopiowano: ${value}`);
      })
      .catch((err) => {
        console.error("Błąd zapisu w schowku: ", err);
      });
  };

  const showToast = (message) => {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  };

  // 📈 Pobieranie i Rysowanie Wykresu Historycznego
  const openChartModal = (code, name) => {
    activeChartCurrency = code;
    activeChartName = name;
    chartTitle.textContent = `Wykres trendu: ${name} (${code})`;
    chartModal.style.display = "block";
    loadChartData();
  };

  const loadChartData = async () => {
    const ctx = chartCanvas.getContext("2d");
    ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);

    // Loader tekstowy na canvasie
    ctx.fillStyle = "#6c757d";
    ctx.font = "12px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText(
      "Pobieranie danych historycznych...",
      chartCanvas.width / 2,
      chartCanvas.height / 2,
    );

    try {
      const response = await fetch(
        `https://api.nbp.pl/api/exchangerates/rates/A/${activeChartCurrency}/last/${activeChartPeriod}/?format=json`,
      );
      if (!response.ok) {
        throw new Error("Błąd pobierania danych historycznych.");
      }
      const data = await response.json();
      drawChart(data);
    } catch (error) {
      ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
      ctx.fillStyle = "#dc3545";
      ctx.fillText(
        error.message,
        chartCanvas.width / 2,
        chartCanvas.height / 2,
      );
    }
  };

  const drawChart = (data) => {
    const ctx = chartCanvas.getContext("2d");
    const width = chartCanvas.width;
    const height = chartCanvas.height;

    ctx.clearRect(0, 0, width, height);

    const rates = data.rates.map((r) => r.mid);
    const dates = data.rates.map((r) => r.effectiveDate);

    const min = Math.min(...rates);
    const max = Math.max(...rates);

    // Dodanie bezpiecznego marginesu wokół skrajnych wartości
    const margin = (max - min) * 0.15 || 0.01;
    const yMin = min - margin;
    const yMax = max + margin;

    const padding = { top: 20, right: 15, bottom: 25, left: 45 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Rysowanie siatki poziomej (4 linie poziomów cenowych)
    ctx.strokeStyle = "#e9ecef";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#6c757d";
    ctx.font = "9px Segoe UI";
    ctx.textAlign = "right";

    const gridLinesCount = 4;
    for (let i = 0; i <= gridLinesCount; i++) {
      const yVal = yMin + (yMax - yMin) * (i / gridLinesCount);
      const y = height - padding.bottom - (i / gridLinesCount) * chartHeight;

      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      ctx.fillText(yVal.toFixed(4).replace(".", ","), padding.left - 6, y + 3);
    }

    // Obliczanie punktów (x, y) na wykresie
    const points = rates.map((rate, index) => {
      const x = padding.left + (index / (rates.length - 1)) * chartWidth;
      const y =
        height - padding.bottom - ((rate - yMin) / (yMax - yMin)) * chartHeight;
      return { x, y };
    });

    // Rysowanie cieniowania pod linią trendu
    ctx.fillStyle = "rgba(13, 110, 253, 0.08)";
    ctx.beginPath();
    ctx.moveTo(points[0].x, height - padding.bottom);
    points.forEach((pt) => ctx.lineTo(pt.x, pt.y));
    ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
    ctx.closePath();
    ctx.fill();

    // Rysowanie samej linii trendu
    ctx.strokeStyle = "#0d6efd";
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    // Rysowanie kropek na kluczowych wierzchołkach
    ctx.fillStyle = "#0d6efd";
    points.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Daty początkowa i końcowa na osi X
    ctx.fillStyle = "#6c757d";
    ctx.font = "9px Segoe UI";
    ctx.textAlign = "left";
    ctx.fillText(dates[0], padding.left, height - 8);

    ctx.textAlign = "right";
    ctx.fillText(dates[dates.length - 1], width - padding.right, height - 8);
  };

  const closeChart = () => {
    chartModal.style.display = "none";
  };

  // Delegacja kliknięć (kopiowanie, ulubione, wykres)
  document.body.addEventListener("click", (e) => {
    if (e.target.classList.contains("star")) {
      const code = e.target.dataset.code;
      toggleFavorite(code);
    } else if (e.target.classList.contains("chart-trigger")) {
      const code = e.target.dataset.code;
      const name = e.target.dataset.name;
      openChartModal(code, name);
    } else if (
      e.target.classList.contains("copyable") &&
      e.target.textContent !== "--"
    ) {
      copyValue(e.target.textContent);
    }
  });

  // Obsługa zmiany przedziału czasowego wykresu
  periodButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      periodButtons.forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");
      activeChartPeriod = e.target.dataset.period;
      loadChartData();
    });
  });

  // Zamykanie wykresu
  modalClose.addEventListener("click", closeChart);
  btnModalBack.addEventListener("click", closeChart);

  // Obsługa zakładek głównych
  tabAll.addEventListener("click", () => {
    tabAll.classList.add("active");
    tabFav.classList.remove("active");
    activeTab = "all";
    renderRates();
  });

  tabFav.addEventListener("click", () => {
    tabFav.classList.add("active");
    tabAll.classList.remove("active");
    activeTab = "fav";
    renderRates();
  });

  // Nawigacja datami
  datePicker.addEventListener("change", () => {
    fetchRates(datePicker.value);
  });

  btnToday.addEventListener("click", () => {
    datePicker.value = todayStr;
    fetchRates(todayStr);
  });

  btnPrev.addEventListener("click", () => {
    const current = new Date(datePicker.value);
    current.setDate(current.getDate() - 1);
    const prevStr = formatDateString(current);
    datePicker.value = prevStr;
    fetchRates(prevStr);
  });

  btnNext.addEventListener("click", () => {
    const current = new Date(datePicker.value);
    current.setDate(current.getDate() + 1);
    const nextStr = formatDateString(current);
    datePicker.value = nextStr;
    fetchRates(nextStr);
  });

  btnFirstYear.addEventListener("click", async () => {
    const current = new Date(datePicker.value);
    const year = current.getFullYear();
    ratesBody.innerHTML =
      '<tr><td colspan="5" style="text-align: center; color: #6c757d; padding: 10px;">Szukanie tabeli...</td></tr>';

    try {
      const response = await fetch(
        `https://api.nbp.pl/api/exchangerates/tables/A/${year}-01-01/${year}-01-15/?format=json`,
      );
      if (!response.ok) {
        throw new Error("Nie znaleziono tabel dla początku roku.");
      }
      const data = await response.json();
      datePicker.value = data[0].effectiveDate;
      infoNumber.textContent = data[0].no;
      infoDate.textContent = data[0].effectiveDate;
      currentRates = data[0].rates;
      renderRates();
    } catch (error) {
      ratesBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #dc3545; padding: 10px;">${error.message}</td></tr>`;
    }
  });
});
