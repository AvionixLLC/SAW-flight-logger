// ==UserScript==
// @name         Auto-Airport Flight Logger (GeoFS) [Qatar Theme, Codeshare, Draggable]
// @namespace    https://your-va.org/flightlogger
// @version      2025-10-29
// @description  Logs flights with crash detection, auto ICAO, session recovery, codeshare support, and a modern UI.
// @match        http://*/geofs.php*
// @match        https://*/geofs.php*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // --- CONSTANTS ---
  const WEBHOOK_URL = "https://discord.com/api/webhooks/1427603258335301632/Want to steal webhook url? You clown"; // Default fallback
  const STORAGE_KEY = "geofs_flight_logger_session";
  const AIRLINES_KEY = "geofs_flight_logger_airlines";
  const LAST_AIRLINES_KEY = "geofs_flight_logger_last_airlines";
  const TERMS_AGREED_KEY = "geofs_flight_logger_terms_agreed";
  const DISCORD_ID_KEY = "geofs_flight_logger_discord_id";
  const PILOT_NAME_KEY = "geofs_flight_logger_pilot_name";

  // --- FLIGHT STATE VARIABLES ---
  let flightStarted = false;
  let flightStartTime = null;
  let departureICAO = "UNKNOWN";
  let arrivalICAO = "UNKNOWN";
  let hasLanded = false;
  let monitorInterval = null;
  let firstGroundContact = false;
  let firstGroundTime = null;
  let airportsDB = [];
  let departureAirportData = null;
  let arrivalAirportData = null;

  // --- UI ELEMENT VARIABLES ---
  let panelUI, startButton, callsignInput, airlineListContainer, resumeBtn, toggleBtn, contentUI;
  let pilotNameInput, discordIdInput;

  // Enhanced landing stats variables
  let oldAGL = 0, newAGL = 0;
  let calculatedVerticalSpeed = 0;
  let oldTime = Date.now(), newTime = Date.now();
  let bounces = 0;
  let isGrounded = true;
  let justLanded = false;
  let hasPassedThreshold25 = false;
  let teleportDetectionActive = false;

  // Flight path tracking and teleportation detection
  let flightPath = [];
  let lastPosition = null;
  let lastPositionTime = null;
  let teleportWarnings = 0;
  let flightTerminated = false;
  let resumeGracePeriod = false;
  let resumeGraceTimer = null;
  let lastMapPathLength = 0;
  let pathGapDetected = false;

  // ====== Load airports database ======
  fetch("https://raw.githubusercontent.com/mwgg/Airports/master/airports.json")
    .then(r => r.json())
    .then(data => {
      airportsDB = Object.entries(data).map(([icao, info]) => ({
        icao,
        lat: info.lat,
        lon: info.lon,
        tz: info.tz || null,
        name: info.name || "",
        city: info.city || "",
        country: info.country || ""
      }));
      console.log(`✅ Loaded ${airportsDB.length} airports`);
    })
    .catch(err => console.error("❌ Airport DB load failed:", err));

  // ====== UTILITY FUNCTIONS ======

  function getNearestAirport(lat, lon) {
    if (!airportsDB.length) return { icao: "UNKNOWN" };
    let nearest = null, minDist = Infinity;
    for (const ap of airportsDB) {
      const dLat = (ap.lat - lat) * Math.PI / 180;
      const dLon = (ap.lon - lon) * Math.PI / 180;
      const a = Math.sin(dLat/2) ** 2 +
        Math.cos(lat * Math.PI/180) * Math.cos(ap.lat * Math.PI/180) *
        Math.sin(dLon/2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const dist = 6371 * c;
      if (dist < minDist) {
        minDist = dist;
        nearest = ap;
      }
    }
    if (nearest && minDist > 30) return null;
    return nearest || null;
  }

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  function getAircraftName() {
    let raw = geofs?.aircraft?.instance?.aircraftRecord?.name || "Unknown";
    return raw.replace(/^\([^)]*\)\s*/, "");
  }

  function formatTimeWithTimezone(timestamp, airportData) {
    let timeZone = 'UTC';
    let suffix = 'UTC';

    if (airportData && airportData.tz) {
      timeZone = airportData.tz;
      try {
        const date = new Date(timestamp);
        const timezoneName = date.toLocaleDateString('en', {
          timeZone: timeZone,
          timeZoneName: 'short'
        }).split(', ')[1] || timeZone.split('/')[1] || 'LT';
        suffix = timezoneName;
      } catch (e) {
        console.warn(`Invalid timezone ${timeZone}, falling back to UTC.`);
        timeZone = 'UTC';
        suffix = 'UTC';
      }
    }

    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    return `${fmt.format(new Date(timestamp))} ${suffix}`;
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
      minWidth: '300px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      opacity: '0',
      transform: 'translateX(100%)',
      transition: 'all 0.3s ease-in-out'
    });
    switch(type) {
      case 'crash': toast.style.background = 'linear-gradient(135deg, #ff4444, #cc0000)'; break;
      case 'success': toast.style.background = 'linear-gradient(135deg, #00ff44, #00cc00)'; break;
      case 'warning': toast.style.background = 'linear-gradient(135deg, #ffaa00, #ff8800)'; break;
      default: toast.style.background = 'linear-gradient(135deg, #5c0632, #7b0843)'; // Qatar theme for info
    }
    toast.innerHTML = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(0)'; }, 10);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => { if (document.body.contains(toast)) document.body.removeChild(toast); }, 300);
    }, duration);
  }

  // ====== SESSION & TELEPORTATION ======

  function checkTeleportation(lat, lon, altitude) {
    if (!lastPosition || !flightStarted || flightTerminated) return false;
    if (resumeGracePeriod) return false;
    if (!teleportDetectionActive) return false;

    const now = Date.now();
    const timeDiff = (now - lastPositionTime) / 1000;

    if (timeDiff < 1) return false;
    if (timeDiff > 10) return false;

    const distance = calculateDistance(lastPosition.lat, lastPosition.lon, lat, lon);
    const altChange = Math.abs(altitude - lastPosition.altitude);

    const maxRealisticDistance = timeDiff * 0.6;
    const maxRealisticAltChange = timeDiff * 200;

    if (distance > maxRealisticDistance && altChange > maxRealisticAltChange) {
      return true;
    }
    return false;
  }

  function handleTeleportation() {
    teleportWarnings++;

    if (teleportWarnings === 1) {
      showToast(
        "⚠️ TELEPORTATION DETECTED<br>Warning 1/2: Flight continues with note<br>Next teleport will terminate flight!",
        'warning',
        6000
      );
      console.warn("🚨 First teleportation warning issued");
    } else if (teleportWarnings >= 2) {
      flightTerminated = true;
      showToast(
        "🚫 FLIGHT TERMINATED<br>Multiple teleportations detected<br>Flight will not be logged",
        'crash',
        8000
      );
      console.error("❌ Flight terminated due to repeated teleportation");

      // Send termination message to all selected Discord webhooks
      const urls = getSelectedWebhookURLs();
      const selectedAirlineNames = getSelectedAirlines(); // Get names
      const codeshareInfo = selectedAirlineNames.join(', '); // Create string

      if (urls.length > 0) {
        urls.forEach(url => sendTerminationToDiscord(url, codeshareInfo)); // Pass info
      } else {
        console.warn("No airline selected. Termination notice not sent.");
      }

      setTimeout(() => {
        if (monitorInterval) {
          clearInterval(monitorInterval);
          monitorInterval = null;
        }
        clearSession();
        resetPanel();
      }, 500);

      alert("⚠️ Flight Terminated\n\nMultiple teleportations detected. This flight will not be logged.\n\nPlease fly realistically without using location reset or slew mode.");
    }
  }

  function updateFlightPath(lat, lon, altitude) {
    const now = Date.now();

    if (typeof flight !== 'undefined' && flight.recorder && flight.recorder.mapPath) {
      const currentMapPathLength = flight.recorder.mapPath.length;
      if (currentMapPathLength < lastMapPathLength && lastMapPathLength > 1) {
        pathGapDetected = true;
      } else if (currentMapPathLength === 1 && lastMapPathLength > 2 && !pathGapDetected) {
        console.warn(`🚨 PATH COLLAPSE DETECTED: ${lastMapPathLength} paths → 1 path (teleportation signature)`);
        handleTeleportation();
        if (flightTerminated) {
          lastMapPathLength = currentMapPathLength;
          return;
        }
      } else if (currentMapPathLength > lastMapPathLength) {
        pathGapDetected = false;
      }
      lastMapPathLength = currentMapPathLength;
    }

    if (flightStarted && lastPosition && !flightTerminated) {
      if (checkTeleportation(lat, lon, altitude)) {
        handleTeleportation();
        if (flightTerminated) return;
      }
    }

    lastPosition = { lat, lon, altitude };
    lastPositionTime = now;

    if (!flightPath.length || (now - flightPath[flightPath.length - 1].time) > 5000) {
      flightPath.push({
        lat: lat,
        lon: lon,
        alt: altitude,
        time: now
      });

      if (flightPath.length % 10 === 0) {
        saveSession();
      }
    }
  }

  function saveSession() {
    const session = {
      flightStarted,
      flightStartTime,
      departureICAO,
      callsign: callsignInput?.value.trim() || "Unknown",
      pilotName: pilotNameInput?.value.trim() || "Unknown", // Save pilot name
      discordId: discordIdInput?.value.trim() || "Unknown", // Save discord ID
      aircraft: getAircraftName(),
      firstGroundContact,
      departureAirportData,
      flightPath: flightPath.slice(-50),
      teleportWarnings: teleportWarnings,
      timestamp: Date.now()
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
    const icao = prompt(`❓ ${type} airport not found in database.\nLocation: ${locationStr}\n\nPlease enter the ICAO code manually (or leave empty for UNKNOWN):`);
    return icao ? icao.toUpperCase().trim() : "UNKNOWN";
  }

  // ====== AIRLINE & CODESHARE LOGIC ======

  function saveAirlines(airlines) {
    localStorage.setItem(AIRLINES_KEY, JSON.stringify(airlines));
  }

  function loadAirlines() {
    const stored = localStorage.getItem(AIRLINES_KEY);
    let airlines;
    if (stored) {
      airlines = JSON.parse(stored);
      // Upgrade logic for older data formats
      const firstKey = Object.keys(airlines)[0];
      if (firstKey && typeof airlines[firstKey] === 'string') {
        console.log("📦 Upgrading airline data format (string to object)...");
        const upgraded = {};
        for (const [name, webhook] of Object.entries(airlines)) {
          upgraded[name] = {
            webhook: webhook,
            icao: name === 'Default' ? 'GFS' : 'UNK',
            iata: name === 'Default' ? 'GF' : 'UK'
          };
        }
        airlines = upgraded;
        saveAirlines(airlines);
      } else if (firstKey && typeof airlines[firstKey] === 'object' && !airlines[firstKey].iata) {
        console.log("📦 Adding IATA field to existing airlines...");
        for (const [name, data] of Object.entries(airlines)) {
          if (data && typeof data === 'object' && !data.iata) {
            data.iata = data.icao ? data.icao.substring(0, 2) : 'UK';
          }
        }
        saveAirlines(airlines);
      }
    } else {
      airlines = {
        "Default": {
          webhook: WEBHOOK_URL,
          icao: "GFS",
          iata: "GF"
        }
      };
    }
    return airlines;
  }

  function saveLastAirlines() {
    const selectedNames = getSelectedAirlines();
    localStorage.setItem(LAST_AIRLINES_KEY, JSON.stringify(selectedNames));
    console.log(`💾 Saved airline selection: ${selectedNames.join(', ')}`);
  }

  function loadLastAirlines() {
    const raw = localStorage.getItem(LAST_AIRLINES_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  function addNewAirline() {
    const name = prompt("Enter airline name:");
    if (!name) return;

    const icao = prompt("Enter airline ICAO code (e.g., EVA, CAL, CPA):");
    if (!icao) return;

    const iata = prompt("Enter airline IATA code (e.g., BR, CI, CX):");
    if (!iata) return;

    const webhook = prompt("Enter Discord webhook URL:");
    if (!webhook || !webhook.includes("discord.com/api/webhooks/")) {
      alert("Invalid webhook URL!");
      return;
    }

    const airlines = loadAirlines();
    airlines[name] = {
      webhook: webhook,
      icao: icao.toUpperCase().trim(),
      iata: iata.toUpperCase().trim()
    };
    saveAirlines(airlines);
    updateAirlineList();
    alert(`Added airline: ${name} (${icao.toUpperCase()}/${iata.toUpperCase()})`);
  }

  function editAirline() {
    const airlines = loadAirlines();
    const airlineNames = Object.keys(airlines);
    if (airlineNames.length === 0) {
      alert("No airlines to edit!");
      return;
    }
    const airlineList = airlineNames.map(name => `${name} (${airlines[name].icao}/${airlines[name].iata})`).join("\n");
    const selected = prompt(`Enter airline name to edit:\n${airlineList}`);
    if (!selected || !airlines[selected]) {
      alert("Airline not found!");
      return;
    }

    const currentData = airlines[selected];
    const newName = prompt(`Enter new airline name (current: ${selected}):`, selected);
    if (!newName) return;
    const newICAO = prompt(`Enter new ICAO code (current: ${currentData.icao}):`, currentData.icao);
    if (!newICAO) return;
    const newIATA = prompt(`Enter new IATA code (current: ${currentData.iata}):`, currentData.iata);
    if (!newIATA) return;
    const newWebhook = prompt(`Enter new webhook URL (current: ${currentData.webhook}):`, currentData.webhook);
    if (!newWebhook || !newWebhook.includes("discord.com/api/webhooks/")) {
      alert("Invalid webhook URL!");
      return;
    }

    if (newName !== selected) {
      delete airlines[selected];
    }
    airlines[newName] = {
      webhook: newWebhook,
      icao: newICAO.toUpperCase().trim(),
      iata: newIATA.toUpperCase().trim()
    };

    saveAirlines(airlines);
    updateAirlineList();
    alert(`Updated airline: ${newName} (${newICAO.toUpperCase()}/${newIATA.toUpperCase()})`);
  }

  function removeAirline() {
    const airlines = loadAirlines();
    const airlineNames = Object.keys(airlines);
    if (airlineNames.length === 0) {
      alert("No airlines to remove!");
      return;
    }
    const airlineList = airlineNames.map(name => `${name} (${airlines[name].icao}/${airlines[name].iata})`).join("\n");
    const selected = prompt(`Enter airline name to remove:\n${airlineList}`);
    if (selected && airlines[selected]) {
      if (Object.keys(airlines).length === 1) {
        alert("Cannot remove the last airline!");
        return;
      }
      delete airlines[selected];
      saveAirlines(airlines);
      updateAirlineList();
      alert(`Removed airline: ${selected}`);
    } else {
      alert("Airline not found!");
    }
  }

  function updateAirlineList() {
    const airlines = loadAirlines();
    const lastAirlines = loadLastAirlines();
    airlineListContainer.innerHTML = "";

    if (Object.keys(airlines).length === 0) {
        airlineListContainer.innerHTML = `<span class="saw-no-airlines">No airlines configured. Please add one.</span>`;
        return;
    }

    for (const [name, data] of Object.entries(airlines)) {
      const item = document.createElement("div");
      item.className = "saw-airline-item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `saw-airline-${name}`;
      checkbox.setAttribute('data-airline-name', name);
      if (lastAirlines.includes(name)) {
        checkbox.checked = true;
      }

      const label = document.createElement("label");
      label.htmlFor = `saw-airline-${name}`;
      label.textContent = `${name} (${data.icao}/${data.iata})`;

      item.appendChild(checkbox);
      item.appendChild(label);
      airlineListContainer.appendChild(item);
    }
  }

  function getSelectedAirlines() {
    const selected = [];
    airlineListContainer.querySelectorAll('input[type="checkbox"]:checked').forEach(chk => {
      selected.push(chk.getAttribute('data-airline-name'));
    });
    return selected;
  }

  function getSelectedAirlineData() {
    const airlines = loadAirlines();
    const selectedNames = getSelectedAirlines();
    const selectedData = [];
    selectedNames.forEach(name => {
        if (airlines[name]) {
            selectedData.push(airlines[name]);
        }
    });
    return selectedData;
  }

  function getSelectedWebhookURLs() {
    return getSelectedAirlineData().map(data => data.webhook);
  }

  // ====== DISCORD LOGGING ======

  function sendTerminationToDiscord(webhookUrl, codeshareInfo = "") {
    if (!callsignInput || !flightStartTime || !departureICAO) {
      console.warn("⚠️ Cannot send termination - missing flight data");
      return;
    }

    const pilotCallsign = callsignInput.value.trim().toUpperCase() || "Unknown";
    const pilotName = pilotNameInput?.value.trim() || geofs?.userRecord?.callsign || "Unknown";
    const discordId = discordIdInput?.value.trim() || "Not Set";
    const aircraft = getAircraftName();
    const durationMin = Math.round((Date.now() - flightStartTime) / 60000);
    const hours = Math.floor(durationMin / 60);
    const minutes = durationMin % 60;
    const formattedDuration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    const fields = [
      {
        name: "👤 Pilot",
        value: `**Name**: ${pilotName}\n**Discord**: ${discordId}`,
        inline: true
      },
      {
        name: "✈️ Flight",
        value: `**Callsign**: ${pilotCallsign}\n**Aircraft**: ${aircraft}`,
        inline: true
      },
      { name: "📍 Route", value: `**Departure**: ${departureICAO}\n**Arrival**: N/A`, inline: true },
      { name: "⏱️ Flight Time", value: `${formattedDuration}`, inline: true },
      {
        name: "⚠️ Termination Reason",
        value: `**Multiple teleportations detected**\nFlight integrity compromised after 2 warnings. This flight has been voided.`,
        inline: false
      }
    ];

    if (codeshareInfo) {
        fields.push({
            name: "🌐 Intended Airlines",
            value: codeshareInfo,
            inline: false
        });
    }

    const message = {
      embeds: [{
        title: "🚫 Flight Terminated - GeoFS",
        color: 0xD63031, // Red
        fields: fields,
        timestamp: new Date().toISOString(),
        thumbnail: {
            url: "https://img.icons8.com/fluency/48/000000/cancel--v1.png" // A termination/cancel icon
        },
        footer: { text: "GeoFS Flight Logger | Flight Not Logged" }
      }]
    };

    console.log(`📤 Sending termination notice to ${webhookUrl.substring(0, 40)}...`);
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message)
    }).then(() => console.log("✅ Termination notice sent"))
      .catch(err => console.error("❌ Failed to send termination notice:", err));
  }

  function sendLogToDiscord(data, webhookUrl) {
    const takeoffTime = formatTimeWithTimezone(data.takeoff, departureAirportData);
    const landingTime = formatTimeWithTimezone(data.landing, arrivalAirportData);

    let embedColor;
    switch(data.landingQuality) {
      case "SUPER BUTTER": embedColor = 0x00B894; break; // Greener
      case "BUTTER": embedColor = 0x55E6C1; break; // Lighter Green
      case "ACCEPTABLE": embedColor = 0xFDCB6E; break; // Yellow
      case "HARD": embedColor = 0xE17055; break; // Orange
      case "CRASH": embedColor = 0xD63031; break; // Red
      default: embedColor = 0x5c0632; break; // Qatar theme
    }
    
    // Add "CRASH" text to title if it was a crash
    const title = data.landingQuality === "CRASH" ? "🛫 Flight PIREP (CRASH) - GeoFS" : "🛫 Flight PIREP - GeoFS";

    const fields = [
      // Row 1: Pilot & Flight
      {
        name: "👤 Pilot",
        value: `**Name**: ${data.pilotName}\n**Discord**: ${data.discordId}`,
        inline: true
      },
      {
        name: "✈️ Flight",
        value: `**Callsign**: ${data.pilotCallsign}\n**Aircraft**: ${data.aircraft}`,
        inline: true
      },
      // Row 2: Route & Time
      {
        name: "📍 Route",
        value: `**${data.dep}** → **${data.arr}**`,
        inline: false
      },
      {
        name: "🛫 Departure",
        value: takeoffTime,
        inline: true
      },
      {
        name: "🛬 Arrival",
        value: landingTime,
        inline: true
      },
      {
        name: "⏱️ Flight Time",
        value: data.duration,
        inline: true
      },
      // Row 3: Landing Stats
      {
        name: "📊 Landing V/S",
        value: `\`${data.vs} fpm\``,
        inline: true
      },
      {
        name: "💥 G-Force",
        value: `\`${data.gforce} G\``,
        inline: true
      },
      {
        name: "🔄 Bounces",
        value: `\`${data.bounces}\``,
        inline: true
      },
      // Row 4: Speeds at Touchdown
      {
        name: "💨 True Airspeed",
        value: `\`${data.ktrue} kts\``,
        inline: true
      },
      {
        name: "👟 Ground Speed",
        value: `\`${data.gs} kts\``,
        inline: true
      },
      {
        name: "🏆 Result",
        value: `**${data.landingQuality}**`,
        inline: true
      },
    ];

    // Row 5: Codeshare info, if present
    if (data.codeshareAirlines) {
        fields.push({
            name: "🌐 Codeshare Airlines",
            value: data.codeshareAirlines,
            inline: false
        });
    }

    if (data.teleportWarnings > 0) {
      fields.push({
        name: "⚠️ Flight Integrity Alert",
        value: `**Teleportation detected**: ${data.teleportWarnings} time(s)\n*Flight continued with noted violation*`,
        inline: false
      });
      embedColor = 0xFFA500; // Override color to warning
    }

    const message = {
      embeds: [{
        title: title,
        color: embedColor,
        fields: fields,
        timestamp: new Date().toISOString(),
        thumbnail: {
            url: "https://img.icons8.com/external-flatart-icons-flat-flatarticons/64/000000/external-plane-shipping-and-delivery-flatart-icons-flat-flatarticons.png" // A generic, clean plane icon
        },
        footer: {
          text: "GeoFS SAW Flight Logger" + (data.teleportWarnings > 0 ? " | ⚠️ Integrity Warning" : "")
        }
      }]
    };

    console.log(`📤 Sending flight log to ${webhookUrl.substring(0, 40)}...`);
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message)
    }).then(() => console.log("✅ Flight log sent"))
      .catch(err => console.error("❌ Failed to send flight log:", err));
  }

  // ====== FLIGHT MONITORING ======

  function updateCalVertS() {
    if ((typeof geofs.animation.values != 'undefined' &&
         !geofs.isPaused()) &&
        ((geofs.animation.values.altitude !== undefined && geofs.animation.values.groundElevationFeet !== undefined) ? ((geofs.animation.values.altitude - geofs.animation.values.groundElevationFeet) + (geofs.aircraft.instance.collisionPoints[geofs.aircraft.instance.collisionPoints.length - 2].worldPosition[2]*3.2808399)) : 'N/A') !== oldAGL) {
        newAGL = (geofs.animation.values.altitude !== undefined && geofs.animation.values.groundElevationFeet !== undefined) ? ((geofs.animation.values.altitude - geofs.animation.values.groundElevationFeet) + (geofs.aircraft.instance.collisionPoints[geofs.aircraft.instance.collisionPoints.length - 2].worldPosition[2]*3.2808399)) : 'N/A';
        newTime = Date.now();
        calculatedVerticalSpeed = (newAGL - oldAGL) * (60000/(newTime - oldTime));
        oldAGL = (geofs.animation.values.altitude !== undefined && geofs.animation.values.groundElevationFeet !== undefined) ? ((geofs.animation.values.altitude - geofs.animation.values.groundElevationFeet) + (geofs.aircraft.instance.collisionPoints[geofs.aircraft.instance.collisionPoints.length - 2].worldPosition[2]*3.2808399)) : 'N/A';
        oldTime = Date.now();
    }
  }

  function monitorFlight() {
    if (!geofs?.animation?.values || !geofs.aircraft?.instance) return;
    if (flightTerminated) return;

    const values = geofs.animation.values;
    const onGround = values.groundContact;
    const altitudeFt = values.altitude * 3.28084;
    const terrainFt = geofs.api?.map?.getTerrainAltitude?.() * 3.28084 || 0;
    const agl = altitudeFt - terrainFt;
    const [lat, lon] = geofs.aircraft.instance.llaLocation || [values.latitude, values.longitude];
    const now = Date.now();

    if (flightStarted) {
      updateFlightPath(lat, lon, altitudeFt);
      if (flightTerminated) return;
    }

    const enhancedAGL = (values.altitude !== undefined && values.groundElevationFeet !== undefined) ?
      ((values.altitude - values.groundElevationFeet) +
       (geofs.aircraft.instance.collisionPoints[geofs.aircraft.instance.collisionPoints.length - 2].worldPosition[2] * 3.2808399))
      : 'N/A';

    if (enhancedAGL < 500) {
      justLanded = onGround && !isGrounded;
      isGrounded = onGround;
    }

    // Start flight
    if (!flightStarted && !onGround && agl > 50) {
      flightStarted = true;
      flightStartTime = now;
      hasPassedThreshold25 = false;
      teleportDetectionActive = true;
      const nearestAirport = getNearestAirport(lat, lon);
      if (nearestAirport) {
        departureICAO = nearestAirport.icao;
        departureAirportData = nearestAirport;
      } else {
        departureICAO = promptForAirportICAO("Departure", lat, lon);
        departureAirportData = null;
      }

      flightPath = [];
      lastPosition = { lat, lon, altitude: altitudeFt };
      lastPositionTime = now;
      teleportWarnings = 0;
      flightTerminated = false;
      resumeGracePeriod = false;
      lastMapPathLength = 0;
      pathGapDetected = false;
      if (resumeGraceTimer) clearTimeout(resumeGraceTimer);

      saveSession();
      console.log(`🛫 Departure detected at ${departureICAO} (AGL > 50ft)`);
      console.log("📡 Teleportation detection ACTIVE");
      if (panelUI) {
        if (window.instruments && window.instruments.visible) {
          panelUI.classList.add('saw-hidden');
        }
      }
    }

    // Activate teleportation detection on resume
    if (flightStarted && resumeGracePeriod && !teleportDetectionActive) {
      teleportDetectionActive = true;
      console.log("📡 Teleportation detection ACTIVE (after resume)");
    }

    // Landing detection
    const elapsed = (now - flightStartTime) / 1000;
    const landingStatsActive = typeof window.statsOpen !== 'undefined' && window.statsOpen;

    if (flightStarted && !firstGroundContact && onGround && landingStatsActive && enhancedAGL >= 0 && enhancedAGL < 500) {
      if (elapsed < 1) return;

      const enhancedAGLNow = (values.altitude !== undefined && values.groundElevationFeet !== undefined) ?
        ((values.altitude - values.groundElevationFeet) +
         (geofs.aircraft.instance.collisionPoints[geofs.aircraft.instance.collisionPoints.length - 2].worldPosition[2] * 3.2808399))
        : 'N/A';
      const preciseCalVertS = (enhancedAGLNow - oldAGL) * (60000 / (now - oldTime));
      const vs = (typeof window.calVertS !== 'undefined' && Math.abs(window.calVertS) < 5000)
        ? window.calVertS
        : Math.abs(preciseCalVertS) < 5000
        ? preciseCalVertS
        : values.verticalSpeed || 0;

      let quality;
      if (vs >= -50) quality = "SUPER BUTTER";
      else if (vs >= -200) quality = "BUTTER";
      else if (vs >= -500) quality = "ACCEPTABLE";
      else if (vs >= -1000) quality = "HARD";
      else quality = "CRASH";

      if (vs <= -1000 || vs > 200) {
        showToast("💥 CRASH DETECTED<br>Logging crash report...", 'crash', 4000);
        const nearestAirport = getNearestAirport(lat, lon);
        arrivalICAO = "Crash";
        arrivalAirportData = nearestAirport || null;
      } else {
        const nearestAirport = getNearestAirport(lat, lon);
        if (nearestAirport) {
          arrivalICAO = nearestAirport.icao;
          arrivalAirportData = nearestAirport;
        } else {
          arrivalICAO = promptForAirportICAO("Arrival", lat, lon);
          arrivalAirportData = null;
        }
      }

      console.log(`🛬 Arrival detected at ${arrivalICAO}`);
      console.log(`📊 Landing data: V/S = ${vs.toFixed(1)} fpm, Quality = ${quality}`);
      if (teleportWarnings > 0) {
        console.warn(`⚠️ Teleportation warnings: ${teleportWarnings}`);
      }

      firstGroundContact = true;
      firstGroundTime = now;

      const g = (values.accZ / 9.80665).toFixed(2);
      const gs = values.groundSpeedKnt.toFixed(1);
      const tas = geofs.aircraft.instance.trueAirSpeed?.toFixed(1) || "N/A";
      const landingBounces = typeof window.bounces !== 'undefined' ? window.bounces : bounces;

      const pilotCallsign = callsignInput.value.trim().toUpperCase() || "Unknown";
      const pilotName = pilotNameInput?.value.trim() || geofs?.userRecord?.callsign || "Unknown";
      const discordId = discordIdInput?.value.trim() || "Not Set";
      const aircraft = getAircraftName();
      const durationMin = Math.round((firstGroundTime - flightStartTime) / 60000);
      const hours = Math.floor(durationMin / 60);
      const minutes = durationMin % 60;
      const formattedDuration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      
      const selectedAirlineNames = getSelectedAirlines(); // Get the names
      const codeshareInfo = selectedAirlineNames.join(', '); // Add to logData

      const logData = {
        pilotCallsign,
        pilotName,
        discordId,
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
        bounces: landingBounces,
        teleportWarnings: teleportWarnings,
        codeshareAirlines: codeshareInfo // Add codeshare string
      };

      // Send log to all selected webhooks
      const urls = getSelectedWebhookURLs();
      if (urls.length > 0) {
        console.log(`📤 Sending log to ${urls.length} airline(s)...`);
        urls.forEach(url => {
          sendLogToDiscord(logData, url);
        });
      } else {
        console.warn("⚠️ No airlines selected, flight log will not be sent.");
        showToast("⚠️ No airlines selected<br>Flight log was not sent.", 'warning', 5000);
      }

      saveSession(); // Save final state
      clearSession(); // Clear for next flight
      resetPanel();

      if (panelUI) {
        panelUI.classList.remove('saw-hidden');
      }

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
    departureICAO = "UNKNOWN";
    arrivalICAO = "UNKNOWN";
    departureAirportData = null;
    arrivalAirportData = null;
    hasPassedThreshold25 = false;
    teleportDetectionActive = false;

    bounces = 0;
    isGrounded = true;
    justLanded = false;
    calculatedVerticalSpeed = 0;
    oldAGL = 0;
    newAGL = 0;
    oldTime = Date.now();
    newTime = Date.now();

    flightPath = [];
    lastPosition = null;
    lastPositionTime = null;
    teleportWarnings = 0;
    flightTerminated = false;
    resumeGracePeriod = false;
    lastMapPathLength = 0;
    pathGapDetected = false;
    if (resumeGraceTimer) clearTimeout(resumeGraceTimer);

    callsignInput.value = "";
    // Note: We DO NOT clear pilotNameInput or discordIdInput, as they are user settings.
    startButton.disabled = true;
    startButton.innerText = "📋 Start Logger";
    resumeBtn.disabled = false;
    resumeBtn.innerText = "⏪ Resume Last Flight";

    if (panelUI) {
      if (window.instruments && window.instruments.visible) {
        panelUI.classList.remove('saw-hidden');
      }
    }
  }

  // ====== UI & INITIALIZATION ======

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
      alignItems: 'center'
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
      fontFamily: 'sans-serif'
    });

    dialog.innerHTML = `
      <h2 style="color: #5c0632; margin-top: 0;">GeoFS SAW Flight Logger - Terms of Use</h2>
      <div style="background: #2a2a2a; padding: 20px; border-radius: 5px; margin: 20px 0; max-height: 300px; overflow-y: auto;">
        <h3>📜 Terms and Conditions of the SAW System</h3>
        <div style="background: #333; padding: 15px; border-left: 4px solid #5c0632; margin: 15px 0;">
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
        <button id="agreeBtn" style="background: #5c0632; color: white; border: none; padding: 12px 25px; margin: 0 10px; border-radius: 5px; cursor: pointer; font-size: 16px;">✅ I Agree</button>
        <button id="disagreeBtn" style="background: #ff4444; color: white; border: none; padding: 12px 25px; margin: 0 10px; border-radius: 5px; cursor: pointer; font-size: 16px;">❌ I Disagree</button>
      </div>
      <p style="text-align: center; margin-top: 20px; font-size: 12px; color: #888;">Selecting "I Disagree" will prevent the use of GeoFS SAW Flight Logger</p>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    document.getElementById('agreeBtn').addEventListener('click', function() {
      setTermsAgreed();
      document.body.removeChild(overlay);
      console.log("✅ User agreed to SAW system terms of use");
      createSidePanel();
      setTimeout(updatePanelVisibility, 1000);
    });

    document.getElementById('disagreeBtn').addEventListener('click', function() {
      document.body.removeChild(overlay);
      console.log("❌ User disagreed to SAW system terms of use - Flight Logger disabled");
      alert("You chose to disagree with the terms of use. GeoFS SAW Flight Logger will not be activated.");
    });

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        e.preventDefault();
      }
    });
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
      :root {
        --saw-bg: rgba(30, 30, 30, 0.95);
        --saw-header-bg: #5c0632; /* Qatar Burgundy */
        --saw-border: #5c0632;
        --saw-text: #eee;
        --saw-text-label: #aaa;
        --saw-input-bg: #222;
        --saw-input-border: #555;
        --saw-btn-primary: #5c0632; /* Qatar Burgundy */
        --saw-btn-primary-hover: #7b0843;
        --saw-btn-secondary: #3a3a3a;
        --saw-btn-secondary-hover: #4a4a4a;
        --saw-btn-green: #008800;
        --saw-btn-green-hover: #00aa00;
        --saw-btn-blue: #0066aa;
        --saw-btn-blue-hover: #0088cc;
        --saw-btn-red: #aa0000;
        --saw-btn-red-hover: #cc0000;
      }
      #sawLoggerPanel {
        position: absolute;
        top: 150px; /* Changed from bottom */
        left: 10px;
        width: 250px; /* Slightly wider for new fields */
        background: var(--saw-bg);
        color: var(--saw-text);
        border: 1px solid var(--saw-border);
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        font-family: sans-serif;
        font-size: 14px;
        z-index: 21;
        overflow: hidden;
        transition: opacity 0.3s ease, transform 0.3s ease;
        opacity: 1;
        display: block;
      }
      #sawLoggerPanel.saw-hidden {
        opacity: 0;
        pointer-events: none;
        transform: scale(0.95);
      }
      #sawLoggerPanel .saw-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: var(--saw-header-bg);
        border-bottom: 1px solid var(--saw-border);
        cursor: grab; /* For dragging */
      }
      #sawLoggerPanel .saw-header:active {
        cursor: grabbing;
      }
      #sawLoggerPanel .saw-header span {
        font-weight: bold;
        color: #FFFFFF; /* White text on burgundy */
      }
      #sawLoggerPanel .saw-header #sawToggleBtn {
        width: 20px;
        height: 20px;
        background: var(--saw-btn-secondary);
        color: var(--saw-text);
        border: 1px solid var(--saw-border);
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        line-height: 16px;
        padding: 0;
      }
      #sawLoggerPanel .saw-content {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px; /* Increased gap */
        transition: all 0.3s ease-out;
        max-height: 600px; /* Increased max height */
      }
      #sawLoggerPanel.saw-collapsed .saw-content {
        max-height: 0;
        padding-top: 0;
        padding-bottom: 0;
        overflow: hidden;
      }
      #sawLoggerPanel label {
        font-size: 12px;
        color: var(--saw-text-label);
        font-weight: bold;
        margin-bottom: -5px; /* Tighten label to input */
      }
      #sawLoggerPanel input[type="text"],
      #sawLoggerPanel select {
        width: 100%;
        padding: 8px;
        background: var(--saw-input-bg);
        border: 1px solid var(--saw-input-border);
        border-radius: 4px;
        color: var(--saw-text);
        box-sizing: border-box;
      }
      #sawLoggerPanel input[type="text"]:focus {
        border-color: var(--saw-btn-primary);
        outline: none;
      }
      #sawLoggerPanel #sawAirlineList {
        max-height: 120px; /* Adjusted height */
        overflow-y: auto;
        background: var(--saw-input-bg);
        border: 1px solid var(--saw-input-border);
        border-radius: 4px;
        padding: 8px;
      }
      #sawLoggerPanel .saw-airline-item {
        display: flex;
        align-items: center;
        padding: 4px;
      }
      #sawLoggerPanel .saw-airline-item input[type="checkbox"] {
        margin-right: 8px;
        accent-color: var(--saw-btn-primary); /* Qatar theme */
      }
      #sawLoggerPanel .saw-airline-item label {
        font-size: 13px;
        color: var(--saw-text);
        font-weight: normal;
        cursor: pointer;
        margin-bottom: 0;
      }
      #sawLoggerPanel .saw-no-airlines {
        font-style: italic;
        color: var(--saw-text-label);
      }
      #sawLoggerPanel .saw-airline-buttons {
        display: flex;
        gap: 5px;
      }
      #sawLoggerPanel button {
        padding: 8px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        transition: background-color 0.2s ease;
      }
      #sawLoggerPanel .saw-airline-buttons button {
        flex: 1;
        font-size: 11px;
        color: white;
      }
      #sawAddAirline { background: var(--saw-btn-green); }
      #sawAddAirline:hover { background: var(--saw-btn-green-hover); }
      #sawEditAirline { background: var(--saw-btn-blue); }
      #sawEditAirline:hover { background: var(--saw-btn-blue-hover); }
      #sawRemoveAirline { background: var(--saw-btn-red); }
      #sawRemoveAirline:hover { background: var(--saw-btn-red-hover); }

      #sawStartButton {
        background: var(--saw-btn-primary);
        color: white;
        font-size: 14px;
      }
      #sawStartButton:hover { background: var(--saw-btn-primary-hover); }
      #sawStartButton:disabled {
        background: var(--saw-btn-secondary);
        color: var(--saw-text-label);
        cursor: not-allowed;
      }
      #sawResumeButton {
        background: var(--saw-btn-secondary);
        color: white;
      }
      #sawResumeButton:hover { background: var(--saw-btn-secondary-hover); }
      #sawResumeButton:disabled {
        background: var(--saw-btn-green);
        color: white;
        cursor: not-allowed;
      }
    `;
    document.head.appendChild(style);
  }

  function disableKeyPropagation(input) {
    ["keydown", "keyup", "keypress"].forEach(ev =>
      input.addEventListener(ev, e => e.stopPropagation())
    );
  }

  function makeDraggable(panel, header) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    header.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e = e || window.event;
      e.preventDefault();
      // Get the mouse cursor position at startup:
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      // Call a function whenever the cursor moves:
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();
      // Calculate the new cursor position:
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      // Set the element's new position:
      panel.style.top = (panel.offsetTop - pos2) + "px";
      panel.style.left = (panel.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
      // Stop moving when mouse button is released:
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  function createSidePanel() {
    injectStyles();

    panelUI = document.createElement("div");
    panelUI.id = "sawLoggerPanel";

    panelUI.innerHTML = `
      <div class="saw-header">
        <span>SAW Flight Logger</span>
        <button id="sawToggleBtn">−</button>
      </div>
      <div class="saw-content">
        <label for="sawPilotName">Pilot Name:</label>
        <input id="sawPilotName" type="text" placeholder="e.g., John Doe">

        <label for="sawDiscordId">Discord ID:</label>
        <input id="sawDiscordId" type="text" placeholder="e.g., 1234567890">

        <label for="sawCallsign">Flight Callsign:</label>
        <input id="sawCallsign" type="text" placeholder="e.g., QTR123">
        
        <label>Airlines (Codeshare):</label>
        <div id="sawAirlineList">
          <!-- Checkboxes will be populated here -->
        </div>
        
        <div class="saw-airline-buttons">
          <button id="sawAddAirline">+ Add</button>
          <button id="sawEditAirline">✎ Edit</button>
          <button id="sawRemoveAirline">− Remove</button>
        </div>
        
        <button id="sawStartButton" disabled>📋 Start Logger</button>
        <button id="sawResumeButton">⏪ Resume Last Flight</button>
      </div>
    `;
    document.body.appendChild(panelUI);

    // Assign UI elements to variables
    contentUI = panelUI.querySelector('.saw-content');
    const headerUI = panelUI.querySelector('.saw-header');
    callsignInput = document.getElementById('sawCallsign');
    pilotNameInput = document.getElementById('sawPilotName'); // New
    discordIdInput = document.getElementById('sawDiscordId'); // New
    airlineListContainer = document.getElementById('sawAirlineList');
    startButton = document.getElementById('sawStartButton');
    resumeBtn = document.getElementById('sawResumeButton');
    toggleBtn = document.getElementById('sawToggleBtn');

    // --- Load saved user settings ---
    pilotNameInput.value = localStorage.getItem(PILOT_NAME_KEY) || "";
    discordIdInput.value = localStorage.getItem(DISCORD_ID_KEY) || "";

    // --- Add event listeners ---
    makeDraggable(panelUI, headerUI); // Make panel draggable

    document.getElementById('sawAddAirline').onclick = addNewAirline;
    document.getElementById('sawEditAirline').onclick = editAirline;
    document.getElementById('sawRemoveAirline').onclick = removeAirline;

    disableKeyPropagation(callsignInput);
    disableKeyPropagation(pilotNameInput);
    disableKeyPropagation(discordIdInput);

    callsignInput.onkeyup = () => {
      startButton.disabled = callsignInput.value.trim() === "";
    };
    // Save user settings on change
    pilotNameInput.onkeyup = () => localStorage.setItem(PILOT_NAME_KEY, pilotNameInput.value.trim());
    discordIdInput.onkeyup = () => localStorage.setItem(DISCORD_ID_KEY, discordIdInput.value.trim());


    airlineListContainer.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            saveLastAirlines();
        }
    });

    startButton.onclick = () => {
      if (getSelectedAirlines().length === 0) {
        alert("Please select at least one airline to log this flight.");
        return;
      }
      alert("Flight Logger activated! Start your flight when ready.");
      monitorInterval = setInterval(monitorFlight, 1000);
      setInterval(updateCalVertS, 25);
      startButton.innerText = "✅ Logger Running...";
      startButton.disabled = true;
      resumeBtn.disabled = true;
    };

    resumeBtn.onclick = () => {
      const resumeSession = loadSession();
      if (resumeSession) {
        flightStarted = true;
        flightStartTime = resumeSession.flightStartTime;
        departureICAO = resumeSession.departureICAO;
        departureAirportData = resumeSession.departureAirportData;
        firstGroundContact = resumeSession.firstGroundContact || false;
        callsignInput.value = resumeSession.callsign || "";
        pilotNameInput.value = resumeSession.pilotName || localStorage.getItem(PILOT_NAME_KEY) || ""; // Load from session
        discordIdInput.value = resumeSession.discordId || localStorage.getItem(DISCORD_ID_KEY) || ""; // Load from session


        flightPath = resumeSession.flightPath || [];
        teleportWarnings = resumeSession.teleportWarnings || 0;
        flightTerminated = false;
        resumeGracePeriod = true;

        resumeGraceTimer = setTimeout(() => {
          resumeGracePeriod = false;
          console.log("📍 Resume grace period ended, teleportation detection active");
        }, 5000);

        if (flightPath.length > 0) {
          const lastPoint = flightPath[flightPath.length - 1];
          lastPosition = { lat: lastPoint.lat, lon: lastPoint.lon, altitude: lastPoint.alt };
          lastPositionTime = lastPoint.time;
          console.log("🔗 Path continuity restored from saved data");
        }

        monitorInterval = setInterval(monitorFlight, 1000);
        setInterval(updateCalVertS, 25);
        resumeBtn.innerText = "✅ Resumed!";
        resumeBtn.disabled = true;
        startButton.innerText = "✅ Logger Running...";
        startButton.disabled = true;
        console.log("🔁 Resumed flight session.");
        if (panelUI && window.instruments && window.instruments.visible) {
          panelUI.classList.add('saw-hidden');
        }
      } else {
        alert("❌ No previous session found.");
      }
    };

    toggleBtn.onclick = () => {
        panelUI.classList.toggle('saw-collapsed');
        toggleBtn.innerText = panelUI.classList.contains('saw-collapsed') ? '+' : '−';
    };

    updateAirlineList();
  }

  function updatePanelVisibility() {
    if (panelUI) {
      const isVisible = (window.instruments && window.instruments.visible);
      panelUI.style.display = isVisible ? "block" : "none";
      
      // Also hide if flight is started
      if (isVisible && flightStarted && !flightTerminated && !firstGroundContact) {
         panelUI.classList.add('saw-hidden');
      } else if (isVisible && (!flightStarted || firstGroundContact)) {
         panelUI.classList.remove('saw-hidden');
      }
    }
    setTimeout(updatePanelVisibility, 100);
  }

  function checkAutoResume() {
    const resumeSession = loadSession();
    if (resumeSession && resumeSession.flightStarted && resumeSession.callsign) {
      const sessionAge = (Date.now() - resumeSession.timestamp) / (1000 * 60);

      console.log(`🔄 Auto-resuming flight session: ${resumeSession.callsign} from ${resumeSession.departureICAO}`);

      flightStarted = true;
      flightStartTime = resumeSession.flightStartTime;
      departureICAO = resumeSession.departureICAO;
      departureAirportData = resumeSession.departureAirportData;
      firstGroundContact = resumeSession.firstGroundContact || false;

      flightPath = resumeSession.flightPath || [];
      teleportWarnings = resumeSession.teleportWarnings || 0;
      flightTerminated = false;
      resumeGracePeriod = true;

      resumeGraceTimer = setTimeout(() => {
        resumeGracePeriod = false;
        console.log("📍 Resume grace period ended, teleportation detection active");
      }, 5000);

      if (flightPath.length > 0) {
        const lastPoint = flightPath[flightPath.length - 1];
        lastPosition = { lat: lastPoint.lat, lon: lastPoint.lon, altitude: lastPoint.alt };
        lastPositionTime = lastPoint.time;
        console.log("🔗 Path continuity restored from saved data");
      }

      if (callsignInput) {
        callsignInput.value = resumeSession.callsign || "";
      }
      if (pilotNameInput) {
        pilotNameInput.value = resumeSession.pilotName || localStorage.getItem(PILOT_NAME_KEY) || "";
      }
      if (discordIdInput) {
        discordIdInput.value = resumeSession.discordId || localStorage.getItem(DISCORD_ID_KEY) || "";
      }


      monitorInterval = setInterval(monitorFlight, 1000);
      setInterval(updateCalVertS, 25);

      if (startButton) {
        startButton.innerText = "✅ Logger Running...";
        startButton.disabled = true;
      }
      if (resumeBtn) {
        resumeBtn.innerText = "✅ Resumed!";
        resumeBtn.disabled = true;
      }

      const flightDuration = Math.floor((Date.now() - flightStartTime) / 60000);
      showToast(
        `🔄 Flight auto-resumed: ${resumeSession.callsign}<br>📍 From: ${resumeSession.departureICAO}<br>⏱️ Duration: ${flightDuration}min`,
        'success',
        6000
      );

      if (panelUI && window.instruments && window.instruments.visible) {
        panelUI.classList.add('saw-hidden');
      }
      return true;
    }
    return false;
  }

  // ====== SCRIPT ENTRYPOINT ======
  window.addEventListener("load", () => {
    console.log("✅ GeoFS SAW Flight Logger (Qatar Theme, Codeshare) Loaded");

    if (hasAgreedToTerms()) {
      console.log("✅ SAW system terms already agreed, initializing Flight Logger");
      createSidePanel();
      setTimeout(updatePanelVisibility, 1000);
      setTimeout(() => {
        checkAutoResume();
      }, 2000);
    } else {
      console.log("📋 First time user, showing SAW system terms of use");
      setTimeout(showTermsDialog, 2000);
    }
  });

})();
