# seekr

Semantic media search engine. Upload videos, audio, or images and search through them using natural language.

<img width="1920" height="957" alt="image" src="https://github.com/user-attachments/assets/acf101b6-056a-4908-bb75-ba3de5b5fd9f" />
<img width="1920" height="956" alt="image" src="https://github.com/user-attachments/assets/42e1d26d-31b0-459d-910d-3cbfc24f94e9" />



## How it works

```
Media File → Upload → AI Analysis → Vector Embedding → Supabase (pgvector)
                                                              ↓
                              Natural Language Query → Embed → Cosine Similarity → Results
```

- **Video** — Extracts 1 frame/sec via FFmpeg, describes each frame with GPT-5-mini, embeds descriptions, stores in Supabase. Search returns timestamps you can click to jump to.
- **Audio** — Transcribes with Whisper, segments by timestamp, embeds each segment. Search returns the exact moment in the audio.
- **Images** — Describes each image with GPT-5-mini, embeds the description. Search returns matching images ranked by similarity.

## Tech Stack

| Layer | Tool |
|---|---|
| Backend | Node.js, Express |
| AI | OpenAI (GPT-5-mini, Whisper, text-embedding-3-large) |
| Vector DB | Supabase + pgvector |
| Frame Extraction | FFmpeg (via ffmpeg-static) |
| Frontend | Vanilla HTML/CSS/JS |

## Setup

### 1. Clone

```bash
git clone https://github.com/Pixelzz0/seekr.git
cd seekr
npm install
```

### 2. Environment Variables

Create a `.env` file:

```
OPENAI_KEY=your_openai_api_key
SUPABASE_API_KEY=your_supabase_api_key
SUPABASE_URL=your_supabase_url
```

### 3. Supabase Setup

Enable the vector extension and create the table in your Supabase SQL editor:

```sql
create extension if not exists vector;

create table seekr_media (
  id bigserial primary key,
  timestamp float,
  frame text,
  description text,
  embedding vector(3072),
  type text,
  file_hash text
);

create index on seekr_media using ivfflat (embedding vector_cosine_ops);
create index idx_seekr_media_hash on seekr_media (file_hash);
```

Create the search function:

```sql
create or replace function search_frames(
  query_embedding vector(3072),
  match_count int,
  filter_file text default null,
  filter_type text default null
)
returns table (
  id bigint,
  timestamp float,
  frame text,
  description text,
  type text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    sm.id,
    sm.timestamp,
    sm.frame,
    sm.description,
    sm.type,
    1 - (sm.embedding <=> query_embedding) as similarity
  from seekr_media sm
  where
    (filter_type is null or sm.type = filter_type)
    and (filter_file is null or sm.frame = filter_file)
  order by sm.embedding <=> query_embedding
  limit match_count;
end;
$$;
```

### 4. Run

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000)

## Features

- **Duplicate detection** via SHA-256 file hashing — no wasted API calls
- **Semantic search** across all media types
- **Click-to-seek** — click a video/audio result to jump to that timestamp
- **Mobile responsive** — works on phones and tablets

## Project Structure

```
├── config.js        # OpenAI + Supabase client setup
├── index.js         # Media processing (frames, transcription, embeddings)
├── server.js        # Express API routes + file handling
├── public/
│   └── index.html   # Frontend (HTML + CSS + JS)
├── video-in/        # Uploaded videos
├── audio-in/        # Uploaded audio
├── image-in/        # Uploaded images
├── video-out/       # Extracted frames (temporary)
└── .env             # API keys (not committed)
```

## API Endpoints

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload and process a video |
| `POST` | `/api/upload-audio` | Upload and process audio |
| `POST` | `/api/upload-images` | Upload and process images |
| `GET` | `/api/search?q=...&type=...` | Semantic search (type: video/audio/image) |
| `GET` | `/api/videos` | List uploaded video/audio files |
| `GET` | `/api/random-images` | Get 5 random indexed images |

## License

ISC
