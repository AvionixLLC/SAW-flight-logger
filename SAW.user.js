// ==UserScript==
// @name         Semi-Automated-Webhook Flight Logger (GeoFS)
// @namespace    https://your-va.org/flightlogger
// @version      2025-10-02
// @description  Logs flights with crash detection, auto ICAO detection, session recovery, improved landing stats & advanced teleportation detection
// @match        http://*/geofs.php*
// @match        https://*/geofs.php*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const WEBHOOK_URL =
    'https://discord.com/api/webhooks/1406257491200966676/uo2BElGKf3Z2OTy2KGskd-cuIzKdiJSlgkiYUd9Hd0_622E0xE88Xigmqp4we6Woepxl';
  const STORAGE_KEY = 'geofs_flight_logger_session';
  const AIRLINES_KEY = 'geofs_flight_logger_airlines';
  const LAST_AIRLINE_KEY = 'geofs_flight_logger_last_airline';
  const TERMS_AGREED_KEY = 'geofs_flight_logger_terms_agreed';
  const LAST_POSITION_KEY = 'geofs_flight_logger_last_position';
  const TELEPORT_WARNINGS_KEY = 'geofs_flight_logger_teleport_warnings';

  let flightStarted = false;
  let flightStartTime = null;
  let departureICAO = 'UNKNOWN';
  let arrivalICAO = 'UNKNOWN';
  let hasLanded = false;
  let monitorInterval = null;
  let firstGroundContact = false;
  let firstGroundTime = null;
  let panelUI, startButton, callsignInput, aircraftInput, airlineSelect;
  let airportsDB = [];
  let departureAirportData = null;
  let arrivalAirportData = null;

  // Enhanced landing stats variables
  let previousAGL = 0;
  let currentAGL = 0;
  let calculatedVerticalSpeed = 0;
  let previousTime = Date.now();
  let currentTime = Date.now();
  let bounces = 0;
  let isGrounded = true;
  let justLanded = false;

  // ====== Simplified Teleportation Detection System ======
  const TELEPORT_DISTANCE_THRESHOLD = 2000; // Distance in meters (2km) to trigger a check
  const TELEPORT_VERIFICATION_TIME = 10000; // Time in ms (10 seconds) to wait and verify

  let gameLoadTime = Date.now();
  let isGameLoading = true;
  let currentFlightTeleported = false;

  // State for the new verification logic
  let isVerifyingTeleport = false;
  let teleportCheckStartTime = null;
  let preTeleportPosition = null;

  let lastPosition = (() => {
    const stored = localStorage.getItem(LAST_POSITION_KEY);
    return stored ? JSON.parse(stored) : null;
  })();

  /**
   * Saves the aircraft's current position to localStorage for teleportation detection
   * @param {number} lat - Latitude coordinate
   * @param {number} lon - Longitude coordinate
   * @param {number} alt - Altitude in meters
   */
  function saveLastPosition(lat, lon, alt) {
    const position = { lat, lon, alt, timestamp: Date.now() };
    lastPosition = position;
    localStorage.setItem(LAST_POSITION_KEY, JSON.stringify(position));
  }

  function getTeleportWarnings() {
    const stored = localStorage.getItem(TELEPORT_WARNINGS_KEY);
    return stored ? parseInt(stored) : 0;
  }

  function incrementTeleportWarnings() {
    const warnings = getTeleportWarnings() + 1;
    localStorage.setItem(TELEPORT_WARNINGS_KEY, warnings.toString());
    return warnings;
  }

  /**
   * Calculates the great circle distance between two geographical points
   * @param {number} lat1 - First point latitude
   * @param {number} lon1 - First point longitude
   * @param {number} lat2 - Second point latitude
   * @param {number} lon2 - Second point longitude
   * @returns {number} Distance in meters
   */
  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function checkTeleportation(currentLat, currentLon, currentAlt) {
    const now = Date.now();

    // If we are currently in the 10-second verification window
    if (isVerifyingTeleport) {
      if (now - teleportCheckStartTime < TELEPORT_VERIFICATION_TIME) {
        // Not enough time has passed, do nothing and don't update lastPosition
        return false;
      } else {
        // 10 seconds are up, let's check the final position
        isVerifyingTeleport = false;
        const finalDistance = getDistance(
          preTeleportPosition.lat,
          preTeleportPosition.lon,
          currentLat,
          currentLon
        );

        if (finalDistance > TELEPORT_DISTANCE_THRESHOLD) {
          // It was a real teleport, far away from the start point
          console.log(`🚨 Teleportation confirmed! Final distance: ${finalDistance.toFixed(1)}m`);

          const currentWarnings = getTeleportWarnings();
          if (currentWarnings < 1) {
            incrementTeleportWarnings();
            currentFlightTeleported = true;
            showToast(
              '⚠️ TELEPORTATION DETECTED!<br>📝 First warning - This will be noted in your report.',
              'warning',
              7000
            );
            // Update position to the new teleported location to start tracking from there
            saveLastPosition(currentLat, currentLon, currentAlt);
            return false; // Not terminating yet
          } else {
            showToast(
              '🚨 TELEPORTATION DETECTED!<br>❌ Multiple violations - Flight terminated',
              'warning',
              5000
            );
            if (flightStarted) {
              endFlight('TELEPORTATION');
            }
            return true; // Terminating
          }
        } else {
          // The user respawned nearby, it's fine
          console.log(`✅ Location re-verified. Distance: ${finalDistance.toFixed(1)}m. Flight continues.`);
          showToast('✅ Location verified<br>Flight continuing normally.', 'success', 4000);
          saveLastPosition(currentLat, currentLon, currentAlt); // Update position to the new verified one
          return false; // Not a teleport
        }
      }
    }

    // Skip during initial game load
    if (isGameLoading && now - gameLoadTime < 10000) {
      saveLastPosition(currentLat, currentLon, currentAlt);
      return false;
    } else if (isGameLoading) {
      isGameLoading = false;
      console.log('🎮 Game loading complete - teleportation detection active');
    }

    if (!lastPosition) {
      saveLastPosition(currentLat, currentLon, currentAlt);
      return false;
    }

    const distance = getDistance(
      lastPosition.lat,
      lastPosition.lon,
      currentLat,
      currentLon
    );

    // If a large jump is detected, start the verification process
    if (distance > TELEPORT_DISTANCE_THRESHOLD) {
      console.log(`🔄 Large position change detected (${distance.toFixed(1)}m). Starting verification...`);
      isVerifyingTeleport = true;
      teleportCheckStartTime = now;
      preTeleportPosition = { lat: lastPosition.lat, lon: lastPosition.lon }; // Store the position *before* the jump

      showToast(
        '🔄 Position Change Detected<br>Verifying new location in 10 seconds...',
        'info',
        TELEPORT_VERIFICATION_TIME
      );

      // We return false here to prevent any other action while we are waiting for verification.
      // The `lastPosition` will not be updated because we return before the final save.
      return false;
    }

    // If no large jump, just update the position and continue
    saveLastPosition(currentLat, currentLon, currentAlt);
    return false;
  }

  /**
   * Ends the current flight logging session and sends data to Discord webhook
   * @param {string} reason - Reason for ending flight ('NORMAL', 'CRASHED', 'TELEPORT', etc.)
   */
  function endFlight(reason = 'NORMAL') {
    if (!flightStarted) return;

    const now = Date.now();
    const values = geofs?.animation?.values;

    if (values) {
      const [lat, lon] = geofs.aircraft.instance.llaLocation || [
        values.latitude,
        values.longitude,
      ];

      if (reason === 'TELEPORTATION') {
        arrivalICAO = 'TELEPORT';
        arrivalAirportData = null;
      } else {
        const nearestAirport = getNearestAirport(lat, lon);
        arrivalICAO = nearestAirport
          ? nearestAirport.icao
          : promptForAirportICAO('Arrival', lat, lon);
        arrivalAirportData = nearestAirport;
      }

      const vs =
        reason === 'TELEPORTATION'
          ? 0
          : calculatedVerticalSpeed !== 0
            ? calculatedVerticalSpeed
            : values.verticalSpeed;
      const g =
        reason === 'TELEPORTATION' ? 0 : (values.accZ / 9.80665).toFixed(2);
      const gs = values.groundSpeedKnt?.toFixed(1) || '0';
      const tas = geofs.aircraft.instance.trueAirSpeed?.toFixed(1) || 'N/A';
      const quality =
        reason === 'TELEPORTATION'
          ? 'TELEPORT'
          : reason === 'CRASH'
            ? 'CRASH'
            : vs > -60
              ? 'BUTTER'
              : vs > -800
                ? 'HARD'
                : 'CRASH';

      const baseCallsign = callsignInput.value.trim() || 'Unknown';
      const airlineICAO = getCurrentAirlineICAO();
      const pilot = baseCallsign.toUpperCase().startsWith(airlineICAO)
        ? baseCallsign
        : `${airlineICAO}${baseCallsign}`;
      const aircraft = getAircraftName();
      const durationMin = Math.round((now - flightStartTime) / 60000);

      const hours = Math.floor(durationMin / 60);
      const minutes = durationMin % 60;
      const formattedDuration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

      sendLogToDiscord({
        pilot,
        aircraft,
        takeoff: flightStartTime,
        landing: now,
        dep: departureICAO,
        arr: arrivalICAO,
        duration: formattedDuration,
        vs: vs.toFixed(1),
        gforce: g,
        gs: gs,
        ktrue: tas,
        landingQuality: quality,
        teleportWarning: currentFlightTeleported && reason !== 'TELEPORTATION',
      });
    }

    resetPanel();
    clearSession();

    if (monitorInterval) {
      clearInterval(monitorInterval);
      monitorInterval = null;
    }
  }

  // ====== Load airports database ======
  fetch('https://raw.githubusercontent.com/mwgg/Airports/master/airports.json')
    .then(r => r.json())
    .then(data => {
      airportsDB = Object.entries(data).map(([icao, info]) => ({
        icao,
        lat: info.lat,
        lon: info.lon,
        tz: info.tz || null,
        name: info.name || '',
        city: info.city || '',
        country: info.country || '',
      }));
      console.log(`✅ Loaded ${airportsDB.length} airports`);
    })
    .catch(err => console.error('❌ Airport DB load failed:', err));

  function getNearestAirport(lat, lon) {
    if (!airportsDB.length) return { icao: 'UNKNOWN' };
    let nearest = null,
      minDist = Infinity;
    for (const ap of airportsDB) {
      const dLat = ((ap.lat - lat) * Math.PI) / 180;
      const dLon = ((ap.lon - lon) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat * Math.PI) / 180) *
          Math.cos((ap.lat * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const dist = 6371 * c;
      if (dist < minDist) {
        minDist = dist;
        nearest = ap;
      }
    }
    if (nearest && minDist > 30) return null;
    return nearest || null;
  }

  function saveSession() {
    const session = {
      flightStarted,
      flightStartTime,
      departureICAO,
      callsign: callsignInput?.value.trim() || 'Unknown',
      aircraft: getAircraftName(),
      firstGroundContact,
      departureAirportData,
      currentFlightTeleported,
      selectedAirline:
        airlineSelect?.options[airlineSelect?.selectedIndex]?.getAttribute(
          'data-airline-name'
        ) || null,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  function loadSession() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function promptForAirportICAO(type, lat, lon) {
    const locationStr = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    const icao = prompt(
      `❓ ${type} airport not found in database.\nLocation: ${locationStr}\n\nPlease enter the ICAO code manually (or leave empty for UNKNOWN):`
    );
    return icao ? icao.toUpperCase().trim() : 'UNKNOWN';
  }

  function getAircraftName() {
    let raw = geofs?.aircraft?.instance?.aircraftRecord?.name || 'Unknown';
    return raw.replace(/^\([^)]*\)\s*/, '');
  }

  function saveAirlines(airlines) {
    localStorage.setItem(AIRLINES_KEY, JSON.stringify(airlines));
  }

  function loadAirlines() {
    const stored = localStorage.getItem(AIRLINES_KEY);
    if (stored) {
      const airlines = JSON.parse(stored);
      const firstKey = Object.keys(airlines)[0];
      if (firstKey && typeof airlines[firstKey] === 'string') {
        console.log('📦 Upgrading airline data format...');
        const upgraded = {};
        for (const [name, webhook] of Object.entries(airlines)) {
          upgraded[name] = {
            webhook: webhook,
            icao: name === 'Default' ? 'GFS' : 'UNK',
          };
        }
        saveAirlines(upgraded);
        return upgraded;
      }
      return airlines;
    }
    return {
      Default: {
        webhook: WEBHOOK_URL,
        icao: 'GFS',
      },
    };
  }

  function saveLastAirline(airlineName) {
    localStorage.setItem(LAST_AIRLINE_KEY, airlineName);
  }

  function loadLastAirline() {
    return localStorage.getItem(LAST_AIRLINE_KEY);
  }

  function addNewAirline() {
    const name = prompt('Enter airline name:');
    if (!name) return;

    const icao = prompt('Enter airline ICAO code (e.g., EVA, CAL, CPA):');
    if (!icao) return;

    const webhook = prompt('Enter Discord webhook URL:');
    if (!webhook || !webhook.includes('discord.com/api/webhooks/')) {
      alert('Invalid webhook URL!');
      return;
    }

    const airlines = loadAirlines();
    airlines[name] = {
      webhook: webhook,
      icao: icao.toUpperCase().trim(),
    };
    saveAirlines(airlines);
    updateAirlineSelect();
    alert(`Added airline: ${name} (${icao.toUpperCase()})`);
  }

  function removeAirline() {
    const airlines = loadAirlines();
    const airlineNames = Object.keys(airlines);

    if (airlineNames.length <= 1) {
      alert('Cannot remove the last airline!');
      return;
    }

    const airlineList = airlineNames
      .map(name => {
        const icao = airlines[name].icao || airlines[name];
        return typeof airlines[name] === 'object' ? `${name} (${icao})` : name;
      })
      .join(', ');

    const selected = prompt(`Enter airline name to remove:\n${airlineList}`);
    if (selected && airlines[selected]) {
      delete airlines[selected];
      saveAirlines(airlines);
      updateAirlineSelect();
      alert(`Removed airline: ${selected}`);
    } else {
      alert('Airline not found!');
    }
  }

  function updateAirlineSelect() {
    const airlines = loadAirlines();
    const lastAirline = loadLastAirline();

    airlineSelect.innerHTML = '';

    for (const [name, airlineData] of Object.entries(airlines)) {
      const option = document.createElement('option');

      if (typeof airlineData === 'string') {
        option.value = airlineData;
        option.textContent = name;
      } else {
        option.value = airlineData.webhook;
        option.textContent = `${name} (${airlineData.icao})`;
      }

      option.setAttribute('data-airline-name', name);
      airlineSelect.appendChild(option);
    }

    if (lastAirline) {
      const targetOption = Array.from(airlineSelect.options).find(
        option => option.getAttribute('data-airline-name') === lastAirline
      );
      if (targetOption) {
        airlineSelect.value = targetOption.value;
        console.log(`✅ Restored last selected airline: ${lastAirline}`);
      }
    }

    airlineSelect.removeEventListener('change', airlineChangeHandler);
    airlineSelect.addEventListener('change', airlineChangeHandler);
  }

  function airlineChangeHandler() {
    const selectedOption = airlineSelect.options[airlineSelect.selectedIndex];
    const airlineName = selectedOption.getAttribute('data-airline-name');
    if (airlineName) {
      saveLastAirline(airlineName);
    }
  }

  function getCurrentWebhookURL() {
    const airlines = loadAirlines();
    const selectedOption = airlineSelect.options[airlineSelect.selectedIndex];
    const airlineName = selectedOption?.getAttribute('data-airline-name');

    if (airlineName && airlines[airlineName]) {
      const airlineData = airlines[airlineName];
      return typeof airlineData === 'object'
        ? airlineData.webhook
        : airlineData;
    }

    return airlineSelect.value || WEBHOOK_URL;
  }

  function getCurrentAirlineICAO() {
    const airlines = loadAirlines();
    const selectedOption = airlineSelect.options[airlineSelect.selectedIndex];
    const airlineName = selectedOption?.getAttribute('data-airline-name');

    if (airlineName && airlines[airlineName]) {
      const airlineData = airlines[airlineName];
      return typeof airlineData === 'object' ? airlineData.icao : 'GFS';
    }
    return 'GFS';
  }

  function formatTimeWithTimezone(timestamp, airportData) {
    let timeZone = 'UTC';
    let suffix = 'UTC';

    if (airportData && airportData.tz) {
      timeZone = airportData.tz;
      const date = new Date(timestamp);
      const timezoneName =
        date
          .toLocaleDateString('en', {
            timeZone: timeZone,
            timeZoneName: 'short',
          })
          .split(', ')[1] ||
        timeZone.split('/')[1] ||
        'LT';
      suffix = timezoneName;
    }

    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    return `${fmt.format(new Date(timestamp))} ${suffix}`;
  }

  function sendLogToDiscord(data) {
    const takeoffTime = formatTimeWithTimezone(
      data.takeoff,
      departureAirportData
    );
    const landingTime = formatTimeWithTimezone(
      data.landing,
      arrivalAirportData
    );

    let embedColor;
    switch (data.landingQuality) {
      case 'BUTTER':
        embedColor = 0x00ff00;
        break;
      case 'HARD':
        embedColor = 0xff8000;
        break;
      case 'CRASH':
        embedColor = 0xff0000;
        break;
      case 'TELEPORT':
        embedColor = 0xff00ff;
        break;
      default:
        embedColor = 0x0099ff;
        break;
    }

    if (data.teleportWarning) {
      embedColor = 0xffaa00;
    }

    const fields = [
      {
        name: '✈️ Flight Information',
        value: `**Flight no.**: ${data.pilot}\n**Pilot name**: ${geofs?.userRecord?.callsign || 'Unknown'}\n**Aircraft**: ${data.aircraft}`,
        inline: false,
      },
      {
        name: '📍 Route',
        value: `**Departure**: ${data.dep}\n**Arrival**: ${data.arr}`,
        inline: true,
      },
      {
        name: '⏱️ Duration',
        value: `**Flight Time**: ${data.duration}`,
        inline: true,
      },
      {
        name: '📊 Flight Data',
        value: `**V/S**: ${data.vs} fpm\n**G-Force**: ${data.gforce}\n**TAS**: ${data.ktrue} kts\n**GS**: ${data.gs} kts`,
        inline: true,
      },
      {
        name: '🏁 Landing Quality',
        value: `**${data.landingQuality}**`,
        inline: true,
      },
      {
        name: '🕓 Times',
        value: `**Takeoff**: ${takeoffTime}\n**Landing**: ${landingTime}`,
        inline: false,
      },
    ];

    if (data.teleportWarning) {
      fields.push({
        name: '⚠️ Flight Integrity Notice',
        value:
          '**Teleportation detected during flight**\nThis flight contained position anomalies that may affect data accuracy.',
        inline: false,
      });
    }

    const message = {
      embeds: [
        {
          title: '🛫 Flight Report - GeoFS',
          color: embedColor,
          fields: fields,
          timestamp: new Date().toISOString(),
          footer: {
            text: 'GeoFS Flight Logger',
          },
        },
      ],
    };

    fetch(getCurrentWebhookURL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })
      .then(() => console.log('✅ Flight log sent'))
      .catch(console.error);
  }

  function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    Object.assign(toast.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '12px 20px',
      borderRadius: '8px',
      color: 'white',
      fontWeight: 'bold',
      fontSize: '14px',
      fontFamily: 'sans-serif',
      zIndex: '10001',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      opacity: '0',
      transform: 'translateX(100%)',
      transition: 'all 0.3s ease-in-out',
    });
    switch (type) {
      case 'crash':
        toast.style.background = 'linear-gradient(135deg, #ff4444, #cc0000)';
        break;
      case 'success':
        toast.style.background = 'linear-gradient(135deg, #00ff44, #00cc00)';
        break;
      case 'warning':
        toast.style.background = 'linear-gradient(135deg, #ffaa00, #ff8800)';
        break;
      default:
        toast.style.background = 'linear-gradient(135deg, #0099ff, #0066cc)';
    }
    toast.innerHTML = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    }, 10);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (document.body.contains(toast)) document.body.removeChild(toast);
      }, 300);
    }, duration);
  }

  function updateCalVertS() {
    if (
      typeof geofs.animation.values != 'undefined' &&
      !geofs.isPaused() &&
      (geofs.animation.values.altitude !== undefined &&
      geofs.animation.values.groundElevationFeet !== undefined
        ? geofs.animation.values.altitude -
          geofs.animation.values.groundElevationFeet +
          geofs.aircraft.instance.collisionPoints[
            geofs.aircraft.instance.collisionPoints.length - 2
          ].worldPosition[2] *
            3.2808399
        : 'N/A') !== previousAGL
    ) {
      currentAGL =
        geofs.animation.values.altitude !== undefined &&
        geofs.animation.values.groundElevationFeet !== undefined
          ? geofs.animation.values.altitude -
            geofs.animation.values.groundElevationFeet +
            geofs.aircraft.instance.collisionPoints[
              geofs.aircraft.instance.collisionPoints.length - 2
            ].worldPosition[2] *
              3.2808399
          : 'N/A';
      currentTime = Date.now();
      calculatedVerticalSpeed =
        (currentAGL - previousAGL) * (60000 / (currentTime - previousTime));
      previousAGL = currentAGL;
      previousTime = Date.now();
    }
  }

  function monitorFlight() {
    if (!geofs?.animation?.values || !geofs.aircraft?.instance) return;
    const values = geofs.animation.values;
    const onGround = values.groundContact;
    const altitudeFt = values.altitude * 3.28084;
    const terrainFt = geofs.api?.map?.getTerrainAltitude?.() * 3.28084 || 0;
    const agl = altitudeFt - terrainFt;
    const [lat, lon] = geofs.aircraft.instance.llaLocation || [
      values.latitude,
      values.longitude,
    ];
    const now = Date.now();

    // Check for teleportation
    if (checkTeleportation(lat, lon, altitudeFt)) {
      return; // Flight has been terminated due to teleportation
    }

    // Enhanced AGL calculation
    const enhancedAGL =
      values.altitude !== undefined && values.groundElevationFeet !== undefined
        ? values.altitude -
          values.groundElevationFeet +
          geofs.aircraft.instance.collisionPoints[
            geofs.aircraft.instance.collisionPoints.length - 2
          ].worldPosition[2] *
            3.2808399
        : 'N/A';

    // Enhanced landing detection
    if (enhancedAGL < 500) {
      justLanded = onGround && !isGrounded;
      isGrounded = onGround;
    }

    if (!flightStarted && !onGround && agl > 100) {
      flightStarted = true;
      flightStartTime = now;
      const nearestAirport = getNearestAirport(lat, lon);
      if (nearestAirport) {
        departureICAO = nearestAirport.icao;
        departureAirportData = nearestAirport;
      } else {
        departureICAO = promptForAirportICAO('Departure', lat, lon);
        departureAirportData = null;
      }
      saveSession();
      console.log(`🛫 Departure detected at ${departureICAO}`);
      if (panelUI) {
        if (window.instruments && window.instruments.visible) {
          panelUI.style.opacity = '0';
          setTimeout(() => (panelUI.style.display = 'none'), 500);
        }
      }
    }

    const elapsed = (now - flightStartTime) / 1000;
    if (flightStarted && !firstGroundContact && onGround) {
      if (elapsed < 1) return;

      if (justLanded) {
        bounces++;
      }

      const vs =
        calculatedVerticalSpeed !== 0
          ? calculatedVerticalSpeed
          : values.verticalSpeed;

      if (vs <= -800) {
        showToast(
          '💥 CRASH DETECTED<br>Logging crash report...',
          'crash',
          4000
        );
        const nearestAirport = getNearestAirport(lat, lon);
        if (nearestAirport) {
          arrivalICAO = 'Crash';
          arrivalAirportData = nearestAirport;
        } else {
          arrivalICAO = 'Crash';
          arrivalAirportData = null;
        }
      } else {
        const nearestAirport = getNearestAirport(lat, lon);
        if (nearestAirport) {
          arrivalICAO = nearestAirport.icao;
          arrivalAirportData = nearestAirport;
        } else {
          arrivalICAO = promptForAirportICAO('Arrival', lat, lon);
          arrivalAirportData = null;
        }
      }

      console.log(`🛬 Arrival detected at ${arrivalICAO}`);
      firstGroundContact = true;
      firstGroundTime = now;

      const g = (values.accZ / 9.80665).toFixed(2);
      const gs = values.groundSpeedKnt.toFixed(1);
      const tas = geofs.aircraft.instance.trueAirSpeed?.toFixed(1) || 'N/A';
      const quality = vs > -60 ? 'BUTTER' : vs > -800 ? 'HARD' : 'CRASH';
      const baseCallsign = callsignInput.value.trim() || 'Unknown';
      const airlineICAO = getCurrentAirlineICAO();
      const pilot = baseCallsign.toUpperCase().startsWith(airlineICAO)
        ? baseCallsign
        : `${airlineICAO}${baseCallsign}`;
      const aircraft = getAircraftName();
      const durationMin = Math.round(
        (firstGroundTime - flightStartTime) / 60000
      );

      const hours = Math.floor(durationMin / 60);
      const minutes = durationMin % 60;
      const formattedDuration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

      sendLogToDiscord({
        pilot,
        aircraft,
        takeoff: flightStartTime,
        landing: firstGroundTime,
        dep: departureICAO,
        arr: arrivalICAO,
        duration: formattedDuration,
        vs: vs.toFixed(1),
        gforce: g,
        gs: gs,
        ktrue: tas,
        landingQuality: quality,
        teleportWarning: currentFlightTeleported,
      });

      saveSession();
      clearSession();
      resetPanel();

      if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
      }
    }
  }

  function resetPanel() {
    flightStarted = false;
    hasLanded = false;
    firstGroundContact = false;
    flightStartTime = null;
    departureICAO = 'UNKNOWN';
    arrivalICAO = 'UNKNOWN';
    departureAirportData = null;
    arrivalAirportData = null;
    bounces = 0;
    isGrounded = true;
    currentFlightTeleported = false;
    callsignInput.value = '';
    callsignInput.disabled = false;
    startButton.disabled = true;
    startButton.innerText = '📋 Activate Logger';
    if (panelUI) {
      if (window.instruments && window.instruments.visible) {
        panelUI.style.display = 'block';
        panelUI.style.opacity = '0.7';
      }
    }
  }

  function hasAgreedToTerms() {
    return localStorage.getItem(TERMS_AGREED_KEY) === 'true';
  }

  function setTermsAgreed() {
    localStorage.setItem(TERMS_AGREED_KEY, 'true');
  }

  function showTermsDialog() {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      zIndex: '10000',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    });

    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
      background: '#1a1a1a',
      color: 'white',
      padding: '30px',
      borderRadius: '10px',
      border: '2px solid #444',
      maxWidth: '600px',
      maxHeight: '80vh',
      overflow: 'auto',
      fontFamily: 'sans-serif',
    });

    dialog.innerHTML = `
      <h2 style="color: #00C8FF; margin-top: 0;">GeoFS SAW Flight Logger - Terms of Use</h2>

      <div style="background: #2a2a2a; padding: 20px; border-radius: 5px; margin: 20px 0; max-height: 300px; overflow-y: auto;">
        <h3>📜 Terms and Conditions of the SAW System</h3>

        <div style="background: #333; padding: 15px; border-left: 4px solid #00C8FF; margin: 15px 0;">
          <p><strong>1. Flight Integrity Agreement</strong><br>
          You agree not to fake flights with this script. All recorded flights must be genuine flight simulation activities performed in GeoFS.</p>

          <p><strong>2. Modification Restrictions</strong><br>
          You agree not to make any major changes to this script without giving notice to the creator due to technical reasons and system integrity requirements.</p>

          <p><strong>3. Pilot Preparation Responsibility</strong><br>
          You agree to give pilots decent preparation for using this script, including proper training and understanding of its functionality before deployment.</p>
        </div>

        <h4>📋 Additional Terms:</h4>

        <p><strong>4. Purpose Statement</strong><br>
        This script is intended solely for GeoFS flight simulation logging purposes and must not be used for commercial purposes or illegal activities.</p>

        <p><strong>5. Data Responsibility</strong><br>
        • Users are responsible for the security of their Discord Webhook URLs<br>
        • Users must ensure they have permission to use the configured Discord servers<br>
        • This script does not store or transmit any personal sensitive information</p>

        <p><strong>6. Disclaimer</strong><br>
        • This script is provided "as is" without any form of warranty<br>
        • The author is not responsible for any losses caused by using this script<br>
        • Users assume all risks of use</p>

        <p><strong>7. Data Processing</strong><br>
        This script only stores the following data locally:<br>
        • Airline settings and selection records<br>
        • Flight session states<br>
        • User preference settings</p>

        <p><strong>8. Terms Modification</strong><br>
        The author reserves the right to modify these terms at any time. Continued use indicates acceptance of the modified terms.</p>
      </div>

      <div style="text-align: center; margin-top: 25px;">
        <button id="agreeBtn" style="
          background: #00C8FF;
          color: white;
          border: none;
          padding: 12px 25px;
          margin: 0 10px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
        ">✅ I Agree</button>

        <button id="disagreeBtn" style="
          background: #ff4444;
          color: white;
          border: none;
          padding: 12px 25px;
          margin: 0 10px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
        ">❌ I Disagree</button>
      </div>

      <p style="text-align: center; margin-top: 20px; font-size: 12px; color: #888;">
        Selecting "I Disagree" will prevent the use of GeoFS SAW Flight Logger
      </p>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    document.getElementById('agreeBtn').addEventListener('click', function () {
      setTermsAgreed();
      document.body.removeChild(overlay);
      console.log('✅ User agreed to SAW system terms of use');
      createSidePanel();
      setTimeout(updatePanelVisibility, 1000);
    });

    document
      .getElementById('disagreeBtn')
      .addEventListener('click', function () {
        document.body.removeChild(overlay);
        console.log(
          '❌ User disagreed to SAW system terms of use - Flight Logger disabled'
        );
        alert(
          'You chose to disagree with the terms of use. GeoFS SAW Flight Logger will not be activated.'
        );
      });

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        e.preventDefault();
      }
    });
  }

  function disableKeyPropagation(input) {
    ['keydown', 'keyup', 'keypress'].forEach(ev =>
      input.addEventListener(ev, e => e.stopPropagation())
    );
  }

  /**
   * Creates the main UI panel for the flight logger with an enhanced, modern UI.
   */
  function createSidePanel() {
    // --- Start of new UI styles ---
    const styles = `
      #saw-logger-panel {
        position: absolute;
        bottom: 50px;
        left: 10px;
        background: rgba(25, 28, 32, 0.85);
        color: #e0e0e0;
        backdrop-filter: blur(10px) saturate(1.5);
        -webkit-backdrop-filter: blur(10px) saturate(1.5);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        z-index: 21;
        width: 250px;
        font-family: 'Segoe UI', Roboto, sans-serif;
        transition: opacity 0.4s ease;
        display: block;
        opacity: 0.7;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
        overflow: hidden;
      }
      #saw-logger-panel:hover {
        opacity: 1;
      }
      .saw-header {
        background: rgba(0, 0, 0, 0.3);
        padding: 8px 12px;
        font-size: 16px;
        font-weight: bold;
        color: #00C8FF;
        text-align: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      .saw-content {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .saw-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .saw-label {
        font-size: 12px;
        font-weight: 500;
        color: #aaa;
        text-transform: uppercase;
      }
      .saw-input, .saw-select {
        width: 100%;
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fff;
        border-radius: 6px;
        padding: 8px;
        box-sizing: border-box;
      }
      .saw-input:focus, .saw-select:focus {
        outline: none;
        border-color: #00C8FF;
      }
      .saw-button-group {
        display: flex;
        gap: 6px;
      }
      .saw-button {
        flex: 1;
        padding: 6px;
        background: rgba(255, 255, 255, 0.1);
        color: #e0e0e0;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        transition: background-color 0.2s, border-color 0.2s;
      }
      .saw-button:hover {
        background: rgba(255, 255, 255, 0.2);
        border-color: rgba(255, 255, 255, 0.3);
      }
      .saw-button.add {
        color: #81f0a3;
      }
      .saw-button.remove {
        color: #f08181;
      }
      .saw-button-primary {
        background: #007BFF;
        color: white;
        font-weight: bold;
        border: none;
        padding: 10px;
        font-size: 14px;
      }
      .saw-button-primary:disabled {
        background: #333;
        color: #777;
        cursor: not-allowed;
      }
      .saw-button-primary:not(:disabled):hover {
        background: #0099FF;
      }
      .saw-button-resume {
        background: #1c5c34;
        font-size: 12px;
      }
      .saw-button-resume:disabled {
        background: #333;
        opacity: 0.6;
      }
      .saw-button-resume:not(:disabled):hover {
        background: #2a7a4a;
      }
      .saw-footer {
        background: rgba(0, 0, 0, 0.2);
        padding: 6px 12px;
        font-size: 11px;
        text-align: center;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }
      .warning-status.ok { color: #55ff88; }
      .warning-status.warn { color: #ffaa00; }
    `;

    // Inject styles into the document head
    const styleSheet = document.createElement('style');
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
    // --- End of new UI styles ---

    panelUI = document.createElement('div');
    panelUI.id = 'saw-logger-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'saw-header';
    header.textContent = 'SAW Flight Logger';
    panelUI.appendChild(header);

    const content = document.createElement('div');
    content.className = 'saw-content';

    // --- Airline Section ---
    const airlineSection = document.createElement('div');
    airlineSection.className = 'saw-section';

    const airlineLabel = document.createElement('label');
    airlineLabel.className = 'saw-label';
    airlineLabel.textContent = 'Airline';
    airlineSection.appendChild(airlineLabel);

    airlineSelect = document.createElement('select');
    airlineSelect.className = 'saw-select';
    airlineSection.appendChild(airlineSelect);

    const airlineButtons = document.createElement('div');
    airlineButtons.className = 'saw-button-group';

    const addAirlineBtn = document.createElement('button');
    addAirlineBtn.textContent = '+ Add New';
    addAirlineBtn.className = 'saw-button add';
    addAirlineBtn.onclick = addNewAirline;

    const removeAirlineBtn = document.createElement('button');
    removeAirlineBtn.textContent = '- Remove';
    removeAirlineBtn.className = 'saw-button remove';
    removeAirlineBtn.onclick = removeAirline;

    airlineButtons.appendChild(addAirlineBtn);
    airlineButtons.appendChild(removeAirlineBtn);
    airlineSection.appendChild(airlineButtons);
    content.appendChild(airlineSection);

    // --- Flight Section ---
    const flightSection = document.createElement('div');
    flightSection.className = 'saw-section';

    const callsignLabel = document.createElement('label');
    callsignLabel.className = 'saw-label';
    callsignLabel.textContent = 'Flight Number / Callsign';
    flightSection.appendChild(callsignLabel);

    callsignInput = document.createElement('input');
    callsignInput.className = 'saw-input';
    callsignInput.placeholder = 'e.g., 1234';
    disableKeyPropagation(callsignInput);
    callsignInput.onkeyup = () => {
      startButton.disabled = callsignInput.value.trim() === '';
    };
    flightSection.appendChild(callsignInput);

    startButton = document.createElement('button');
    startButton.innerText = '📋 Activate Logger';
    startButton.disabled = true;
    startButton.className = 'saw-button saw-button-primary';
    startButton.onclick = () => {
      if (!callsignInput.value.trim()) {
        alert('Please enter a callsign before starting the flight logger!');
        return;
      }

      alert('Flight Logger activated! Takeoff when ready.');
      monitorInterval = setInterval(monitorFlight, 1000);
      setInterval(updateCalVertS, 25);
      startButton.innerText = '✅ Logger Running';
      startButton.disabled = true;
      callsignInput.disabled = true;
    };
    flightSection.appendChild(startButton);
    content.appendChild(flightSection);

    // --- Session Section ---
    const sessionSection = document.createElement('div');
    sessionSection.className = 'saw-section';

    const resumeSession = loadSession();
    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'saw-button saw-button-resume';

    if (
      resumeSession &&
      resumeSession.flightStarted &&
      resumeSession.callsign
    ) {
      const sessionAge = (Date.now() - resumeSession.timestamp) / (1000 * 60);
      const sessionInfo = `${resumeSession.callsign} (${resumeSession.departureICAO})`;
      resumeBtn.innerText =
        sessionAge < 60
          ? `⏪ Resume: ${sessionInfo}`
          : `⏪ Resume: ${sessionInfo} (${Math.floor(sessionAge / 60)}h ago)`;
    } else {
      resumeBtn.innerText = '⏪ No Flight to Resume';
      resumeBtn.disabled = true;
    }

    resumeBtn.onclick = () => {
      if (resumeSession && resumeSession.flightStarted) {
        flightStarted = true;
        flightStartTime = resumeSession.flightStartTime;
        departureICAO = resumeSession.departureICAO;
        departureAirportData = resumeSession.departureAirportData;
        firstGroundContact = resumeSession.firstGroundContact || false;
        currentFlightTeleported =
          resumeSession.currentFlightTeleported || false;

        callsignInput.value = resumeSession.callsign || '';

        if (resumeSession.selectedAirline && airlineSelect) {
          const targetOption = Array.from(airlineSelect.options).find(
            option =>
              option.getAttribute('data-airline-name') ===
              resumeSession.selectedAirline
          );
          if (targetOption) {
            airlineSelect.value = targetOption.value;
          }
        }

        monitorInterval = setInterval(monitorFlight, 1000);
        setInterval(updateCalVertS, 25);

        resumeBtn.innerText = '✅ Resumed!';
        resumeBtn.disabled = true;
        startButton.innerText = '✅ Logger Running';
        startButton.disabled = true;
        callsignInput.disabled = true;

        console.log(
          `🔁 Flight resumed: ${resumeSession.callsign} from ${departureICAO}`
        );
        showToast(
          `🔄 Flight resumed: ${resumeSession.callsign}<br>📍 From: ${departureICAO}<br>Position will be verified.`,
          'success',
          6000
        );

        if (panelUI && window.instruments && window.instruments.visible) {
          panelUI.style.opacity = '0';
          setTimeout(() => (panelUI.style.display = 'none'), 500);
        }
      } else {
        alert('❌ No valid flight session found to resume.');
      }
    };
    sessionSection.appendChild(resumeBtn);
    content.appendChild(sessionSection);
    panelUI.appendChild(content);

    // --- Footer ---
    const footer = document.createElement('div');
    footer.className = 'saw-footer';

    const warningStatus = document.createElement('div');
    const currentWarnings = getTeleportWarnings();
    warningStatus.className = `warning-status ${currentWarnings > 0 ? 'warn' : 'ok'}`;
    warningStatus.innerHTML = `⚠️ Teleport Warnings: ${currentWarnings}/2`;
    footer.appendChild(warningStatus);
    panelUI.appendChild(footer);

    document.body.appendChild(panelUI);
    updateAirlineSelect();
  }


  function updatePanelVisibility() {
    if (panelUI) {
      panelUI.style.display =
        window.instruments && window.instruments.visible ? 'block' : 'none';
    }
    setTimeout(updatePanelVisibility, 100);
  }

  window.addEventListener('load', () => {
    console.log('✅ GeoFS SAW Flight Logger loaded');

    if (localStorage.getItem(TERMS_AGREED_KEY) === 'true') {
      console.log(
        '✅ SAW system terms already agreed, initializing Flight Logger'
      );
      createSidePanel();
      setTimeout(updatePanelVisibility, 1000);
    } else {
      console.log('📋 First time user, showing SAW system terms of use');
      setTimeout(showTermsDialog, 2000);
    }
  });
})();

