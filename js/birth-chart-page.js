(function () {
  const form = document.getElementById('chart-form');
  if (!form) return;

  const locationSearchInput = document.getElementById('location-search');
  const locationResultsList = document.getElementById('location-results');
  const locationSelectedP = document.getElementById('location-selected');
  const manualToggleBtn = document.getElementById('location-manual-toggle');
  const manualFields = document.getElementById('manual-location-fields');
  const manualLat = document.getElementById('manual-lat');
  const manualLon = document.getElementById('manual-lon');
  const manualPlaceName = document.getElementById('manual-place-name');
  const tzInput = document.getElementById('chart-tz');
  const tzHelper = document.getElementById('tz-helper');
  const dobInput = document.getElementById('chart-dob');
  const tobInput = document.getElementById('chart-tob');
  const resultsSection = document.getElementById('chart-results');
  const errorBox = document.getElementById('chart-error');
  const styleRadios = document.querySelectorAll('input[name="chart-style"]');

  let lastChart = null;
  let selectedLocation = null; // { lat, lon, label }
  let manualMode = false;

  // ---------- Birth-place search (OpenStreetMap Nominatim, with an offline fallback) ----------
  const localLocations = window.BIRTH_CHART_LOCATIONS || [];
  let searchDebounce = null;
  let searchSeq = 0;

  function hideResults() {
    locationResultsList.hidden = true;
    locationResultsList.innerHTML = '';
  }

  function renderResults(items, note) {
    if (!items.length) {
      locationResultsList.innerHTML = '<li class="is-empty">No matches found. Try a different spelling, or enter coordinates manually below.</li>';
      locationResultsList.hidden = false;
      return;
    }
    locationResultsList.innerHTML = items.map((item, i) =>
      '<li data-i="' + i + '">' + item.label + (note ? ' <span style="opacity:.6;">' + note + '</span>' : '') + '</li>'
    ).join('');
    locationResultsList.hidden = false;
    Array.from(locationResultsList.children).forEach((li, i) => {
      if (!items[i]) return;
      li.addEventListener('click', () => selectLocation(items[i].lat, items[i].lon, items[i].label));
    });
  }

  function searchLocalFallback(query) {
    const q = query.toLowerCase();
    return localLocations
      .filter(l => l.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map(l => ({ lat: l.lat, lon: l.lon, label: l.name }));
  }

  async function searchNominatim(query) {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=8&q=' + encodeURIComponent(query);
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) throw new Error('Nominatim request failed');
    const data = await res.json();
    return data.map(d => ({ lat: parseFloat(d.lat), lon: parseFloat(d.lon), label: d.display_name }));
  }

  locationSearchInput.addEventListener('input', () => {
    selectedLocation = null;
    locationSelectedP.hidden = true;
    const query = locationSearchInput.value.trim();
    clearTimeout(searchDebounce);
    if (query.length < 2) { hideResults(); return; }
    const seq = ++searchSeq;
    searchDebounce = setTimeout(async () => {
      try {
        const results = await searchNominatim(query);
        if (seq !== searchSeq) return;
        renderResults(results.length ? results : searchLocalFallback(query));
      } catch (e) {
        if (seq !== searchSeq) return;
        renderResults(searchLocalFallback(query), '(offline list)');
      }
    }, 450);
  });

  locationSearchInput.addEventListener('focus', () => {
    if (locationResultsList.children.length && !selectedLocation) locationResultsList.hidden = false;
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.location-field')) hideResults();
  });

  function selectLocation(lat, lon, label) {
    selectedLocation = { lat: parseFloat(lat), lon: parseFloat(lon), label };
    locationSearchInput.value = label;
    hideResults();
    locationSelectedP.textContent = '✓ ' + label + '  (' + selectedLocation.lat.toFixed(4) + ', ' + selectedLocation.lon.toFixed(4) + ')';
    locationSelectedP.hidden = false;
    resolveTimezone();
  }

  // ---------- Manual coordinate fallback (locations Nominatim can't resolve) ----------
  manualToggleBtn.addEventListener('click', () => {
    manualMode = !manualMode;
    manualFields.hidden = !manualMode;
    manualToggleBtn.textContent = manualMode ? 'Use the place search instead' : "Can't find it? Enter coordinates manually";
    if (manualMode) resolveTimezone();
  });
  manualLat.addEventListener('input', resolveTimezone);
  manualLon.addEventListener('input', resolveTimezone);

  // ---------- Timezone auto-resolution: tz-lookup (lat/lon -> IANA zone) + Intl (historical UTC offset) ----------
  function currentCoords() {
    if (manualMode) {
      const lat = parseFloat(manualLat.value), lon = parseFloat(manualLon.value);
      if (isNaN(lat) || isNaN(lon)) return null;
      return { lat, lon };
    }
    return selectedLocation;
  }

  function formatOffsetLabel(hours) {
    const sign = hours < 0 ? '-' : '+';
    const abs = Math.abs(hours);
    const h = Math.floor(abs);
    const m = Math.round((abs - h) * 60);
    return 'UTC' + sign + h + (m ? ':' + String(m).padStart(2, '0') : '');
  }

  function resolveTimezone() {
    if (typeof tzlookup !== 'function' || !tzHelper) return;
    const coords = currentCoords();
    if (!coords) return;

    let iana;
    try {
      iana = tzlookup(coords.lat, coords.lon);
    } catch (e) {
      return;
    }

    // Use the entered birth date/time (falls back to today) so the resolved offset reflects
    // the DST rules actually in effect then, not today's rules.
    let y, mo, d, h, mi;
    if (dobInput.value && tobInput.value) {
      [y, mo, d] = dobInput.value.split('-').map(Number);
      [h, mi] = tobInput.value.split(':').map(Number);
    } else {
      const now = new Date();
      y = now.getUTCFullYear(); mo = now.getUTCMonth() + 1; d = now.getUTCDate();
      h = now.getUTCHours(); mi = now.getUTCMinutes();
    }

    let offsetHours;
    try {
      const instant = new Date(Date.UTC(y, mo - 1, d, h, mi));
      const dtf = new Intl.DateTimeFormat('en-US', { timeZone: iana, timeZoneName: 'longOffset' });
      const part = dtf.formatToParts(instant).find(p => p.type === 'timeZoneName').value; // e.g. "GMT+5:30"
      const m = part.match(/GMT([+-])(\d+)(?::(\d+))?/);
      if (!m) return;
      offsetHours = (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) + (m[3] ? parseInt(m[3], 10) : 0) / 60);
    } catch (e) {
      return;
    }

    tzInput.value = offsetHours;
    tzHelper.innerHTML = 'Auto-detected: <span class="tz-auto-label">' + formatOffsetLabel(offsetHours) + ' &middot; ' + iana.replace(/_/g, ' ') + '</span> for this date (adjusts for daylight saving automatically). Looks wrong? Just type over the number above.';
  }

  dobInput.addEventListener('change', resolveTimezone);
  tobInput.addEventListener('change', resolveTimezone);

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
    const ascRashiIndex = chart.ascendant.rashiIndex;

    const planetsByHouse = {};
    for (let h = 1; h <= 12; h++) planetsByHouse[h] = [];
    for (const [name, data] of Object.entries(chart.planets)) {
      planetsByHouse[data.house].push(ABBR[name] || name);
    }

    let svg = '<svg viewBox="0 0 400 400" style="width:100%;max-width:420px;display:block;margin:0 auto;">'
      + '<rect x="0" y="0" width="400" height="400" fill="var(--paper-card)" stroke="var(--paper-line)" />';

    for (let h = 1; h <= 12; h++) {
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
    const tz = parseFloat(tzInput.value);

    let lat, lon, placeLabel;
    if (manualMode) {
      lat = parseFloat(manualLat.value);
      lon = parseFloat(manualLon.value);
      placeLabel = manualPlaceName.value.trim() || 'your entered coordinates';
      if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        errorBox.textContent = 'Please enter a valid latitude (-90 to 90) and longitude (-180 to 180).';
        errorBox.hidden = false;
        return;
      }
    } else {
      if (!selectedLocation) {
        errorBox.textContent = 'Please search for and select your birth place, or switch to manual coordinates.';
        errorBox.hidden = false;
        return;
      }
      lat = selectedLocation.lat;
      lon = selectedLocation.lon;
      placeLabel = selectedLocation.label;
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
