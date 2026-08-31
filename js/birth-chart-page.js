(function () {
  const form = document.getElementById('chart-form');
  if (!form) return;

  const locationSelect = document.getElementById('birth-location');
  const manualFields = document.getElementById('manual-location-fields');
  const resultsSection = document.getElementById('chart-results');
  const errorBox = document.getElementById('chart-error');

  // Populate location dropdown
  const locations = window.BIRTH_CHART_LOCATIONS || [];
  for (const loc of locations) {
    const opt = document.createElement('option');
    opt.value = loc.name;
    opt.textContent = loc.name;
    locationSelect.appendChild(opt);
  }
  const otherOpt = document.createElement('option');
  otherOpt.value = '__other__';
  otherOpt.textContent = 'Other (enter coordinates manually)';
  locationSelect.appendChild(otherOpt);

  const tzInput = document.getElementById('chart-tz');
  locationSelect.addEventListener('change', () => {
    manualFields.hidden = locationSelect.value !== '__other__';
    const loc = locations.find(l => l.name === locationSelect.value);
    if (loc) tzInput.value = loc.tz;
  });

  // South Indian fixed grid: rashiIndex -> [row, col] (0-indexed, 4x4 grid)
  const GRID_POS = [
    [0, 1], // 0 Aries
    [0, 2], // 1 Taurus
    [0, 3], // 2 Gemini
    [1, 3], // 3 Cancer
    [2, 3], // 4 Leo
    [3, 3], // 5 Virgo
    [3, 2], // 6 Libra
    [3, 1], // 7 Scorpio
    [3, 0], // 8 Sagittarius
    [2, 0], // 9 Capricorn
    [1, 0], // 10 Aquarius
    [0, 0]  // 11 Pisces
  ];
  const ABBR = { Sun: 'Su', Moon: 'Mo', Mars: 'Ma', Mercury: 'Me', Jupiter: 'Ju', Venus: 'Ve', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke' };

  function renderChartGrid(chart) {
    const cellsByPos = {};
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) cellsByPos[r + ',' + c] = { rashiIndex: null, planets: [] };

    const engine = window.BirthChartEngine;
    for (let i = 0; i < 12; i++) {
      const [r, c] = GRID_POS[i];
      cellsByPos[r + ',' + c].rashiIndex = i;
    }
    for (const [name, data] of Object.entries(chart.planets)) {
      const [r, c] = GRID_POS[data.rashiIndex];
      cellsByPos[r + ',' + c].planets.push(ABBR[name] || name);
    }

    let html = '';
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (r >= 1 && r <= 2 && c >= 1 && c <= 2) {
          if (r === 1 && c === 1) {
            html += '<div class="chart-cell chart-center"><p>Rashi<br>Chart</p></div>';
          }
          continue;
        }
        const cell = cellsByPos[r + ',' + c];
        const isAsc = cell.rashiIndex === chart.ascendant.rashiIndex;
        html += '<div class="chart-cell' + (isAsc ? ' is-ascendant' : '') + '">'
          + '<span class="rashi-label">' + engine.RASHIS[cell.rashiIndex] + (isAsc ? ' · Asc' : '') + '</span>'
          + '<span class="planets">' + cell.planets.join(', ') + '</span>'
          + '</div>';
      }
    }
    return html;
  }

  function renderPlanetTable(chart) {
    const order = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
    let rows = '<tr><td>Ascendant (Lagna)</td><td class="num">' + chart.ascendant.rashi + '</td><td class="num">' + chart.ascendant.degreeInSign.toFixed(1) + '&deg;</td><td class="num">1</td></tr>';
    for (const name of order) {
      const d = chart.planets[name];
      rows += '<tr><td>' + name + '</td><td class="num">' + d.rashi + '</td><td class="num">' + d.degreeInSign.toFixed(1) + '&deg;</td><td class="num">' + d.house + '</td></tr>';
    }
    return '<table class="planet-table"><thead><tr><th>Planet</th><th>Sign</th><th>Degree</th><th>House</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    resultsSection.hidden = true;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const dobStr = document.getElementById('chart-dob').value;
    const tobStr = document.getElementById('chart-tob').value;
    const tz = parseFloat(document.getElementById('chart-tz').value);

    let lat, lon, placeLabel;
    if (locationSelect.value === '__other__') {
      lat = parseFloat(document.getElementById('manual-lat').value);
      lon = parseFloat(document.getElementById('manual-lon').value);
      placeLabel = 'your entered coordinates';
      if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        errorBox.textContent = 'Please enter a valid latitude (-90 to 90) and longitude (-180 to 180).';
        errorBox.hidden = false;
        return;
      }
    } else {
      const loc = locations.find(l => l.name === locationSelect.value);
      if (!loc) {
        errorBox.textContent = 'Please select a birth location.';
        errorBox.hidden = false;
        return;
      }
      lat = loc.lat;
      lon = loc.lon;
      placeLabel = loc.name;
    }

    if (isNaN(tz) || tz < -12 || tz > 14) {
      errorBox.textContent = 'Please enter a valid time zone offset (between -12 and +14).';
      errorBox.hidden = false;
      return;
    }

    const [year, month, day] = dobStr.split('-').map(Number);
    const [hour, minute] = tobStr.split(':').map(Number);

    // Convert local birth time to UTC using the given offset
    const utcMs = Date.UTC(year, month - 1, day, hour, minute) - tz * 3600000;
    const birthDateUtc = new Date(utcMs);

    if (isNaN(birthDateUtc.getTime())) {
      errorBox.textContent = 'Something went wrong reading that date and time. Please check the fields and try again.';
      errorBox.hidden = false;
      return;
    }

    const chart = window.BirthChartEngine.computeChart(birthDateUtc, lat, lon);
    const nak = chart.moonNakshatra;

    document.getElementById('result-summary').innerHTML =
      '<strong>Ascendant (Lagna):</strong> ' + chart.ascendant.rashi + ' &middot; '
      + '<strong>Moon Sign:</strong> ' + chart.planets.Moon.rashi + ' &middot; '
      + '<strong>Nakshatra:</strong> ' + nak.nakshatra + ' (Pada ' + nak.pada + ')';
    document.getElementById('result-place-note').textContent = 'Calculated for ' + placeLabel + ', using the Lahiri ayanamsa and Whole Sign houses.';
    document.getElementById('chart-grid').innerHTML = renderChartGrid(chart);
    document.getElementById('planet-table-container').innerHTML = renderPlanetTable(chart);

    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();
