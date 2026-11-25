(() => {
  const view = document.querySelector('#map-view');
  const listView = document.querySelector('main');
  const canvas = document.querySelector('#trip-map');
  const panel = document.querySelector('#map-stop-panel');
  const panelCard = document.querySelector('#map-stop-card');
  const status = document.querySelector('#map-status');
  const locate = document.querySelector('#map-location');
  const fit = document.querySelector('#map-reset');
  const filters = [...document.querySelectorAll('#map-filters button')];
  const stops = [...listView.querySelectorAll('[data-point]')].map(card => ({
    card,
    name: card.querySelector('summary h3').textContent.trim(),
    photo: card.querySelector('summary .cover').src,
    point: card.dataset.point.split(',').map(Number),
    kind: card.classList.contains('activity') ? 'activity' : 'beach',
    directions: card.querySelector('a[href^="https://www.google.com/maps/"]').href,
    admission: card.querySelector('summary .admission-price')?.textContent.trim(),
    parking: card.querySelector('.parking-price').textContent.trim()
  }));
  let filter = 'all';
  let position;
  let map;
  let pins;
  let you;
  let loading;
  let fitOnLoad = true;
  let selected;

  function distance(point) {
    const radians = degrees => degrees * Math.PI / 180;
    const lat = radians(point[0] - position[0]);
    const lon = radians(point[1] - position[1]);
    const chord = Math.sin(lat / 2) ** 2 +
      Math.cos(radians(position[0])) * Math.cos(radians(point[0])) * Math.sin(lon / 2) ** 2;
    return 3958.76 * 2 * Math.asin(Math.sqrt(Math.min(1, chord)));
  }

  function visibleStops() {
    return stops.filter(stop => !stop.card.classList.contains('is-minimized') &&
      (filter === 'all' || stop.kind === filter));
  }

  function directions(stop) {
    const link = document.createElement('a');
    link.href = stop.directions;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Directions ↗';
    link.setAttribute('aria-label', 'Directions to ' + stop.name);
    return link;
  }

  function restoreCard() {
    if (!selected) return;
    const { card, placeholder, wasOpen, wasHidden } = selected;
    placeholder.replaceWith(card);
    card.open = wasOpen && !card.classList.contains('is-minimized');
    card.hidden = wasHidden;
    selected = undefined;
    panel.hidden = true;
  }

  function showCard(stop) {
    if (selected?.card === stop.card) return;
    restoreCard();
    const { card } = stop;
    const placeholder = document.createComment('Trip stop list position');
    selected = { card, placeholder, wasOpen: card.open, wasHidden: card.hidden };
    card.before(placeholder);
    panelCard.append(card);
    card.hidden = false;
    card.open = true;
    panel.hidden = false;
  }

  function stopPopup(stop) {
    const popup = document.createElement('div');
    popup.className = 'map-popup';
    const photo = document.createElement('img');
    photo.className = 'map-popup-photo';
    photo.src = stop.photo;
    photo.alt = '';
    photo.width = 48;
    photo.height = 40;
    const name = document.createElement('strong');
    name.textContent = stop.name;
    const detail = document.createElement('small');
    detail.textContent = (position ? distance(stop.point).toFixed(1) + ' mi straight-line · ' : '') + stop.parking;
    const body = document.createElement('div');
    body.append(name);
    if (stop.admission) {
      const admission = document.createElement('small');
      admission.textContent = stop.admission === 'Free admission' ? stop.admission : 'Admission · ' + stop.admission;
      body.append(admission);
    }
    body.append(detail, directions(stop));
    popup.append(photo, body);
    return popup;
  }

  function pinIcon(kind) {
    return L.divIcon({
      className: 'trip-marker',
      html: '<div class="map-pin ' + kind + '-pin"></div>',
      iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -12]
    });
  }

  function fitPins() {
    const points = visibleStops().map(stop => stop.point);
    if (points.length) map.fitBounds(points, { padding: [24, 24], maxZoom: 15 });
  }

  function render() {
    if (!pins) return;
    const visible = visibleStops();
    if (selected && !visible.some(stop => stop.card === selected.card)) restoreCard();
    pins.clearLayers();
    for (const stop of visible) {
      const marker = L.marker(stop.point, { icon: pinIcon(stop.kind), title: stop.name, alt: stop.name })
        .addTo(pins).bindPopup(() => stopPopup(stop), { maxWidth: 235 });
      marker.on('popupopen', () => showCard(stop));
    }
  }

  function centerLocation() {
    if (!map) return;
    if (you) you.setLatLng(position);
    else you = L.marker(position, { icon: pinIcon('location'), title: 'Your location', alt: 'Your location' })
      .bindPopup('Your location').addTo(map);
    const nearest = visibleStops().sort((a, b) => distance(a.point) - distance(b.point))[0];
    if (nearest && distance(nearest.point) < 35) {
      map.fitBounds([position, nearest.point], { padding: [32, 32], maxZoom: 15 });
    } else if (!nearest) {
      map.setView(position, 13);
    } else {
      fitPins();
    }
  }

  function loadMap() {
    if (loading) return loading;
    const version = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet';
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = version + '.css';
    const script = document.createElement('script');
    script.src = version + '.js';
    loading = Promise.all([css, script].map(element => new Promise((resolve, reject) => {
      element.onload = resolve;
      element.onerror = reject;
      document.head.append(element);
    }))).then(() => {
      map = L.map(canvas, { scrollWheelZoom: false }).setView([34, -118.38], 9);
      pins = L.layerGroup().addTo(map);
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
      }).addTo(map);
      tiles.once('tileerror', () => {
        if (!status.textContent) status.textContent = 'Some map tiles couldn’t load. Tap a pin for directions or switch to List view.';
      });
      fit.hidden = false;
      render();
      if (!view.hidden) sizeMap();
    }).catch(() => {
      canvas.hidden = true;
      if (!status.textContent) status.textContent = 'The map couldn’t load. Open List view to browse stops and get directions.';
    });
    return loading;
  }

  function sizeMap() {
    map.invalidateSize();
    if (!fitOnLoad) return;
    if (position) centerLocation();
    else fitPins();
    fitOnLoad = false;
  }

  function switchView() {
    const showing = location.hash === '#map';
    document.body.classList.toggle('showing-trip-map', showing);
    view.hidden = !showing;
    listView.hidden = showing;
    const mapLink = document.querySelector('#map-link');
    mapLink.textContent = showing ? 'List view' : 'Map view';
    mapLink.href = showing ? '#beaches' : '#map';
    if (showing) {
      window.scrollTo(0, 0);
      document.querySelector('#map-title').focus({ preventScroll: true });
      render();
      if (map) sizeMap();
      else loadMap();
    } else {
      restoreCard();
      if (location.hash === '#beaches') document.querySelector('#beaches-section').open = true;
      if (location.hash === '#beaches' || location.hash === '#things-to-do') {
        document.querySelector(location.hash).scrollIntoView();
      }
    }
  }

  locate.addEventListener('click', () => {
    if (!navigator.geolocation) {
      status.textContent = 'Location is unavailable in this browser.';
      return;
    }
    locate.disabled = true;
    status.textContent = 'Finding your location…';
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      position = [coords.latitude, coords.longitude];
      locate.disabled = false;
      status.textContent = 'Tap a pin to see its distance from you.';
      render();
      if (map && !view.hidden) centerLocation();
      else fitOnLoad = true;
    }, error => {
      locate.disabled = false;
      status.textContent = error.code === 1
        ? 'Allow location access in your browser settings to see nearby stops.'
        : 'Couldn’t get your location. Try again, or browse the map.';
    }, { timeout: 10000, maximumAge: 60000 });
  });
  fit.addEventListener('click', fitPins);
  for (const button of filters) {
    button.addEventListener('click', () => {
      filter = button.dataset.kind;
      filters.forEach(option => option.setAttribute('aria-pressed', String(option === button)));
      render();
      if (map && !position) fitPins();
    });
  }

  const visibility = new MutationObserver(() => {
    if (selected?.card.classList.contains('is-minimized')) restoreCard();
    if (!view.hidden) render();
  });
  stops.forEach(({ card }) => visibility.observe(card, { attributes: true, attributeFilter: ['class'] }));
  window.addEventListener('hashchange', switchView);
  switchView();
})();
