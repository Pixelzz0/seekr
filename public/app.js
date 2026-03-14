const videoFile = document.getElementById('videoFile');
const audioFile = document.getElementById('audioFile');
const imageFiles = document.getElementById('imageFiles');
const videoStatus = document.getElementById('videoStatus');
const audioStatus = document.getElementById('audioStatus');
const imageStatus = document.getElementById('imageStatus');
const playerWrap = document.getElementById('playerWrap');
const videoPlayer = document.getElementById('videoPlayer');
const audioPlayerWrap = document.getElementById('audioPlayerWrap');
const audioPlayer = document.getElementById('audioPlayer');
const audioCardName = document.getElementById('audioCardName');
const videoSearch = document.getElementById('videoSearch');
const audioSearch = document.getElementById('audioSearch');
const imageSearch = document.getElementById('imageSearch');
const videoSearchBtn = document.getElementById('videoSearchBtn');
const audioSearchBtn = document.getElementById('audioSearchBtn');
const imageSearchBtn = document.getElementById('imageSearchBtn');
const videoResults = document.getElementById('videoResults');
const audioResults = document.getElementById('audioResults');
const imageViewer = document.getElementById('imageViewer');
const imageViewerImg = document.getElementById('imageViewerImg');
const imageViewerDesc = document.getElementById('imageViewerDesc');
const imageViewerCount = document.getElementById('imageViewerCount');
const imagePrevBtn = document.getElementById('imagePrevBtn');
const imageNextBtn = document.getElementById('imageNextBtn');
const videoBadge = document.getElementById('videoBadge');
const audioBadge = document.getElementById('audioBadge');
const imageBadge = document.getElementById('imageBadge');
const imagePreviewGrid = document.getElementById('imagePreviewGrid');

let imageResultsData = [];
let currentImageIndex = 0;

function setStatus(el, msg, type) {
  el.textContent = msg;
  el.className = `status visible ${type}`;
}

function showImage(index) {
  const r = imageResultsData[index];
  imageViewerImg.src = r.frame;
  imageViewerDesc.textContent = r.description;
  imageViewerCount.textContent = `${index + 1}/${imageResultsData.length}`;
  imagePrevBtn.disabled = index === 0;
  imageNextBtn.disabled = index === imageResultsData.length - 1;
  currentImageIndex = index;
}

imagePrevBtn.addEventListener('click', () => { if (currentImageIndex > 0) showImage(currentImageIndex - 1); });
imageNextBtn.addEventListener('click', () => { if (currentImageIndex < imageResultsData.length - 1) showImage(currentImageIndex + 1); });

async function loadExisting() {
  try {
    const res = await fetch('/api/videos');
    const { videos, audios } = await res.json();
    if (videos.length > 0) {
      const filename = videos[videos.length - 1];
      videoPlayer.src = `/video/${filename}`;
      playerWrap.classList.add('visible');
      videoSearch.disabled = false;
      videoSearchBtn.disabled = false;
      videoBadge.textContent = filename;
      setStatus(videoStatus, `loaded: ${filename}`, 'done');
    }
    if (audios.length > 0) {
      const filename = audios[audios.length - 1];
      audioPlayer.src = `/audio/${filename}`;
      audioPlayerWrap.classList.add('visible');
      audioCardName.textContent = filename;
      audioSearch.disabled = false;
      audioSearchBtn.disabled = false;
      audioBadge.textContent = filename;
      setStatus(audioStatus, `loaded: ${filename}`, 'done audio');
    }
  } catch (err) { console.error(err); }
}

function renderImageGrid(images, showSimilarity = false) {
  imagePreviewGrid.innerHTML = '';
  images.forEach((img, i) => {
    const card = document.createElement('div');
    card.className = 'image-preview-card';
    const thumb = document.createElement('img');
    thumb.src = img.frame;
    thumb.alt = '';
    const caption = document.createElement('p');
    caption.textContent = img.description;
    card.appendChild(thumb);
    card.appendChild(caption);
    if (showSimilarity && img.similarity != null) {
      const badge = document.createElement('span');
      badge.className = 'image-sim-badge';
      badge.textContent = `${(img.similarity * 100).toFixed(0)}%`;
      card.appendChild(badge);
    }
    card.addEventListener('click', () => {
      imageResultsData = images;
      imageViewer.classList.add('visible');
      showImage(i);
    });
    imagePreviewGrid.appendChild(card);
  });
}

async function loadAllImages() {
  try {
    const res = await fetch('/api/images');
    const images = await res.json();
    renderImageGrid(images);
  } catch (err) { console.error('Failed to load images:', err); }
}

loadExisting();
loadAllImages();

videoFile.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  videoBadge.textContent = 'uploading...';
  setStatus(videoStatus, `uploading ${file.name} — 0%`, 'processing');
  const formData = new FormData();
  formData.append('video', file);
  try {
    const data = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          setStatus(videoStatus, pct < 100
            ? `uploading ${file.name} — ${pct}%`
            : `upload complete — processing ${file.name}...`, 'processing');
          if (pct === 100) videoBadge.textContent = 'processing...';
        }
      });
      xhr.addEventListener('load', () => {
        const res = JSON.parse(xhr.responseText);
        if (xhr.status === 429) { setStatus(videoStatus, 'another file is processing — please wait', 'error'); videoBadge.textContent = 'error'; return reject(null); }
        if (xhr.status === 409) {
          if (res.existingFile) {
            videoPlayer.src = `/video/${res.existingFile}`;
            playerWrap.classList.add('visible');
            videoSearch.disabled = false;
            videoSearchBtn.disabled = false;
            videoBadge.textContent = res.existingFile;
            setStatus(videoStatus, 'already indexed — loaded for searching', 'done');
          } else {
            setStatus(videoStatus, 'this video has already been uploaded and processed', 'error');
            videoBadge.textContent = 'duplicate';
          }
          console.warn('[DUPLICATE]', file.name, '— already indexed');
          return reject(null);
        }
        if (xhr.status >= 400) return reject(new Error(res.error));
        resolve(res);
      });
      xhr.addEventListener('error', () => reject(new Error('Upload failed')));
      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    });
    videoPlayer.src = `/video/${data.filename}`;
    playerWrap.classList.add('visible');
    videoSearch.disabled = false;
    videoSearchBtn.disabled = false;
    videoBadge.textContent = data.filename;
    setStatus(videoStatus, 'ready — start searching', 'done');
  } catch (err) {
    if (err) { setStatus(videoStatus, `error: ${err.message}`, 'error'); videoBadge.textContent = 'error'; }
  }
});

audioFile.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) { setStatus(audioStatus, 'file too large — max 25MB', 'error'); return; }
  audioBadge.textContent = 'transcribing...';
  setStatus(audioStatus, `transcribing ${file.name}...`, 'processing');
  const formData = new FormData();
  formData.append('audio', file);
  try {
    const res = await fetch('/api/upload-audio', { method: 'POST', body: formData });
    const data = await res.json();
    if (res.status === 429) { setStatus(audioStatus, 'another file is processing — please wait', 'error'); audioBadge.textContent = 'error'; return; }
    if (res.status === 409) {
      if (data.existingFile) {
        audioPlayer.src = `/audio/${data.existingFile}`;
        audioPlayerWrap.classList.add('visible');
        audioCardName.textContent = data.existingFile;
        audioSearch.disabled = false;
        audioSearchBtn.disabled = false;
        audioBadge.textContent = data.existingFile;
        setStatus(audioStatus, 'already indexed — loaded for searching', 'done audio');
      } else {
        setStatus(audioStatus, 'this audio has already been uploaded and processed', 'error');
        audioBadge.textContent = 'duplicate';
      }
      console.warn('[DUPLICATE]', file.name, '— already indexed');
      return;
    }
    if (!res.ok) throw new Error(data.error);
    audioPlayer.src = `/audio/${data.filename}`;
    audioPlayerWrap.classList.add('visible');
    audioCardName.textContent = data.filename;
    audioSearch.disabled = false;
    audioSearchBtn.disabled = false;
    audioBadge.textContent = data.filename;
    setStatus(audioStatus, 'ready — start searching', 'done audio');
  } catch (err) {
    setStatus(audioStatus, `error: ${err.message}`, 'error');
    audioBadge.textContent = 'error';
  }
});

imageFiles.addEventListener('change', async (e) => {
  const files = [...e.target.files];
  if (!files.length) return;
  imageBadge.textContent = 'processing...';
  setStatus(imageStatus, `processing ${files.length} image(s)...`, 'processing');
  const formData = new FormData();
  files.forEach(f => formData.append('images', f));
  try {
    const res = await fetch('/api/upload-images', { method: 'POST', body: formData });
    const data = await res.json();
    if (res.status === 429) { setStatus(imageStatus, 'another file is processing — please wait', 'error'); imageBadge.textContent = 'error'; return; }
    if (res.status === 409) { setStatus(imageStatus, 'these images have already been uploaded and processed', 'error'); imageBadge.textContent = 'duplicate'; console.warn('[DUPLICATE] images — already indexed'); return; }
    if (!res.ok) throw new Error(data.error);
    imageBadge.textContent = `${data.count} image(s) indexed`;
    setStatus(imageStatus, `${data.count} image(s) processed and indexed`, 'done image');
    loadAllImages();
  } catch (err) {
    setStatus(imageStatus, `error: ${err.message}`, 'error');
    imageBadge.textContent = 'error';
  }
});

videoSearchBtn.addEventListener('click', () => search('video'));
videoSearch.addEventListener('keydown', e => { if (e.key === 'Enter') search('video'); });
audioSearchBtn.addEventListener('click', () => search('audio'));
audioSearch.addEventListener('keydown', e => { if (e.key === 'Enter') search('audio'); });
imageSearchBtn.addEventListener('click', () => searchImages());
imageSearch.addEventListener('keydown', e => { if (e.key === 'Enter') searchImages(); });
imageSearch.addEventListener('input', e => { if (!e.target.value) { loadAllImages(); imageViewer.classList.remove('visible'); } });

async function search(type) {
  const input = type === 'video' ? videoSearch : audioSearch;
  const btn = type === 'video' ? videoSearchBtn : audioSearchBtn;
  const resultsEl = type === 'video' ? videoResults : audioResults;
  const player = type === 'video' ? videoPlayer : audioPlayer;
  const playerEl = type === 'video' ? playerWrap : audioPlayerWrap;

  const q = input.value.trim();
  if (!q) return;
  btn.disabled = true;
  btn.textContent = '...';
  resultsEl.innerHTML = '';

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${type}`);
    const data = await res.json();
    if (!data.length) { resultsEl.innerHTML = '<div class="no-results">no results found</div>'; return; }
    data.forEach(r => {
      const minutes = Math.floor(r.timestamp / 60);
      const seconds = r.timestamp % 60;
      const timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`;
      const el = document.createElement('div');
      el.className = `result-item ${type}`;
      const timeDiv = document.createElement('div');
      timeDiv.className = 'result-time';
      timeDiv.textContent = timeStr;
      const descDiv = document.createElement('div');
      descDiv.className = 'result-desc';
      descDiv.textContent = r.description;
      const pctDiv = document.createElement('div');
      pctDiv.className = 'result-pct';
      pctDiv.textContent = `${(r.similarity * 100).toFixed(0)}%`;
      el.appendChild(timeDiv);
      el.appendChild(descDiv);
      el.appendChild(pctDiv);
      el.addEventListener('click', () => {
        const isPaused = player.paused;
        player.currentTime = r.timestamp;
        if (!isPaused) player.play();
        playerEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      resultsEl.appendChild(el);
    });
  } catch (err) {
    const statusEl = type === 'video' ? videoStatus : audioStatus;
    setStatus(statusEl, `search error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'search';
  }
}

async function searchImages() {
  const q = imageSearch.value.trim();
  if (!q) { loadAllImages(); imageViewer.classList.remove('visible'); return; }
  imageSearchBtn.disabled = true;
  imageSearchBtn.textContent = '...';
  imageViewer.classList.remove('visible');
  imageResultsData = [];

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=image`);
    const data = await res.json();
    if (!data.length) { setStatus(imageStatus, 'no results found', 'error'); renderImageGrid([]); return; }
    // results already sorted by similarity descending from the DB
    imageResultsData = data;
    renderImageGrid(data, true);
    imageViewer.classList.add('visible');
    showImage(0);
    setStatus(imageStatus, `${data.length} result(s) — ranked by relevance`, 'done image');
  } catch (err) {
    setStatus(imageStatus, `search error: ${err.message}`, 'error');
  } finally {
    imageSearchBtn.disabled = false;
    imageSearchBtn.textContent = 'search';
  }
}
