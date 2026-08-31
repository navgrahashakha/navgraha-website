(function () {
  const form = document.getElementById('chart-form');
  if (!form) return;

  const locationSelect = document.getElementById('birth-location');
  const manualFields = document.getElementById('manual-location-fields');
  const resultsSection = document.getElementById('chart-results');
  const errorBox = document.getElementById('chart-error');
  const styleRadios = document.querySelectorAll('input[name="chart-style"]');

  let lastChart = null;

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

  const ABBR = { Sun: 'Su', Moon: 'Mo', Mars: 'Ma', Mercury: 'Me', Jupiter: 'Ju', Venus: 'Ve', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke' };

  // ---------- South Indian chart (fixed rashi positions) ----------
  const SOUTH_GRID_POS = [
    [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3],
    [3, 2], [3, 1], [3, 0], [2, 0], [1, 0], [0, 0]
  ];

  function renderSouthIndian(chart) {
    const engine = window.BirthChartEngine;
    const cellsByPos = {};
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) cellsByPos[r + ',' + c] = { rashiIndex: null, planets: [] };
    for (let i = 0; i < 12; i++) {
      const [r, c] = SOUTH_GRID_POS[i];
      cellsByPos[r + ',' + c].rashiIndex = i;
    }
    for (const [name, data] of Object.entries(chart.planets)) {
      const [r, c] = SOUTH_GRID_POS[data.rashiIndex];
      cellsByPos[r + ',' + c].planets.push(ABBR[name] || name);
    }

    let html = '<div class="south-indian-chart">';
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (r >= 1 && r <= 2 && c >= 1 && c <= 2) {
          if (r === 1 && c === 1) html += '<div class="chart-cell chart-center"><p>Rashi<br>Chart</p></div>';
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
    html += '</div>';
    return html;
  }

  // ---------- North Indian chart (fixed houses, signs rotate with Ascendant) ----------
  // Polygon coordinates verified against the standard published North Indian layout:
  // House 1 = top diamond, House 4 = left, House 7 = bottom, House 10 = right,
  // houses proceed counter-clockwise from House 1.
  const NORTH_HOUSE_POLY = {
    1: '100,100 200,200 300,100 200,0',
    2: '0,0 100,100 200,0',
    3: '0,0 0,200 100,100',
    4: '0,200 100,300 200,200 100,100',
    5: '0,200 0,400 100,300',
    6: '100,300 0,400 200,400',
    7: '100,300 200,400 300,300 200,200',
    8: '300,300 200,400 400,400',
    9: '300,300 400,400 400,300',
    10: '300,100 200,200 300,300 400,200',
    11: '300,100 400,200 400,0',
    12: '200,0 300,100 400,0'
  };
  // Label anchor point for each house (roughly the centroid, nudged for legibility)
  const NORTH_HOUSE_LABEL_POS = {
    1: [200, 60], 2: [100, 35], 3: [35, 100], 4: [100, 200], 5: [35, 300],
    6: [100, 365], 7: [200, 340], 8: [300, 365], 9: [365, 300], 10: [300, 200],
    11: [365, 100], 12: [300, 35]
  };

  function renderNorthIndian(chart) {
    const engine = window.BirthChartEngine;
    const ascRashiIndex = chart.ascendant.rashiIndex;

    const planetsByHouse = {};
    for (let h = 1; h <= 12; h++) planetsByHouse[h] = [];
    for (const [name, data] of Object.entries(chart.planets)) {
      planetsByHouse[data.house].push(ABBR[name] || name);
    }

    let svg = '<svg viewBox="0 0 400 400" style="width:100%;max-width:420px;display:block;margin:0 auto;">'
      + '<rect x="0" y="0" width="400" height="400" fill="var(--paper-card)" stroke="var(--paper-line)" />';

    for (let h = 1; h <= 12; h++) {
      const rashiIdx = (ascRashiIndex + h - 1) % 12;
      const isAsc = h === 1;
      svg += '<polygon points="' + NORTH_HOUSE_POLY[h] + '" fill="' + (isAsc ? 'rgba(201,154,62,0.16)' : 'none') + '" stroke="var(--paper-line)" stroke-width="1.5" />';
    }
    for (let h = 1; h <= 12; h++) {
      const rashiIdx = (ascRashiIndex + h - 1) % 12;
      const [lx, ly] = NORTH_HOUSE_LABEL_POS[h];
      const planetsText = planetsByHouse[h].join(',');
      svg += '<text x="' + lx + '" y="' + (ly - 8) + '" text-anchor="middle" font-size="10" font-family="var(--font-mono)" fill="var(--ink-faint)">' + (rashiIdx + 1) + '</text>';
      if (planetsText) {
        svg += '<text x="' + lx + '" y="' + (ly + 8) + '" text-anchor="middle" font-size="11" font-weight="700" font-family="var(--font-body)" fill="var(--teal)">' + planetsText + '</text>';
      }
    }
    svg += '</svg>';
    return svg;
  }

  function renderChart(chart, style) {
    return style === 'north' ? renderNorthIndian(chart) : renderSouthIndian(chart);
  }

  // ---------- Planet table with dignity / combustion / Vargottama ----------
  function renderPlanetTable(chart) {
    const order = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
    function notes(p) {
      const tags = [];
      if (p.dignity === 'exalted') tags.push('<span style="color:var(--teal);">Exalted</span>');
      if (p.dignity === 'debilitated') tags.push('<span style="color:var(--ink-faint);">Debilitated</span>');
      if (p.combust) tags.push('<span style="color:var(--ink-faint);">Combust</span>');
      if (p.vargottama) tags.push('<span style="color:var(--gold);">Vargottama</span>');
      return tags.length ? tags.join(', ') : '&mdash;';
    }
    let rows = '<tr><td>Ascendant (Lagna)</td><td class="num">' + chart.ascendant.rashi + '</td><td class="num">' + chart.ascendant.degreeDisplay + '</td><td class="num">1</td><td>&mdash;</td></tr>';
    for (const name of order) {
      const d = chart.planets[name];
      rows += '<tr><td>' + name + '</td><td class="num">' + d.rashi + '</td><td class="num">' + d.degreeDisplay + '</td><td class="num">' + d.house + '</td><td>' + notes(d) + '</td></tr>';
    }
    return '<table class="planet-table"><thead><tr><th>Planet</th><th>Sign</th><th>Degree</th><th>House</th><th>Notes</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  for (const radio of styleRadios) {
    radio.addEventListener('change', () => {
      if (!lastChart) return;
      document.getElementById('chart-grid').innerHTML = renderChart(lastChart, radio.value);
    });
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

    const utcMs = Date.UTC(year, month - 1, day, hour, minute) - tz * 3600000;
    const birthDateUtc = new Date(utcMs);

    if (isNaN(birthDateUtc.getTime())) {
      errorBox.textContent = 'Something went wrong reading that date and time. Please check the fields and try again.';
      errorBox.hidden = false;
      return;
    }

    const chart = window.BirthChartEngine.computeChart(birthDateUtc, lat, lon);
    lastChart = chart;
    const nak = chart.moonNakshatra;
    const selectedStyle = document.querySelector('input[name="chart-style"]:checked').value;

    document.getElementById('result-summary').innerHTML =
      '<strong>Ascendant (Lagna):</strong> ' + chart.ascendant.rashi + ' &middot; '
      + '<strong>Moon Sign:</strong> ' + chart.planets.Moon.rashi + ' &middot; '
      + '<strong>Nakshatra:</strong> ' + nak.nakshatra + ' (Pada ' + nak.pada + ')';
    document.getElementById('result-place-note').textContent = 'Calculated for ' + placeLabel + ', using the Lahiri ayanamsa and Whole Sign houses.';
    document.getElementById('chart-grid').innerHTML = renderChart(chart, selectedStyle);
    document.getElementById('planet-table-container').innerHTML = renderPlanetTable(chart);

    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();
