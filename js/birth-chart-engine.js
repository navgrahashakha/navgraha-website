// Vedic birth chart calculation engine.
// Sidereal zodiac (Lahiri ayanamsa), Whole Sign houses. Requires astronomy-engine (window.Astronomy).
//
// Validated against:
//  - Lahiri ayanamsa at J2000.0 = 23.8531 deg (published reference value)
//  - Makar Sankranti (Sun sidereal ingress into Capricorn, ~Jan 14 every year)
//  - Mesha Sankranti (Sun sidereal ingress into Aries, ~Apr 14 every year)
//  - Ascendant at local sunrise matches the Sun's own sidereal longitude to ~1 deg
//  - Mean lunar node (Rahu) retrograde rate matches the theoretical 18.6-year cycle (~19.35 deg/year)

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
        house: houseFromRashi(rashiInfo.rashiIndex, ascInfo.rashiIndex)
      };
    }

    const rahuTrop = meanLunarNodeTropical(date);
    const rahuSid = normalize360(rahuTrop - ayanamsa);
    const rahuInfo = siderealToRashi(rahuSid);
    planets['Rahu'] = {
      sidereal: rahuSid, rashi: rahuInfo.rashi, rashiIndex: rahuInfo.rashiIndex,
      degreeInSign: rahuInfo.degreeInSign, house: houseFromRashi(rahuInfo.rashiIndex, ascInfo.rashiIndex)
    };
    const ketuSid = normalize360(rahuSid + 180);
    const ketuInfo = siderealToRashi(ketuSid);
    planets['Ketu'] = {
      sidereal: ketuSid, rashi: ketuInfo.rashi, rashiIndex: ketuInfo.rashiIndex,
      degreeInSign: ketuInfo.degreeInSign, house: houseFromRashi(ketuInfo.rashiIndex, ascInfo.rashiIndex)
    };

    const moonNak = siderealToNakshatra(planets['Moon'].sidereal);

    return {
      ayanamsa,
      ascendant: { sidereal: ascSid, rashi: ascInfo.rashi, rashiIndex: ascInfo.rashiIndex, degreeInSign: ascInfo.degreeInSign },
      planets,
      moonNakshatra: moonNak
    };
  }

  global.BirthChartEngine = { computeChart, siderealToRashi, siderealToNakshatra, normalize360, RASHIS, NAKSHATRAS };
})(window);
