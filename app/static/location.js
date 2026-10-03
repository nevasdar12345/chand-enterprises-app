/* =========================================================
   LOCATION PICKER  (100% free: Leaflet + OpenStreetMap + Nominatim)
   - "Use my current location"  -> browser GPS (needs HTTPS)
   - "Pick on map"              -> tap the map / drag the pin
   - Search a place name        -> Nominatim search
   - Fills the address box and remembers exact latitude/longitude
   ========================================================= */

const LocPicker = (() => {
    const DEFAULT_CENTER = [26.1542, 85.8918]; // Darbhanga, Bihar

    let map = null;
    let marker = null;
    let picked = null;      // { lat, lng }
    let geoTimer = null;

    const el = id => document.getElementById(id);

    function setStatus(text, isError) {
        const s = el('loc-status');
        if (!s) return;
        s.textContent = text || '';
        s.style.color = isError ? '#c62828' : '';
    }

    function updateCoords() {
        const c = el('loc-coords');
        if (!c) return;
        c.innerHTML = picked
            ? `📍 ${picked.lat.toFixed(6)}, ${picked.lng.toFixed(6)} · ` +
              `<a target="_blank" rel="noopener" ` +
              `href="https://www.google.com/maps?q=${picked.lat.toFixed(6)},${picked.lng.toFixed(6)}">` +
              `Open in Google Maps</a>`
            : '';
    }

    async function reverseGeocode(lat, lng) {
        setStatus('Getting address…');
        try {
            const url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2' +
                        `&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=en`;
            const res = await fetch(url, { headers: { Accept: 'application/json' } });
            const data = await res.json();
            const box = el('ca');
            if (data && data.display_name && box) {
                box.value = data.display_name;
                setStatus('Address filled. Please add house no. / landmark if needed.');
            } else {
                setStatus('Location saved, but address not found. Please type it.', true);
            }
        } catch (e) {
            setStatus('Location saved, but address lookup failed. Please type it.', true);
        }
    }

    function setPoint(lat, lng, opts = {}) {
        picked = { lat: Number(lat), lng: Number(lng) };
        updateCoords();
        window.dispatchEvent(new CustomEvent("locationchange", { detail: picked }));

        if (map) {
            if (!marker) {
                marker = L.marker([lat, lng], { draggable: true }).addTo(map);
                marker.on('dragend', () => {
                    const p = marker.getLatLng();
                    setPoint(p.lat, p.lng, { fromMarker: true });
                });
            } else if (!opts.fromMarker) {
                marker.setLatLng([lat, lng]);
            }
            if (opts.recenter) map.setView([lat, lng], 17);
        }

        // Nominatim allows ~1 request/second, so wait a moment after the last move
        clearTimeout(geoTimer);
        geoTimer = setTimeout(() => reverseGeocode(picked.lat, picked.lng), 700);
    }

    function openMap() {
        const wrap = el('loc-map-wrap');
        if (!wrap) return;
        wrap.style.display = 'block';

        if (typeof L === 'undefined') {
            setStatus('Map could not load. Check your internet connection.', true);
            return;
        }

        if (!map) {
            map = L.map('loc-map').setView(picked ? [picked.lat, picked.lng] : DEFAULT_CENTER, 15);
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap contributors'
            }).addTo(map);
            map.on('click', e => setPoint(e.latlng.lat, e.latlng.lng));
        }
        setTimeout(() => map.invalidateSize(), 150);
    }

    function useMyLocation() {
        if (!navigator.geolocation) {
            return setStatus('Your browser does not support location.', true);
        }
        setStatus('Finding your location…');
        navigator.geolocation.getCurrentPosition(
            pos => {
                openMap();
                setPoint(pos.coords.latitude, pos.coords.longitude, { recenter: true });
            },
            err => setStatus(
                err.code === 1
                    ? 'Location permission denied. Allow it in the browser, or pick on the map.'
                    : 'Could not get your location. Try picking on the map.',
                true
            ),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    }

    async function search() {
        const q = (el('loc-search')?.value || '').trim();
        if (!q) return;
        setStatus('Searching…');
        try {
            const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1' +
                        `&countrycodes=in&q=${encodeURIComponent(q)}`;
            const res = await fetch(url, { headers: { Accept: 'application/json' } });
            const data = await res.json();
            if (!data.length) return setStatus('Place not found. Try a nearby landmark.', true);
            openMap();
            setPoint(parseFloat(data[0].lat), parseFloat(data[0].lon), { recenter: true });
        } catch (e) {
            setStatus('Search failed. Try again.', true);
        }
    }

    function mount() {
        map = null;
        marker = null;
        picked = null;
        clearTimeout(geoTimer);
        el('loc-gps')?.addEventListener('click', useMyLocation);
        el('loc-pick')?.addEventListener('click', openMap);
        el('loc-find')?.addEventListener('click', search);
        el('loc-search')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); search(); }
        });
    }

    const html = () => `
        <div class="loc-box">
            <div class="loc-actions">
                <button type="button" id="loc-gps">📍 Use my current location</button>
                <button type="button" id="loc-pick">🗺️ Pick on map</button>
            </div>
            <div class="loc-search-row">
                <input id="loc-search" placeholder="Search area / landmark (optional)">
                <button type="button" id="loc-find">Search</button>
            </div>
            <div id="loc-map-wrap" style="display:none">
                <div id="loc-map"></div>
                <small>Tap the map or drag the pin to set the exact delivery spot.</small>
            </div>
            <div id="loc-coords" class="loc-coords"></div>
            <div id="loc-status" class="loc-status"></div>
        </div>`;

    const get = () => picked
        ? { latitude: picked.lat, longitude: picked.lng }
        : { latitude: null, longitude: null };

    return { mount, html, get };
})();
