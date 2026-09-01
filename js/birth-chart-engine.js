// Vedic birth chart calculation engine.
// Sidereal zodiac (Lahiri ayanamsa), Whole Sign houses. Requires astronomy-engine (window.Astronomy).
//
// Validated against:
//  - Lahiri ayanamsa at J2000.0 = 23.8531 deg (published reference value)
//  - Makar Sankranti (Sun sidereal ingress into Capricorn, ~Jan 14 every year)
//  - Mesha Sankranti (Sun sidereal ingress into Aries, ~Apr 14 every year)
//  - Ascendant at local sunrise matches the Sun's own sidereal longitude to ~1 deg
//  - Mean lunar node (Rahu) retrograde rate matches the theoretical 18.6-year cycle (~19.35 deg/year)
//  - Retrograde detection matches real published stations: Mercury direct on 2026-10-20,
//    retrograde on 2026-11-01, direct again by 2026-12-01 (Oct 24 - Nov 13 2026 window);
//    Mars retrograde through 2022-12-01, direct by 2023-03-01 (Oct 30 2022 - Jan 12 2023 window)

(function (global) {
  const RASHIS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
  const NAKSHATRAS = [
    'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha',
    'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
    'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'
  ];

  function normalize360(deg) {
    let d = deg % 360;
    if (d < 0) d += 360;
    return d;
  }

  function lahiriAyanamsa(date) {
    const yearsSince2000 = (date.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / (365.25 * 86400000);
    return 23.8531 + yearsSince2000 * (50.2388475 / 3600);
  }

  function siderealToRashi(siderealLon) {
    const s = normalize360(siderealLon);
    const idx = Math.floor(s / 30);
    return { rashi: RASHIS[idx], rashiIndex: idx, degreeInSign: s % 30 };
  }

  function siderealToNakshatra(siderealLon) {
    const span = 360 / 27;
    const idx = Math.floor(normalize360(siderealLon) / span);
    const posInNak = normalize360(siderealLon) % span;
    const pada = Math.floor(posInNak / (span / 4)) + 1;
    return { nakshatra: NAKSHATRAS[idx], pada };
  }

  function getTropicalLongitude(body, date) {
    const vec = global.Astronomy.GeoVector(body, date, true);
    const ecl = global.Astronomy.Ecliptic(vec);
    return ecl.elon;
  }

  function obliquityOfEcliptic(date) {
    const T = (date.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / (365.25 * 86400000) / 100;
    return 23.4392911 - 0.0130042 * T;
  }

  function calcAscendantTropical(date, latDeg, lonDeg) {
    const gstHours = global.Astronomy.SiderealTime(date);
    const ramc = normalize360(gstHours * 15 + lonDeg);
    const eps = obliquityOfEcliptic(date) * Math.PI / 180;
    const ramcRad = ramc * Math.PI / 180;
    const latRad = latDeg * Math.PI / 180;
    const y = -Math.cos(ramcRad);
    const x = Math.sin(ramcRad) * Math.cos(eps) + Math.tan(latRad) * Math.sin(eps);
    let ascDeg = Math.atan2(y, x) * 180 / Math.PI;
    return normalize360(ascDeg + 180); // corrected: raw formula yields the descendant without this offset
  }

  function meanLunarNodeTropical(date) {
    const T = (date.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / (365.25 * 86400000) / 100;
    const omega = 125.04452 - 1934.136261 * T + 0.0020708 * T * T + (T * T * T) / 450000;
    return normalize360(omega);
  }

  // House number (1-12, Whole Sign) for a given planet's rashi index, relative to the Ascendant's rashi index.
  function houseFromRashi(rashiIndex, ascRashiIndex) {
    return ((rashiIndex - ascRashiIndex + 12) % 12) + 1;
  }

  // Exaltation/debilitation only applies to the 7 classical grahas (Sun-Saturn) -- Rahu/Ketu
  // exaltation points are not agreed upon across traditions, so they are deliberately left out.
  const EXALTATION_RASHI = { Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6 };

  function dignityFor(planetName, rashiIndex) {
    const exalt = EXALTATION_RASHI[planetName];
    if (exalt === undefined) return null;
    if (rashiIndex === exalt) return 'exalted';
    if (rashiIndex === (exalt + 6) % 12) return 'debilitated';
    return null;
  }

  // Standard BPHS combustion orbs (direct-motion values), degrees from the Sun.
  const COMBUSTION_ORB = { Moon: 12, Mars: 17, Mercury: 14, Jupiter: 11, Venus: 10, Saturn: 15 };

  function isCombust(planetName, planetSid, sunSid) {
    const orb = COMBUSTION_ORB[planetName];
    if (orb === undefined) return false;
    let diff = Math.abs(planetSid - sunSid) % 360;
    if (diff > 180) diff = 360 - diff;
    return diff <= orb;
  }

  // Navamsa (D9): each 30 deg sign divided into 9 parts of 3d20'. Fire signs start their
  // navamsa count from Aries, Earth from Capricorn, Air from Libra, Water from Cancer.
  function navamsaRashiIndex(rashiIndex, degreeInSign) {
    const amsaIndex = Math.floor(degreeInSign / (30 / 9)); // 0-8
    return (rashiIndex * 9 + amsaIndex) % 12;
  }

  function degToDegMin(deg) {
    const d = Math.floor(deg);
    const m = Math.round((deg - d) * 60);
    if (m === 60) return (d + 1) + '°00\'';
    return d + '°' + String(m).padStart(2, '0') + '\'';
  }

  // Retrograde: compares tropical longitude now vs +1 day. Direction of apparent motion is
  // identical in tropical and sidereal (ayanamsa is a constant offset), so this needs no
  // sidereal conversion. Sun and Moon are never retrograde; Rahu/Ketu (mean node) are treated
  // as always retrograde by convention, matching standard Vedic practice.
  function isRetrograde(planetName, date) {
    if (planetName === 'Sun' || planetName === 'Moon') return false;
    if (planetName === 'Rahu' || planetName === 'Ketu') return true;
    const lon1 = getTropicalLongitude(planetName, date);
    const later = new Date(date.getTime() + 86400000);
    const lon2 = getTropicalLongitude(planetName, later);
    let diff = lon2 - lon1;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    return diff < 0;
  }

  // Jaimini Sapta (7) Chara Karakas: the 7 classical planets ranked by degree-in-sign (0-30 deg),
  // highest degree = Atmakaraka down to lowest = Darakaraka. Rahu/Ketu are deliberately excluded
  // from this ranking -- whether/how to include the node in an 8th-Karaka scheme is disputed
  // across traditions, same reasoning as excluding them from the exaltation table above.
  const CHARA_KARAKA_NAMES = ['Atmakaraka', 'Amatyakaraka', 'Bhratrukaraka', 'Matrukaraka', 'Putrakaraka', 'Gnatikaraka', 'Darakaraka'];
  const CHARA_KARAKA_PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

  function computeCharaKarakas(planets) {
    const ranked = CHARA_KARAKA_PLANETS
      .map(name => ({ name, deg: planets[name].degreeInSign }))
      .sort((a, b) => b.deg - a.deg);
    const result = {};
    ranked.forEach((p, i) => { result[CHARA_KARAKA_NAMES[i]] = p.name; });
    return result;
  }

  function computeChart(date, latDeg, lonDeg) {
    const ayanamsa = lahiriAyanamsa(date);
    const bodyList = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
    const ascTrop = calcAscendantTropical(date, latDeg, lonDeg);
    const ascSid = normalize360(ascTrop - ayanamsa);
    const ascInfo = siderealToRashi(ascSid);

    const planets = {};
    for (const b of bodyList) {
      const trop = getTropicalLongitude(b, date);
      const sid = normalize360(trop - ayanamsa);
      const rashiInfo = siderealToRashi(sid);
      planets[b] = {
        sidereal: sid,
        rashi: rashiInfo.rashi,
        rashiIndex: rashiInfo.rashiIndex,
        degreeInSign: rashiInfo.degreeInSign,
        house: houseFromRashi(rashiInfo.rashiIndex, ascInfo.rashiIndex),
        retrograde: isRetrograde(b, date)
      };
    }

    const rahuTrop = meanLunarNodeTropical(date);
    const rahuSid = normalize360(rahuTrop - ayanamsa);
    const rahuInfo = siderealToRashi(rahuSid);
    planets['Rahu'] = {
      sidereal: rahuSid, rashi: rahuInfo.rashi, rashiIndex: rahuInfo.rashiIndex,
      degreeInSign: rahuInfo.degreeInSign, house: houseFromRashi(rahuInfo.rashiIndex, ascInfo.rashiIndex),
      retrograde: true
    };
    const ketuSid = normalize360(rahuSid + 180);
    const ketuInfo = siderealToRashi(ketuSid);
    planets['Ketu'] = {
      sidereal: ketuSid, rashi: ketuInfo.rashi, rashiIndex: ketuInfo.rashiIndex,
      degreeInSign: ketuInfo.degreeInSign, house: houseFromRashi(ketuInfo.rashiIndex, ascInfo.rashiIndex),
      retrograde: true
    };

    // Dignity, combustion, Vargottama (D1 sign === D9 Navamsa sign), and per-planet Nakshatra
    const sunSid = planets['Sun'].sidereal;
    for (const [name, p] of Object.entries(planets)) {
      p.dignity = dignityFor(name, p.rashiIndex);
      p.combust = name === 'Sun' ? false : isCombust(name, p.sidereal, sunSid);
      p.navamsaRashiIndex = navamsaRashiIndex(p.rashiIndex, p.degreeInSign);
      p.vargottama = p.navamsaRashiIndex === p.rashiIndex;
      p.degreeDisplay = degToDegMin(p.degreeInSign);
      const nak = siderealToNakshatra(p.sidereal);
      p.nakshatra = nak.nakshatra;
      p.nakshatraPada = nak.pada;
    }

    const moonNak = siderealToNakshatra(planets['Moon'].sidereal);
    const ascNavamsaRashiIndex = navamsaRashiIndex(ascInfo.rashiIndex, ascInfo.degreeInSign);
    const ascNakshatra = siderealToNakshatra(ascSid);

    // Navamsa (D9) chart: derived from each D1 planet's already-computed navamsaRashiIndex,
    // re-housed relative to the Ascendant's own D9 position. Same Whole Sign house logic as D1.
    const navamsaPlanets = {};
    for (const [name, p] of Object.entries(planets)) {
      navamsaPlanets[name] = {
        rashiIndex: p.navamsaRashiIndex,
        rashi: RASHIS[p.navamsaRashiIndex],
        house: houseFromRashi(p.navamsaRashiIndex, ascNavamsaRashiIndex)
      };
    }

    // House cusp Nakshatra: uses the equal-house cusp point (Ascendant degree + 30 deg per house),
    // not the Whole Sign house's fixed sign start. This is the standard "Bhava Nakshatra" method --
    // it varies with the exact Ascendant degree, unlike a Whole Sign cusp which would always fall in
    // the same fixed nakshatra regardless of birth time. House 1's cusp nakshatra therefore always
    // equals the Ascendant's own Nakshatra, which is a useful self-consistency check.
    const houseNakshatras = [];
    for (let h = 1; h <= 12; h++) {
      const cuspSid = normalize360(ascSid + (h - 1) * 30);
      const nak = siderealToNakshatra(cuspSid);
      houseNakshatras.push({ house: h, nakshatra: nak.nakshatra, pada: nak.pada });
    }

    const charaKarakas = computeCharaKarakas(planets);

    return {
      ayanamsa,
      ascendant: {
        sidereal: ascSid, rashi: ascInfo.rashi, rashiIndex: ascInfo.rashiIndex, degreeInSign: ascInfo.degreeInSign,
        degreeDisplay: degToDegMin(ascInfo.degreeInSign), navamsaRashiIndex: ascNavamsaRashiIndex,
        nakshatra: ascNakshatra.nakshatra, nakshatraPada: ascNakshatra.pada
      },
      planets,
      moonNakshatra: moonNak,
      navamsa: { ascendant: { rashiIndex: ascNavamsaRashiIndex, rashi: RASHIS[ascNavamsaRashiIndex] }, planets: navamsaPlanets },
      houseNakshatras,
      charaKarakas
    };
  }

  global.BirthChartEngine = {
    computeChart, siderealToRashi, siderealToNakshatra, normalize360, houseFromRashi, degToDegMin,
    navamsaRashiIndex, isRetrograde, computeCharaKarakas, RASHIS, NAKSHATRAS
  };
})(window);
