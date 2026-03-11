import express from 'express';
import multer from 'multer';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { openai, supabase } from './config.js';
import { processVideo, processAudio, processImages } from './index.js';

const ALLOWED_VIDEO_EXT = /\.(mp4|mov|avi|webm|mkv)$/i;
const ALLOWED_AUDIO_EXT = /\.(mp3|mp4|mpeg|mpga|m4a|wav|webm)$/i;
const ALLOWED_IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif)$/i;

function sanitizeFilename(original) {
  const ext = path.extname(original);
  const base = path.basename(original, ext).replace(/[^a-zA-Z0-9_\-]/g, '_');
  return `${base}_${Date.now()}${ext}`;
}

function hashFile(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function isDuplicate(fileHash) {
  const { data } = await supabase
    .from('seekr_media')
    .select('id')
    .eq('file_hash', fileHash)
    .limit(1);
  return data?.length > 0;
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/video', express.static('video-in'));
app.use('/audio', express.static('audio-in'));
app.use('/images', express.static('image-in'));

fs.mkdirSync('video-in', { recursive: true });
fs.mkdirSync('audio-in', { recursive: true });
fs.mkdirSync('image-in', { recursive: true });

const videoUpload = multer({ dest: 'video-in/' });
const audioUpload = multer({ dest: 'audio-in/', limits: { fileSize: 25 * 1024 * 1024 } });
const imageUpload = multer({ dest: 'image-in/' });

let isVideoProcessing = false;
let isAudioProcessing = false;
let isImageProcessing = false;

app.post('/api/upload', videoUpload.single('video'), async (req, res) => {
  if (isVideoProcessing) return res.status(429).json({ error: 'Video already processing, please wait...' });
  if (!ALLOWED_VIDEO_EXT.test(req.file.originalname)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Invalid video file type' });
  }
  isVideoProcessing = true;
  const safeName = sanitizeFilename(req.file.originalname);
  const newPath = path.join('video-in', safeName);
  fs.renameSync(req.file.path, newPath);
  try {
    const fileHash = hashFile(newPath);
    if (await isDuplicate(fileHash)) {
      console.log(`[DUPLICATE] Video rejected: ${req.file.originalname} (hash: ${fileHash.slice(0, 12)}...)`);
      fs.unlinkSync(newPath);
      isVideoProcessing = false;
      return res.status(409).json({ error: 'This video has already been uploaded and processed' });
    }
    console.log(`[NEW] Processing video: ${safeName} (hash: ${fileHash.slice(0, 12)}...)`);
    await processVideo(`./${newPath}`, fileHash);
    res.json({ success: true, filename: safeName, type: 'video' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    isVideoProcessing = false;
  }
});

app.post('/api/upload-audio', audioUpload.single('audio'), async (req, res) => {
  if (isAudioProcessing) return res.status(429).json({ error: 'Audio already processing, please wait...' });
  if (!ALLOWED_AUDIO_EXT.test(req.file.originalname)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Invalid audio file type' });
  }
  isAudioProcessing = true;
  const safeName = sanitizeFilename(req.file.originalname);
  const newPath = path.join('audio-in', safeName);
  fs.renameSync(req.file.path, newPath);
  try {
    const fileHash = hashFile(newPath);
    if (await isDuplicate(fileHash)) {
      console.log(`[DUPLICATE] Audio rejected: ${req.file.originalname} (hash: ${fileHash.slice(0, 12)}...)`);
      fs.unlinkSync(newPath);
      isAudioProcessing = false;
      return res.status(409).json({ error: 'This audio has already been uploaded and processed' });
    }
    console.log(`[NEW] Processing audio: ${safeName} (hash: ${fileHash.slice(0, 12)}...)`);
    await processAudio(`./${newPath}`, safeName, fileHash);
    res.json({ success: true, filename: safeName, type: 'audio' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    isAudioProcessing = false;
  }
});

app.post('/api/upload-images', imageUpload.array('images', 50), async (req, res) => {
  if (isImageProcessing) return res.status(429).json({ error: 'Images already processing, please wait...' });
  isImageProcessing = true;
  try {
    const results = [];
    for (const file of req.files) {
      if (!ALLOWED_IMAGE_EXT.test(file.originalname)) {
        fs.unlinkSync(file.path);
        continue;
      }
      const safeName = sanitizeFilename(file.originalname);
      const newPath = path.join('image-in', safeName);
      fs.renameSync(file.path, newPath);
      const fileHash = hashFile(newPath);
      if (await isDuplicate(fileHash)) {
        console.log(`[DUPLICATE] Image skipped: ${file.originalname} (hash: ${fileHash.slice(0, 12)}...)`);
        fs.unlinkSync(newPath);
        continue;
      }
      console.log(`[NEW] Processing image: ${safeName} (hash: ${fileHash.slice(0, 12)}...)`);
      results.push({ path: newPath, filename: safeName, fileHash });
    }
    await processImages(results);
    res.json({ success: true, count: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    isImageProcessing = false;
  }
});

app.get('/api/videos', async (req, res) => {
  const videos = fs.readdirSync('./video-in')
    .filter(f => /\.(mp4|mov|avi|webm)$/i.test(f));
  const audios = fs.readdirSync('./audio-in')
    .filter(f => /\.(mp3|mp4|mpeg|mpga|m4a|wav|webm)$/i.test(f));
  res.json({ videos, audios });
});

app.get('/api/random-images', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('seekr_media')
      .select('frame, description')
      .eq('type', 'image')
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });
    const shuffled = data.sort(() => Math.random() - 0.5).slice(0, 5);
    res.json(shuffled);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/search', async (req, res) => {
  const { q, type } = req.query;
  if (!q) return res.status(400).json({ error: 'No query provided' });
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: q
    });
    const { data, error } = await supabase.rpc('search_frames', {
      query_embedding: embeddingResponse.data[0].embedding,
      match_count: type === 'image' ? 5 : 2,
      filter_file: null,
      filter_type: type ?? null
    });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.listen(3000, () => console.log('Server running at http://localhost:3000'));