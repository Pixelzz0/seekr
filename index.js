import "dotenv/config"
import { openai, supabase } from "./config.js"
import ffmpeg from "fluent-ffmpeg"
import ffmpegBinary from "ffmpeg-static"
import fs from 'fs';
import path from "path"

ffmpeg.setFfmpegPath(ffmpegBinary)

function extractFrames(inputPath, outputDir, fps = 1) {
  fs.mkdirSync(outputDir, { recursive: true });
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions(`-vf fps=${fps}`)
      .output(`${outputDir}/frame_%04d.jpg`)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

async function analyzeFrame(imagePath, timestamp) {
  const imageData = fs.readFileSync(imagePath, { encoding: 'base64' });
  const response = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageData}`, detail: 'low' } },
        { type: 'text', text: 'Describe what is happening in this frame in 1-2 sentences.' }
      ]
    }]
  });
  return {
    timestamp,
    frame: path.basename(imagePath),
    description: response.choices[0].message.content,
    type: 'video'
  }
}

async function embedAndStore(results, fileHash) {
  console.log('Embedding and storing...');
  const embeddings = await Promise.all(
    results.map(r => openai.embeddings.create({ model: 'text-embedding-3-large', input: r.description }))
  );
  const rows = results.map((r, i) => ({
    timestamp: r.timestamp,
    frame: r.frame,
    description: r.description,
    embedding: embeddings[i].data[0].embedding,
    type: r.type ?? 'video',
    file_hash: fileHash ?? null
  }));
  const { error } = await supabase.from('seekr_media').insert(rows);
  if (error) console.error('Error storing batch:', error);
  else console.log(`Stored ${rows.length} item(s)`);
}

export async function processVideo(videoPath, fileHash) {
  const outputDir = './video-out';
  const descriptionsPath = './video-out/descriptions.json';

  // Clean previous video data
  if (fs.existsSync(descriptionsPath)) fs.unlinkSync(descriptionsPath);
  if (fs.existsSync(outputDir)) {
    fs.readdirSync(outputDir)
      .filter(f => f.endsWith('.jpg'))
      .forEach(f => fs.unlinkSync(path.join(outputDir, f)));
  }

  console.log('Extracting frames...');
  await extractFrames(videoPath, outputDir);

  const frames = fs.readdirSync(outputDir).filter(f => f.endsWith('.jpg')).sort();
  const results = [];

  console.log(`Analyzing ${frames.length} frames...`);
  let lastDescription = '';
  for (const [i, frame] of frames.entries()) {
    const result = await analyzeFrame(path.join(outputDir, frame), i);
    if (result.description === lastDescription) continue;
    lastDescription = result.description;
    console.log(`[${i}s] ${result.description}`);
    results.push(result);
  }

  fs.writeFileSync(descriptionsPath, JSON.stringify(results, null, 2));
  await embedAndStore(results, fileHash);
}

export async function processAudio(audioPath, filename, fileHash) {
  console.log('Transcribing audio...');

  const transcript = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
    prompt: 'Transcribe this audio accurately including technical terms.'
  });

  const secondMap = {};
  for (const segment of transcript.segments) {
    if (segment.no_speech_prob > 0.5) continue;
    const second = Math.floor(segment.start);
    if (!secondMap[second]) secondMap[second] = [];
    secondMap[second].push(segment.text.trim());
  }

  console.log('Processing transcript segments...');
  const results = [];
  for (const [second, texts] of Object.entries(secondMap)) {
    const description = texts.join(' ').trim();
    console.log(`[${second}s] ${description}`);
    results.push({
      timestamp: parseInt(second),
      frame: filename,
      description,
      type: 'audio'
    });
  }

  console.log(`Processed ${results.length} segments`);
  await embedAndStore(results, fileHash);
}

export async function processImages(images) {
  console.log(`Processing ${images.length} images...`);

  for (const { path: imagePath, filename, fileHash } of images) {

    const imageData = fs.readFileSync(imagePath, { encoding: 'base64' });
    const ext = path.extname(filename).slice(1).toLowerCase();
    const mimeType = ext === 'jpg' ? 'jpeg' : ext;

    const response = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:image/${mimeType};base64,${imageData}`,
              detail: 'high'
            }
          },
          { type: 'text', text: 'Describe this image in 1-2 sentences for semantic search.' }
        ]
      }]
    });

    const description = response.choices[0].message.content;
    console.log(`${filename}: ${description}`);

    await embedAndStore([{ timestamp: 0, frame: `/images/${filename}`, description, type: 'image' }], fileHash);
  }

  console.log('All images processed!');
}